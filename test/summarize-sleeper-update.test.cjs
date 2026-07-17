const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  escapeMarkdown,
  summarize,
  writeOutputs,
} = require('../scripts/summarize_sleeper_update.cjs');

const script = path.join(__dirname, '../scripts/summarize_sleeper_update.cjs');

function game(overrides = {}) {
  return {
    season: 2025,
    date: '2025-09-07',
    teamA: 'Joe',
    teamB: 'Shap',
    scoreA: 100,
    scoreB: 90,
    week: 1,
    round: null,
    type: 'Regular',
    ...overrides,
  };
}

function current(overrides = {}) {
  return {
    season: 2025,
    generated_at: '2025-09-08T12:00:00Z',
    current_week: 1,
    teams: [{ owner: 'Joe' }, { owner: 'Shap' }],
    games: [{ ...game(), status: 'final' }],
    update_context: {
      contains_live_scores: false,
      contains_projected_scores: false,
    },
    ...overrides,
  };
}

function manifest(suffix) {
  return {
    data_version: 'sha256:data-' + suffix,
    assets: {
      H2H: { sha256: 'sha256:h2h-' + suffix },
      CurrentSeason: { sha256: 'sha256:current-' + suffix },
    },
  };
}

function makeFixture({
  beforeH2H = [game()],
  afterH2H = beforeH2H,
  beforeCurrent = current(),
  afterCurrent = beforeCurrent,
  beforeManifest = manifest('before'),
  afterManifest = manifest('after'),
  changedFiles = [],
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-summary-'));
  const beforeDir = path.join(root, 'before');
  const afterDir = path.join(root, 'after');
  fs.mkdirSync(beforeDir);
  fs.mkdirSync(afterDir);
  fs.writeFileSync(path.join(beforeDir, 'H2H.json'), JSON.stringify(beforeH2H));
  fs.writeFileSync(path.join(afterDir, 'H2H.json'), JSON.stringify(afterH2H));
  if (beforeCurrent !== null) fs.writeFileSync(path.join(beforeDir, 'CurrentSeason.json'), JSON.stringify(beforeCurrent));
  if (afterCurrent !== null) fs.writeFileSync(path.join(afterDir, 'CurrentSeason.json'), JSON.stringify(afterCurrent));
  if (beforeManifest !== null) fs.writeFileSync(path.join(beforeDir, 'asset-manifest.json'), JSON.stringify(beforeManifest));
  if (afterManifest !== null) fs.writeFileSync(path.join(afterDir, 'asset-manifest.json'), JSON.stringify(afterManifest));
  const changedFile = path.join(root, 'changed-files.txt');
  fs.writeFileSync(changedFile, changedFiles.join('\n'));
  const options = {
    'before-dir': beforeDir,
    'after-dir': afterDir,
    season: 2025,
    'run-url': 'https://github.com/Haynesmodel/Darling/actions/runs/123',
    'changed-files-file': changedFile,
    'body-out': path.join(root, 'body.md'),
    'json-out': path.join(root, 'summary.json'),
  };
  return { root, options };
}

test('identical and reordered H2H input has no semantic changes', () => {
  const first = game();
  const second = game({ week: 2, date: '2025-09-14', teamA: 'Joel', teamB: 'Nuss' });
  const fixture = makeFixture({ beforeH2H: [first, second], afterH2H: [second, first] });
  try {
    const result = summarize(fixture.options);
    assert.deepEqual(
      { added: result.summary.h2h.added, removed: result.summary.h2h.removed, changed: result.summary.h2h.changed },
      { added: 0, removed: 0, changed: 0 },
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('H2H additions, removals, and changes use canonical identity and classification', () => {
  const retained = game();
  const removed = game({ week: 2, date: '2025-09-14', teamA: 'Joel', teamB: 'Nuss', type: 'Playoff' });
  const added = game({ week: 3, date: '2025-09-21', teamA: 'A|B', teamB: 'Zook', type: 'Saunders' });
  const fixture = makeFixture({
    beforeH2H: [retained, removed],
    afterH2H: [{ ...retained, scoreA: 101 }, added],
    changedFiles: ['assets/H2H.json', 'assets/SeasonSummary.draft.json'],
  });
  try {
    const result = summarize(fixture.options);
    assert.deepEqual(
      { added: result.summary.h2h.added, removed: result.summary.h2h.removed, changed: result.summary.h2h.changed },
      { added: 1, removed: 1, changed: 1 },
    );
    assert.equal(result.summary.h2h.by_type.regular_season.changed, 1);
    assert.equal(result.summary.h2h.by_type.playoffs.removed, 1);
    assert.equal(result.summary.h2h.by_type.saunders.added, 1);
    assert.equal(result.summary.season_summary_draft_changed, true);
    assert.match(result.markdown, /A\\\|B/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('H2H-only updates tolerate a missing optional current-season file', () => {
  const fixture = makeFixture({
    beforeCurrent: null,
    afterCurrent: null,
    afterH2H: [game(), game({ week: 2, date: '2025-09-14' })],
    changedFiles: ['assets/H2H.json'],
  });
  try {
    const result = summarize(fixture.options);
    assert.equal(result.summary.current_season.before, null);
    assert.equal(result.summary.current_season.after, null);
    assert.equal(result.summary.h2h.added, 1);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('CurrentSeason-only updates report counts, flags, week, and status', () => {
  const after = current({
    current_week: 2,
    generated_at: '2025-09-15T12:00:00Z',
    games: [
      { ...game(), status: 'final' },
      { ...game({ week: 2, date: '2025-09-14' }), status: 'live' },
    ],
    update_context: { contains_live_scores: true, contains_projected_scores: true },
  });
  const fixture = makeFixture({ afterCurrent: after, changedFiles: ['assets/CurrentSeason.json'] });
  try {
    const result = summarize(fixture.options);
    assert.equal(result.summary.h2h.added, 0);
    assert.equal(result.summary.current_season.after.games, 2);
    assert.equal(result.summary.current_season.after.latest_week, 2);
    assert.equal(result.summary.current_season.after.statuses.live, 1);
    assert.equal(result.summary.current_season.after.contains_projected_scores, true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('both sources and manifest metadata are summarized with sorted changed files', () => {
  const fixture = makeFixture({
    afterH2H: [game({ scoreB: 91 })],
    afterCurrent: current({ generated_at: '2025-09-09T12:00:00Z' }),
    changedFiles: ['assets/asset-manifest.json', 'assets/H2H.json', 'assets/CurrentSeason.json', 'assets/H2H.json'],
  });
  try {
    const result = summarize(fixture.options);
    assert.deepEqual(result.summary.changed_files, [
      'assets/asset-manifest.json',
      'assets/CurrentSeason.json',
      'assets/H2H.json',
    ]);
    assert.equal(result.summary.manifest.before.data_version, 'sha256:data-before');
    assert.equal(result.summary.manifest.after.h2h_sha256, 'sha256:h2h-after');
    assert.match(result.markdown, /npm run check:data-generated/);
    assert.match(result.markdown, /not promoted automatically/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Markdown escaping neutralizes untrusted owner and team strings', () => {
  assert.equal(escapeMarkdown('A|B [x](url)\nnext'), 'A\\|B \\[x\\]\\(url\\) next');
});

test('identical inputs produce byte-identical Markdown and JSON', () => {
  const fixture = makeFixture({ changedFiles: ['assets/H2H.json'] });
  try {
    const first = summarize(fixture.options);
    const second = summarize(fixture.options);
    assert.equal(first.markdown, second.markdown);
    assert.equal(JSON.stringify(first.summary), JSON.stringify(second.summary));
    writeOutputs(fixture.options, first);
    const firstBody = fs.readFileSync(fixture.options['body-out']);
    const firstJson = fs.readFileSync(fixture.options['json-out']);
    writeOutputs(fixture.options, second);
    assert.deepEqual(fs.readFileSync(fixture.options['body-out']), firstBody);
    assert.deepEqual(fs.readFileSync(fixture.options['json-out']), firstJson);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('malformed JSON exits nonzero and removes stale outputs', () => {
  const fixture = makeFixture();
  try {
    fs.writeFileSync(path.join(fixture.options['after-dir'], 'H2H.json'), '{broken');
    fs.writeFileSync(fixture.options['body-out'], 'stale');
    fs.writeFileSync(fixture.options['json-out'], 'stale');
    const args = Object.entries(fixture.options).flatMap(([key, value]) => ['--' + key, String(value)]);
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(fixture.options['body-out']), false);
    assert.equal(fs.existsSync(fixture.options['json-out']), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
