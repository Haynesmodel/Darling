const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const temporaryDirectories = [];

async function importTypeScript(relativePath) {
  const coverageBundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(coverageBundles, { recursive: true });
  const directory = fs.mkdtempSync(path.join(coverageBundles, 'table-system-'));
  temporaryDirectories.push(directory);
  const outfile = path.join(directory, `${path.basename(relativePath, '.ts')}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(process.cwd(), relativePath)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    sourcemap: 'inline',
    sourcesContent: true,
  });
  return import(pathToFileURL(outfile).href);
}

test.after(() => temporaryDirectories.forEach(directory => fs.rmSync(directory, { recursive: true, force: true })));

const modules = Promise.all([
  importTypeScript('src/tables/table-saved-views.ts'),
  importTypeScript('src/tables/table-filter-functions.ts'),
  importTypeScript('src/tables/table-quick-filters.ts'),
  importTypeScript('src/tables/rows/history-game-rows.ts'),
  importTypeScript('src/tables/table-registry.ts'),
  importTypeScript('src/tables/rows/trophy-season-rows.ts'),
  importTypeScript('src/tables/rows/rivalry-season-rows.ts'),
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

test('saved views persist and sanitize canonical URL-owned state separately', async () => {
  const [saved] = await modules;
  const storage = new FakeStorage();
  const view = saved.saveView('history-games', 'Canonical loss', portableState(), { owner: 'Joe' }, storage, {
    urlState: {
      seasons: [2024, 'invalid'],
      weeks: [16],
      opps: ['Zubs', 7],
      types: ['Playoff'],
      rounds: ['Semi Final'],
      gameResult: 'L',
      gameMinScore: -1,
      gameMaxScore: 150,
      gameSort: 'marginAsc',
      gameLimit: 101,
    },
  });
  assert.deepEqual(view.urlState, {
    seasons: [2024],
    weeks: [16],
    opps: ['Zubs'],
    types: ['Playoff'],
    rounds: ['Semi Final'],
    gameResult: 'L',
    gameMinScore: null,
    gameMaxScore: 150,
    gameSort: 'marginAsc',
    gameLimit: null,
  });
  assert.deepEqual(saved.readSavedViews(storage)[0].urlState, view.urlState);
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
  assert.equal(filters.textFilterValue(null, '  '), true);
  assert.equal(filters.enumFilterValue('W', []), true);
  assert.equal(filters.enumFilterValue('W', null), true);
  assert.equal(filters.numberRangeFilterValue('unknown', { min: 1 }), false);
  assert.equal(filters.numberRangeFilterValue(2, { min: 3, max: 1 }), false);
  assert.equal(filters.parseRecord('0-0'), 0);
  assert.equal(Number.isNaN(filters.parseRecord('no record')), true);
  assert.equal(Number.isNaN(filters.parseScore('')), true);
  assert.equal(filters.isPostseason({ type: 'Regular' }), false);
  assert.equal(filters.isSaunders({ round: 'Saunders Final' }), true);
  assert.equal(filters.isCloseGame({ margin: 'not a score' }), false);
  assert.equal(filters.isBlowout({ margin: 'not a score' }), false);
  assert.equal(filters.isEmptyRange({ min: 0 }), false);
  assert.equal(filters.isEmptyRange({}), true);
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

test('registered table columns format and sort the fields users see', async () => {
  const [, , , , registryModule] = await modules;
  const row = {
    team: 'Joe', date: '2025-09-07', opponent: 'Joel', result: 'W', score: 150, scoreLabel: '150.0',
    margin: 5, combinedScore: 250, type: 'Regular', round: 'Final', season: 2025, week: 1,
    xw: 0.5, record: '8-4-0', winPct: 2 / 3, ppg: 150, oppg: 120, games: 12,
    draftPick: 5, draftPickLabel: 'Pick 5', finish: 2, finishValue: 2, pf: 1800, pfValue: 1800,
    pa: 1700, paValue: 1700, diff: 100, diffValue: 100, notes: ['Champion'], notesLabel: 'Champion',
    pointsFor: 1800, pointsAgainst: 1700, differential: 100, rank: 1, owner: 'Joe', streak: 'W2',
    projectedRank: 1, projectedPointsFor: 1800, seedChange: 1, projectedRecord: '10-4', currentRecord: '8-4',
    wins: 8, ties: 0, madePlayoffs: true, playoffGames: 2, champion: true, saunders: false,
    playoff_wins: 2, playoff_losses: 1, pointsForRank: 1, statusKey: 'clinched', recencyIndex: 1,
    isCrown: true, isTurd: false,
  };

  for (const entry of Object.values(registryModule.getTableRegistry())) {
    assert.equal(registryModule.getTableRegistryEntry(entry.id), entry);
    for (const column of entry.columns) {
      const value = column.accessor(row);
      assert.equal(value, row[column.id]);
      if (column.sortAccessor) assert.equal(typeof column.sortAccessor(row), 'number');
      if (column.render) assert.notEqual(column.render(value, row), undefined);
    }
    assert.ok(entry.emptyMessage);
    assert.ok(entry.defaultPageSize > 0);
  }

  const column = (table, id) => registryModule.getTableRegistryEntry(table).columns.find(item => item.id === id);
  assert.equal(column('history-games', 'margin').render(5, row), '+5.00');
  assert.equal(column('history-games', 'combinedScore').render(250, row), '250.00');
  assert.equal(column('history-games', 'score').render(150, row), '150.0');
  assert.equal(column('history-opponents', 'winPct').render(2 / 3, row), '66.7%');
  assert.equal(column('history-opponents', 'record').sortAccessor(row), 2 / 3);
  assert.equal(column('history-seasons', 'record').sortAccessor(row), 2 / 3);
  assert.equal(column('rivalry-seasons', 'record').sortAccessor(row), 8);
  assert.equal(column('trophy-seasons', 'record').sortAccessor(row), 2 / 3);
  assert.equal(column('trophy-seasons', 'finishValue').render(2, row), '2');
  assert.equal(column('current-projected', 'seedChange').render(1, row), '+1');
  assert.equal(column('history-games', 'margin').render('bad', { ...row, margin: 'bad' }), '—');
});

test('registered quick filters distinguish matching rows from counterexamples', async () => {
  const [, , , , registryModule] = await modules;
  const filters = table => Object.fromEntries(registryModule.getTableRegistryEntry(table).quickFilters.map(item => [item.id, item.test]));
  const history = filters('history-games');
  const win = { result: 'W', type: 'Regular', score: 155, margin: 4, round: '' };
  const loss = { result: 'L', type: 'Playoff', score: 110, margin: -35, round: 'Semi Final' };
  const saunders = { result: 'W', type: 'Regular', score: 150, margin: 2, round: 'Saunders Final' };
  assert.equal(history.wins(win), true);
  assert.equal(history.wins(loss), false);
  assert.equal(history.losses(loss), true);
  assert.equal(history.playoffs(loss), true);
  assert.equal(history.saunders(saunders), true);
  assert.equal(history['150-plus'](loss), false);
  assert.equal(history.close(win), true);
  assert.equal(history.blowouts(loss), true);

  const weeks = filters('history-weeks');
  assert.equal(weeks.crowns({ isCrown: true }), true);
  assert.equal(weeks.lowest({ isTurd: false }), false);
  assert.equal(weeks.playoffs(win), false);
  assert.equal(weeks.close(loss), false);

  const opponents = filters('history-opponents');
  assert.equal(opponents.winning({ winPct: 0.6 }), true);
  assert.equal(opponents.losing({ winPct: 0.6 }), false);
  assert.equal(opponents['five-plus']({ games: 4 }), false);
  assert.equal(opponents['playoff-opponents']({ playoffGames: 2 }), true);

  const seasons = filters('history-seasons');
  assert.equal(seasons.champions({ champion: true }), true);
  assert.equal(seasons.playoffs({ playoff_wins: 0, playoff_losses: 0 }), false);
  assert.equal(seasons.saunders({ saunders: false }), false);
  assert.equal(seasons['last-five']({ season: 2020 }, { latestSeason: 2025 }), false);

  const rivalry = filters('rivalry-games');
  assert.equal(rivalry['last-five']({ recencyIndex: 5 }), false);
  assert.equal(rivalry.blowouts(loss), true);

  const standings = filters('current-standings');
  assert.equal(standings.clinched({ statusKey: 'clinched' }), true);
  assert.equal(standings.bubble({ statusKey: 'clinched' }), false);
  assert.equal(standings.eliminated({ statusKey: 'eliminated' }), true);
  assert.equal(standings['top-six-scoring']({ pointsForRank: 7 }), false);

  const draft = filters('draft-rows');
  assert.equal(draft.champions({ champion: true }), true);
  assert.equal(draft.playoffs({ madePlayoffs: false }), false);
  assert.equal(draft.saunders({ saunders: true }), true);
});

test('trophy season adapter maps structured game logs without changing generic detail values', async () => {
  const [, , , , , trophyRows] = await modules;
  const adapted = trophyRows.adaptTrophySeasonRows([{
    season: 2025,
    record: '1-0-0',
    finish: '1',
    pf: '100.0',
    pa: '90.0',
    diff: '+10.0',
    notes: ['Champion'],
    games: [{ date: '2025-09-07', week: '1', opponent: 'Shap', scoreline: '100.0 - 90.0', result: 'W', type: 'Regular', round: '—' }],
  }, {
    season: 2024,
    record: '0-0-0',
    finish: '—',
    pf: '—',
    pa: '—',
    diff: '—',
    notes: [],
    games: [],
  }, {
    season: 2023,
    notes: null,
    games: [{}],
  }], { owner: 'Joe' });
  assert.deepEqual(adapted[0].details, [
    { label: 'Season result', value: 'Champion' },
    { label: 'Point differential', value: '+10.0' },
    { label: 'Game log', value: '1 game' },
    { label: '2025-09-07 · Week 1', value: 'Opponent: Shap · Score: 100.0 - 90.0 · Result: W · Type: Regular · Round: —' },
  ]);
  assert.deepEqual(adapted[1].details, [
    { label: 'Season result', value: 'No special notes' },
    { label: 'Point differential', value: '—' },
    { label: 'Game log', value: 'No games recorded' },
  ]);
  assert.equal(adapted[2].details[3].label, '— · Week —');
  assert.match(adapted[2].details[3].value, /Opponent: —.*Round: —/);
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
  assert.deepEqual(quick.toggleQuickFilter(['losses'], definitions[1], definitions), []);
  assert.deepEqual(quick.toggleQuickFilter(['unknown'], definitions[2], definitions), ['unknown', 'high']);
  const rows = [{ result: 'W' }, { result: 'L' }];
  assert.equal(quick.filterByQuickFilters(rows, [], definitions), rows);
  assert.deepEqual(quick.filterByQuickFilters(rows, ['unknown'], definitions), rows);
  assert.deepEqual(
    quick.filterByQuickFilters([{ season: 2025 }, { season: 2020 }], ['recent'], [
      { id: 'recent', label: 'Recent', test: (row, context) => row.season >= context.latest - 4 },
    ], { latest: 2025 }),
    [{ season: 2025 }],
  );
});

test('rivalry season rows normalize sparse records and retain descriptive context', async () => {
  const [, , , , , , rows] = await modules;
  const adapted = rows.adaptRivalrySeasonRows([
    { season: 2025, games: 2, diff: -11, w: 1, l: 1, t: 0, notes: ['Playoff', 'Sweep'] },
    { season: 2024, games: 0, recordText: '0-0-0', notes: '' },
    { season: 2023, games: 'bad', pf: 'bad', pa: null, diff: null, notes: null },
  ], { rivalryA: 'Joe', rivalryB: 'Joel' });

  assert.equal(adapted[0].id, 'Joe:Joel:2025:0');
  assert.equal(adapted[0].record, '1-1-0');
  assert.equal(adapted[0].notesLabel, 'Playoff • Sweep');
  assert.equal(adapted[0].details[0].value, '5.50');
  assert.equal(adapted[0].details[2].value, 'Playoff • Sweep');
  assert.equal(adapted[1].details[0].value, '—');
  assert.equal(adapted[1].record, '0-0-0');
  assert.equal(adapted[1].details[2].value, 'No special notes');
  assert.deepEqual([adapted[2].pf, adapted[2].pa, adapted[2].diff], [0, 0, 0]);
  assert.equal(adapted[2].notesLabel, '—');
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
