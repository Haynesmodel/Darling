const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

async function importTypeScript(relativePath) {
  const result = await esbuild.build({
    entryPoints: [path.join(process.cwd(), relativePath)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const modules = Promise.all([
  importTypeScript('src/tables/table-saved-views.ts'),
  importTypeScript('src/tables/table-filter-functions.ts'),
  importTypeScript('src/tables/table-quick-filters.ts'),
  importTypeScript('src/tables/rows/history-game-rows.ts'),
  importTypeScript('src/tables/table-registry.ts'),
]);

class FakeStorage {
  constructor() {
    this.values = new Map();
    this.failWrites = false;
  }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.failWrites) throw new Error('quota');
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

function portableState(overrides = {}) {
  return {
    sorting: [{ id: 'date', desc: true }],
    columnFilters: [{ id: 'opponent', value: 'Singer' }],
    quickFilters: ['wins'],
    columnVisibility: { round: false },
    columnPinning: { left: ['date'], right: [] },
    pageSize: 50,
    ...overrides,
  };
}

test('saved views survive malformed storage and validate schema/table IDs', async () => {
  const [saved] = await modules;
  const storage = new FakeStorage();
  storage.setItem(saved.TABLE_VIEWS_STORAGE_KEY, '{broken');
  assert.deepEqual(saved.readSavedViews(storage), []);

  storage.setItem(saved.TABLE_VIEWS_STORAGE_KEY, JSON.stringify([
    { id: 'old', version: 2, tableId: 'history-games', name: 'Old', state: portableState() },
    { id: 'unknown', version: 1, tableId: 'not-a-table', name: 'Unknown', state: portableState() },
  ]));
  assert.deepEqual(saved.readSavedViews(storage), []);
});

test('saved views require explicit replacement, reject rename collisions, and handle quota errors', async () => {
  const [saved] = await modules;
  const storage = new FakeStorage();
  const first = saved.saveView('history-games', ' Playoff losses ', portableState(), { owner: 'Joe', games: [{ id: 'raw' }], isLeague: false }, storage);
  assert.equal(first.name, 'Playoff losses');
  assert.deepEqual(first.context, { owner: 'Joe' });
  assert.equal(saved.saveView('history-games', 'playoff losses', portableState({ pageSize: 100 }), { owner: 'Joe' }, storage), null);
  assert.equal(saved.readSavedViews(storage)[0].state.pageSize, 50);

  const replacement = saved.saveView(
    'history-games',
    'playoff losses',
    portableState({ pageSize: 100 }),
    { owner: 'Joe' },
    storage,
    { replaceExisting: true },
  );
  assert.equal(replacement.id, first.id);
  assert.equal(saved.readSavedViews(storage).length, 1);
  assert.equal(saved.readSavedViews(storage)[0].state.pageSize, 100);

  const second = saved.saveView('history-games', 'Singer audit', portableState(), { owner: 'Joel' }, storage);
  assert.equal(saved.renameView(second.id, 'PLAYOFF LOSSES', storage), false);
  assert.equal(saved.readSavedViews(storage).find(view => view.id === second.id).name, 'Singer audit');
  assert.equal(saved.renameView(first.id, 'Joe playoff losses', storage), true);
  assert.equal(saved.readSavedViews(storage).find(view => view.id === first.id).name, 'Joe playoff losses');
  assert.equal(saved.deleteView(first.id, storage), true);
  assert.equal(saved.deleteView(second.id, storage), true);
  assert.deepEqual(saved.readSavedViews(storage), []);

  storage.failWrites = true;
  assert.equal(saved.saveView('history-games', 'Quota', portableState(), {}, storage), null);
});

test('saved view contexts compare only portable owner, rivalry, and season fields', async () => {
  const [saved] = await modules;
  assert.equal(saved.tableContextsMatch({ owner: 'Joe', games: [] }, { owner: 'Joe' }), true);
  assert.equal(saved.tableContextsMatch({ owner: 'Joel' }, { owner: 'Joe' }), false);
  assert.equal(saved.tableContextsMatch({ rivalryA: 'Joe', rivalryB: 'Joel' }, { rivalryA: 'Joe', rivalryB: 'Joel' }), true);
  assert.equal(saved.tableContextsMatch({ rivalryA: 'Joe', rivalryB: 'Shap' }, { rivalryA: 'Joe', rivalryB: 'Joel' }), false);
});

test('portable saved state drops stale columns and quick filters safely', async () => {
  const [saved] = await modules;
  const state = portableState({
    sorting: [{ id: 'missing', desc: true }, { id: 'date', desc: true }],
    columnFilters: [{ id: 'missing', value: 'x' }, { id: 'opponent', value: 'Joe' }],
    quickFilters: ['missing', 'wins'],
    columnVisibility: { missing: false, opponent: true },
    columnPinning: { left: ['missing', 'date'], right: ['missing'] },
  });
  assert.deepEqual(saved.sanitizePortableState(state, ['date', 'opponent'], ['wins']), {
    sorting: [{ id: 'date', desc: true }],
    columnFilters: [{ id: 'opponent', value: 'Joe' }],
    quickFilters: ['wins'],
    columnVisibility: { opponent: true },
    columnPinning: { left: ['date'], right: [] },
    pageSize: 50,
  });
});

test('typed table filters cover text, enums, ranges, records, and game predicates', async () => {
  const [, filters] = await modules;
  assert.equal(filters.textFilterValue('Singer', 'ING'), true);
  assert.equal(filters.enumFilterValue('W', ['L', 'W']), true);
  assert.equal(filters.numberRangeFilterValue(150, { min: 140, max: 160 }), true);
  assert.equal(filters.numberRangeFilterValue(130, { min: 140 }), false);
  assert.equal(filters.parseRecord('8-4-1'), (8.5 / 13));
  assert.equal(filters.parseScore('152.40 - 100.10'), 152.4);
  assert.equal(filters.isCloseGame({ margin: -4 }), true);
  assert.equal(filters.isBlowout({ margin: 31 }), true);
  assert.equal(filters.isPostseason({ type: 'Playoff' }), true);
  assert.equal(filters.isSaunders({ type: 'Saunders', round: 'Final' }), true);
});

test('record columns filter their displayed record and sort by numeric performance', async () => {
  const [, , , , registryModule] = await modules;
  const tables = ['history-opponents', 'history-seasons', 'rivalry-seasons', 'current-standings', 'trophy-seasons'];
  for (const tableId of tables) {
    const column = registryModule.getTableRegistryEntry(tableId).columns.find(item => item.id === 'record');
    const row = { record: '1-0-0', winPct: 1, wins: 1, ties: 0 };
    assert.equal(column.accessor(row), '1-0-0');
    assert.equal(typeof column.sortAccessor(row), 'number');
  }
});

test('quick filters compose and replace incompatible filters within a group', async () => {
  const [, , quick] = await modules;
  const definitions = [
    { id: 'wins', label: 'Wins', group: 'result', test: row => row.result === 'W' },
    { id: 'losses', label: 'Losses', group: 'result', test: row => row.result === 'L' },
    { id: 'high', label: 'High', test: row => row.score >= 150 },
  ];
  assert.deepEqual(quick.toggleQuickFilter(['wins', 'high'], definitions[1], definitions), ['high', 'losses']);
  assert.deepEqual(
    quick.filterByQuickFilters([
      { result: 'W', score: 160 },
      { result: 'W', score: 120 },
      { result: 'L', score: 170 },
    ], ['wins', 'high'], definitions),
    [{ result: 'W', score: 160 }],
  );
});

test('history game row adapter creates stable perspective IDs and useful detail context', async () => {
  const [, , , gameRows] = await modules;
  const base = {
    gameId: '2025:2025-09-07:Joe:Joel:0',
    season: 2025,
    date: '2025-09-07',
    result: 'W',
    score: 151,
    opponentScore: 140,
    type: 'Regular',
    round: '',
  };
  const rows = gameRows.adaptHistoryGameRows([
    { ...base, team: 'Joe', opponent: 'Joel' },
    { ...base, team: 'Joel', opponent: 'Joe', result: 'L', score: 140, opponentScore: 151 },
  ]);
  assert.equal(new Set(rows.map(row => row.id)).size, 2);
  assert.equal(rows[0].margin, 11);
  assert.match(rows[0].details.map(detail => detail.value).join(' '), /Combined score|291\.00/);
  assert.match(rows[0].links[0].href, /tab=rivalry/);
});
