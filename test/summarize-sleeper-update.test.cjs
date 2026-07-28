const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  escapeMarkdown,
  parseArgs,
  summarize,
  writeOutputs,
} = require('../scripts/summarize_sleeper_update.cjs');

const script = path.join(__dirname, '..', 'scripts', 'summarize_sleeper_update.cjs');
const sha = 'a'.repeat(40);

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
    source: 'sleeper',
    league_id: 'league-123',
    season: 2025,
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
    data_version: `sha256:data-${suffix}`,
    assets: {
      H2H: { sha256: `sha256:h2h-${suffix}` },
      CurrentSeason: { sha256: `sha256:current-${suffix}` },
      TransactionHistory: { sha256: `sha256:transactions-${suffix}` },
    },
  };
}

function transactions(overrides = {}) {
  return {
    players: [{ id: 'p1', name: 'Player One' }],
    seasons: [{
      season: 2025,
      league_id: 'league-123',
      coverage: {
        complete_count: 1,
        failed_count: 0,
        pending_count: 0,
        completed_week: 1,
        missing_player_metadata: 0,
        type_counts: { waiver: 1, free_agent: 0, trade: 0, commissioner: 0 },
      },
      draft: { status: 'selected', pick_count: 1 },
      transactions: [{ id: 'tx-1', status: 'complete', type: 'waiver' }],
      ...overrides,
    }],
  };
}

