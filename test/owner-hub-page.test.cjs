const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let directory;
let OwnerHubPage;

test.before(async () => {
  const coverageBundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(coverageBundles, { recursive: true });
  directory = fs.mkdtempSync(path.join(coverageBundles, 'owner-page-'));
  const outfile = path.join(directory, 'owner-page.mjs');
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/features/owner-hub/OwnerHubPage.tsx')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
  });
  ({ OwnerHubPage } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`));
});

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

function visit(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(visit);
  if (typeof node !== 'object') return [node];
  if (typeof node.type === 'function') return visit(node.type(node.props));
  return [node, ...visit(node.props?.children)];
}

function emptyModel() {
  return {
    identity: { owner: 'Sparse', displayName: null, teamName: null, completedSeasons: 0, phase: 'offseason' },
    rightNow: null,
    legacy: null,
    recentForm: null,
    dynastyDirection: { direction: 'insufficient history', finishes: [] },
    draftIdentity: null,
    rivalries: null,
    curses: null,
    actions: [],
    availability: {},
  };
}

test('Owner Hub page renders neutral, invalid, sparse, and favorite states', () => {
  const calls = [];
  const neutral = OwnerHubPage({
    validOwners: ['Joe'],
    selectedOwner: null,
    invalidOwner: 'Missing',
    preference: { owner: 'Joe', persisted: true, revision: 1 },
    message: '',
    model: null,
    onPreview: owner => calls.push(['preview', owner]),
    onSave: () => calls.push(['save']),
    onClear: () => calls.push(['clear']),
  });
  const neutralNodes = visit(neutral);
  assert.ok(neutralNodes.some(node => node.type === 'select'));
  assert.ok(neutralNodes.some(node => node.props?.role === 'alert'));

  const sparse = OwnerHubPage({
    validOwners: ['Sparse'],
    selectedOwner: 'Sparse',
    invalidOwner: null,
    preference: { owner: 'Sparse', persisted: true, revision: 2 },
    message: 'Saved.',
    model: emptyModel(),
    onPreview: owner => calls.push(['preview', owner]),
    onSave: () => calls.push(['save']),
    onClear: () => calls.push(['clear']),
  });
  const sparseNodes = visit(sparse);
  assert.ok(sparseNodes.some(node => node.props?.class === 'owner-hub-current'));
  assert.ok(sparseNodes.filter(node => node.props?.class === 'muted').length >= 5);
});

test('Owner Hub page renders nullable career values and partial rivalry/curse cards', () => {
  const model = emptyModel();
  model.identity = {
    ...model.identity,
    displayName: 'Display',
    teamName: 'Team',
    completedSeasons: 1,
  };
  model.rightNow = { heading: 'Week 1', summary: 'Sparse vs Other', detail: null, href: '/current' };
  model.legacy = {
    record: '0-0-0',
    winPct: null,
    championships: 0,
    saundersTitles: 0,
    playoffRecord: '0-0',
    bestFinish: null,
    averageFinish: null,
  };
  model.recentForm = {
    streak: 'W1',
    games: [{ opponent: 'Other', result: 'W', score: '1.00–0.00', type: 'Regular', when: 'today' }],
  };
  model.dynastyDirection = { direction: 'mixed', finishes: [{ season: 2025, finish: 4 }] };
  model.draftIdentity = {
    samples: 1,
    averagePick: 4,
    earliestPick: 4,
    latestPick: 4,
    mostRecent: { season: 2025, pick: 4 },
    href: '/draft',
  };
  model.rivalries = { configured: [{ name: 'Cup', opponents: ['Other'] }], mostPlayed: null };
  model.curses = {
    counts: { active: 0, cold: 1, broken: 0 },
    top: null,
    href: '/curses',
  };
  model.actions = [{ label: 'History', href: '/history' }];

  const nodes = visit(OwnerHubPage({
    validOwners: ['Sparse'],
    selectedOwner: 'Sparse',
    invalidOwner: null,
    preference: { owner: null, persisted: true, revision: 0 },
    message: '',
    model,
    onPreview() {},
    onSave() {},
    onClear() {},
  }));
  assert.ok(nodes.some(node => node.type === 'ol'));
  assert.ok(nodes.some(node => node.type === 'nav'));
});