function fixture({
  beforeH2H = [game()],
  afterH2H = beforeH2H,
  beforeCurrent = current(),
  afterCurrent = beforeCurrent,
  beforeManifest = manifest('before'),
  afterManifest = manifest('after'),
  beforeTransactions = transactions(),
  afterTransactions = beforeTransactions,
  changed = ['assets/CurrentSeason.json'],
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-sleeper-summary-'));
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
  if (beforeTransactions !== null) fs.writeFileSync(path.join(beforeDir, 'TransactionHistory.json'), JSON.stringify(beforeTransactions));
  if (afterTransactions !== null) fs.writeFileSync(path.join(afterDir, 'TransactionHistory.json'), JSON.stringify(afterTransactions));
  const changedFile = path.join(root, 'changed.txt');
  fs.writeFileSync(changedFile, changed.join('\n'));
  return {
    root,
    options: {
      'before-dir': beforeDir,
      'after-dir': afterDir,
      season: 2025,
      'run-url': 'https://github.com/Haynesmodel/Darling/actions/runs/123',
      'base-sha': sha,
      'candidate-sha': 'b'.repeat(40),
      'changed-files-file': changedFile,
      'body-out': path.join(root, 'body.md'),
      'json-out': path.join(root, 'summary.json'),
    },
  };
}

function withFixture(options, callback) {
  const value = fixture(options);
  try {
    return callback(value);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
}

function runSummary(value) {
  return summarize(value.options, { LEAGUE_ID: 'league-123' });
}

test('identical and reordered H2H rows produce no semantic change', () => {
  const second = game({ week: 2, date: '2025-09-14', teamA: 'Joel', teamB: 'Nuss' });
  withFixture({ beforeH2H: [game(), second], afterH2H: [second, game()] }, (value) => {
    assert.deepEqual(runSummary(value).summary.h2h, {
      target_rows_before: 2,
      target_rows_after: 2,
      added: 0,
      changed: 0,
      removed: 0,
      added_by_type: { Regular: 0, Playoff: 0, Saunders: 0 },
      owners_in_new_games: [],
    });
  });
});

test('target-season additions classify Regular, Playoff, and Saunders separately', () => {
  const additions = [
    game({ week: 2 }),
    game({ week: 15, type: 'Playoff', round: 'Semifinal' }),
    game({ week: 16, type: 'Saunders', round: 'Final' }),
  ];
  withFixture({ afterH2H: [game(), ...additions], changed: ['assets/H2H.json'] }, (value) => {
    const result = runSummary(value);
    assert.deepEqual(result.summary.h2h.added_by_type, { Regular: 1, Playoff: 1, Saunders: 1 });
    assert.equal(result.summary.h2h.added, 3);
    assert.deepEqual(result.summary.h2h.owners_in_new_games, ['Joe', 'Shap']);
  });
});

test('changed existing H2H records fail append-only enforcement', () => {
  withFixture({ afterH2H: [game({ scoreA: 101 })], changed: ['assets/H2H.json'] }, (value) => {
    assert.throws(() => runSummary(value), /existing record\(s\) were changed/);
  });
});

test('removed existing H2H records fail append-only enforcement', () => {
  withFixture({ afterH2H: [], changed: ['assets/H2H.json'] }, (value) => {
    assert.throws(() => runSummary(value), /existing record\(s\) were removed/);
  });
});

test('out-of-season additions fail target-season enforcement', () => {
  withFixture({
    afterH2H: [game(), game({ season: 2024, week: 2 })],
    changed: ['assets/H2H.json'],
  }, (value) => {
    assert.throws(() => runSummary(value), /added outside season 2025/);
  });
});

test('CurrentSeason statistics include teams, games, weeks, statuses, and flags', () => {
  const afterCurrent = current({
    current_week: 2,
    games: [
      { ...game(), status: 'final' },
      { ...game({ week: 2 }), status: 'live' },
      { ...game({ week: 3 }), status: 'scheduled' },
    ],
    update_context: { contains_live_scores: true, contains_projected_scores: true },
  });
  withFixture({ beforeCurrent: null, afterCurrent }, (value) => {
    const stats = runSummary(value).summary.current_season;
    assert.equal(stats.before, null);
    assert.deepEqual(stats.after.statuses, { final: 1, live: 1, scheduled: 1 });
    assert.equal(stats.after.latest_week, 3);
    assert.equal(stats.after.current_week, 2);
    assert.equal(stats.after.contains_projected_scores, true);
  });
});

test('candidate CurrentSeason season and league must match configured values', () => {
  withFixture({ afterCurrent: current({ season: 2026 }) }, (value) => {
    assert.throws(() => runSummary(value), /candidate season 2026 does not equal target 2025/);
  });
  withFixture({ afterCurrent: current({ league_id: 'wrong-league' }) }, (value) => {
    assert.throws(() => runSummary(value), /league_id does not match/);
  });
});

test('transaction candidate enforces target league, unique IDs, and target presence', () => {
  withFixture({ afterTransactions: transactions({ league_id: 'wrong-league' }) }, (value) => {
    assert.throws(() => runSummary(value), /target league does not match/);
  });
  withFixture({
    afterTransactions: transactions({
      transactions: [
        { id: 'duplicate', status: 'complete', type: 'waiver' },
        { id: 'duplicate', status: 'failed', type: 'waiver' },
      ],
    }),
  }, (value) => {
    assert.throws(() => runSummary(value), /duplicate transaction IDs/);
  });
  withFixture({ afterTransactions: { players: [], seasons: [] } }, (value) => {
    assert.throws(() => runSummary(value), /target season 2025 is missing/);
  });
});

test('transaction candidate preserves every non-target season exactly', () => {
  const historical = {
    season: 2024,
    league_id: 'historical-league',
    coverage: { complete_count: 0 },
    draft: { status: 'unavailable', pick_count: 0 },
    transactions: [],
  };
  const before = transactions();
  before.seasons.unshift(historical);
  const changed = JSON.parse(JSON.stringify(before));
  changed.seasons[0].coverage.complete_count = 1;
  withFixture({ beforeTransactions: before, afterTransactions: changed }, (value) => {
    assert.throws(() => runSummary(value), /non-target season 2024 was changed/);
  });

  const removed = transactions();
  withFixture({ beforeTransactions: before, afterTransactions: removed }, (value) => {
    assert.throws(() => runSummary(value), /non-target season 2024 was removed/);
  });

  const added = transactions();
  added.seasons.unshift(historical);
  withFixture({ beforeTransactions: transactions(), afterTransactions: added }, (value) => {
    assert.throws(() => runSummary(value), /unexpected non-target season 2024 was added/);
  });
});

test('transaction summary reports coverage, draft, players, hashes, and review method', () => {
  withFixture({ changed: ['assets/TransactionHistory.json'] }, (value) => {
    const result = runSummary(value);
    assert.equal(result.summary.transactions.target_rows_after, 1);
    assert.equal(result.summary.transactions.complete, 1);
    assert.equal(result.summary.transactions.draft_picks, 1);
    assert.equal(result.summary.transactions.players, 1);
    assert.equal(result.summary.transactions.non_target_seasons_preserved, true);
    assert.match(result.markdown, /TransactionHistory hash/);
    assert.match(result.markdown, /Completed scoring week/);
    assert.match(result.markdown, /Trade on-field edge.*methodology/i);
  });
});

test('manifest hashes, source context, validations, and sorted files are deterministic', () => {
  withFixture({
    changed: [
      'assets/asset-manifest.json',
      'assets/H2H.json',
      'assets/CurrentSeason.json',
      'assets/H2H.json',
    ],
  }, (value) => {
    const first = runSummary(value);
    const second = runSummary(value);
    assert.deepEqual(first, second);
    assert.deepEqual(first.summary.changed_files, [
      'assets/asset-manifest.json',
      'assets/CurrentSeason.json',
      'assets/H2H.json',
    ]);
    assert.equal(first.summary.manifest.before.data_version, 'sha256:data-before');
    assert.equal(first.summary.manifest.after.current_season_sha256, 'sha256:current-after');
    assert.deepEqual(first.summary.validation_commands, [
      "python3 -m unittest discover -s test -p 'test_generate_transaction_history.py'",
      'npm run generate:derived',
      'npm run generate:manifest',
      'npm run check:data-generated',
      'npm run test:assets',
    ]);
    assert.match(first.markdown, /Base main SHA/);
    assert.match(first.markdown, /latest exact `ci \/ gate` result/);
    assert.ok(first.markdown.includes(
      "LEAGUE_ID='<configured-league-id>' UPDATE_LIVE=1 VALIDATE_ONLY=1 SEASON=2025",
    ));
  });
});

test('Markdown punctuation and newlines in owner names cannot alter body structure', () => {
  assert.equal(escapeMarkdown('A|B [x](url)\n# heading'), 'A\\|B \\[x\\]\\(url\\) \\# heading');
  const unsafe = game({ week: 2, teamA: 'A|B\n# injected', teamB: 'Zook' });
  withFixture({ afterH2H: [game(), unsafe], changed: ['assets/H2H.json'] }, (value) => {
    const markdown = runSummary(value).markdown;
    assert.doesNotMatch(markdown, /\n# injected/);
    assert.match(markdown, /A\\\|B \\# injected/);
  });
});

test('manual SeasonSummary draft remains review-only', () => {
  withFixture({ changed: ['assets/SeasonSummary.draft.json'] }, (value) => {
    const result = runSummary(value);
    assert.equal(result.summary.season_summary_draft.manual_fields_require_review, true);
    assert.match(result.markdown, /draft was not promoted/);
  });
  withFixture({ changed: ['assets/SeasonSummary.json'] }, (value) => {
    assert.throws(() => runSummary(value), /must never be modified/);
  });
});

test('CLI rejects invalid season, URL, SHA, and any league-id argument', () => {
  const required = [
    '--before-dir', '/tmp/before',
    '--after-dir', '/tmp/after',
    '--season', '2025',
    '--run-url', 'https://example.com/actions/runs/1',
    '--base-sha', sha,
    '--candidate-sha', sha,
    '--changed-files-file', '/tmp/changed',
    '--body-out', '/tmp/body',
    '--json-out', '/tmp/json',
  ];
  assert.throws(() => parseArgs(required.map(value => value === '2025' ? '1999' : value)), /Invalid season/);
  assert.throws(() => parseArgs(required.map(value => value.startsWith('https://') ? 'file:///tmp/run' : value)), /Run URL must use HTTPS/);
  assert.throws(() => parseArgs(required.map(value => value === sha ? 'short' : value)), /Invalid base-sha/);
  assert.throws(() => parseArgs([...required, '--league-id', 'secret']), /Duplicate|Invalid argument|Missing required|league-id/);
});

test('atomic outputs are canonical, newline-terminated, and byte-identical', () => {
  withFixture({}, (value) => {
    const result = runSummary(value);
    writeOutputs(value.options, result);
    const firstBody = fs.readFileSync(value.options['body-out']);
    const firstJson = fs.readFileSync(value.options['json-out']);
    assert.equal(firstBody.at(-1), 10);
    assert.equal(firstJson.at(-1), 10);
    writeOutputs(value.options, result);
    assert.deepEqual(fs.readFileSync(value.options['body-out']), firstBody);
    assert.deepEqual(fs.readFileSync(value.options['json-out']), firstJson);
  });
});

test('CLI parse or validation failure removes stale outputs', () => {
  withFixture({}, (value) => {
    fs.writeFileSync(path.join(value.options['after-dir'], 'H2H.json'), '{bad');
    fs.writeFileSync(value.options['body-out'], 'stale');
    fs.writeFileSync(value.options['json-out'], 'stale');
    const args = Object.entries(value.options).flatMap(([key, entry]) => [`--${key}`, String(entry)]);
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, LEAGUE_ID: 'league-123' },
    });
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(value.options['body-out']), false);
    assert.equal(fs.existsSync(value.options['json-out']), false);
  });
});

test('CLI argument-validation failure also removes stale outputs', () => {
  withFixture({}, (value) => {
    fs.writeFileSync(value.options['body-out'], 'stale');
    fs.writeFileSync(value.options['json-out'], 'stale');
    const invalid = { ...value.options, season: 'invalid-season' };
    const args = Object.entries(invalid).flatMap(([key, entry]) => [`--${key}`, String(entry)]);
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, LEAGUE_ID: 'league-123' },
    });
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(value.options['body-out']), false);
    assert.equal(fs.existsSync(value.options['json-out']), false);
  });
});

test('CLI duplicate output arguments remove every discovered stale target', () => {
  withFixture({}, (value) => {
    const otherBody = path.join(value.root, 'other-body.md');
    fs.writeFileSync(value.options['body-out'], 'stale first');
    fs.writeFileSync(otherBody, 'stale second');
    fs.writeFileSync(value.options['json-out'], 'stale json');
    const args = [
      ...Object.entries(value.options).flatMap(([key, entry]) => [`--${key}`, String(entry)]),
      '--body-out',
      otherBody,
    ];
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, LEAGUE_ID: 'league-123' },
    });
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(value.options['body-out']), false);
    assert.equal(fs.existsSync(otherBody), false);
    assert.equal(fs.existsSync(value.options['json-out']), false);
  });
});

test('CLI stale-output discovery never treats another flag as a path', () => {
  withFixture({}, (value) => {
    const flagShapedPath = path.join(value.root, '--json-out');
    fs.writeFileSync(flagShapedPath, 'must survive');
    try {
      const result = spawnSync(process.execPath, [
        script,
        '--body-out',
        '--json-out',
        value.options['json-out'],
      ], {
        cwd: value.root,
        encoding: 'utf8',
        env: { ...process.env, LEAGUE_ID: 'league-123' },
      });
      assert.notEqual(result.status, 0);
      assert.equal(fs.readFileSync(flagShapedPath, 'utf8'), 'must survive');
    } finally {
      fs.rmSync(flagShapedPath, { force: true });
    }
  });
});
