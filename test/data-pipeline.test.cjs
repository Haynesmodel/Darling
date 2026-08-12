const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const { canonicalJson, readJson, sha256Json } = require('../scripts/data/canonical-json.cjs');
const { HERO_REQUIREMENTS, fromRoot } = require('../scripts/data/constants.cjs');
const { buildDerivedStats } = require('../scripts/data/derived-stats.cjs');
const { isLowestScoreEligible } = require('../js/lowest-score-policy.js');
const { buildManifest, seasonCoverage, verifyManifest } = require('../scripts/data/manifest.cjs');
const { inspectHeroAssets } = require('../scripts/data/media-validation.cjs');
const { createAjv, validateStructuralAssets, validateWithSchema } = require('../scripts/data/schema-validation.cjs');
const { validateSemanticBundle } = require('../scripts/data/semantic-validation.cjs');
const { checkGeneratedAssets, compareGeneratedFiles } = require('../scripts/check_generated_assets.cjs');
const { validateDraftSpotDependencies, validateDerivedDependencies } = require('../scripts/validate_assets.cjs');

const root = path.join(__dirname, '..');
const bundle = {
  H2H: readJson(path.join(root, 'assets', 'H2H.json')),
  SeasonSummary: readJson(path.join(root, 'assets', 'SeasonSummary.json')),
  Rivalries: readJson(path.join(root, 'assets', 'Rivalries.json')),
  CurrentSeason: readJson(path.join(root, 'assets', 'CurrentSeason.json')),
  TransactionHistory: readJson(path.join(root, 'assets', 'TransactionHistory.json')),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortBy(rows, key) {
  return rows.slice().sort((a, b) => key(a).localeCompare(key(b)));
}

function copyHeroFixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-media-audit-'));
  fs.mkdirSync(path.join(temp, 'assets'), { recursive: true });
  fs.cpSync(path.join(root, 'assets/hero'), path.join(temp, 'assets/hero'), { recursive: true });
  return temp;
}

test('Draft 2020-12 schemas accept representative data and locate invalid fields', () => {
  const ajv = createAjv(root);
  const valid = readJson(path.join(root, 'test/fixtures/data/valid-h2h.json'));
  assert.deepEqual(validateWithSchema(ajv, 'h2h.schema.json', valid, 'valid-h2h.json'), []);

  const invalidFixtures = [
    {
      file: 'invalid-h2h-negative-score.json',
      schema: 'h2h.schema.json',
      field: 'scoreA',
      message: 'must be >= 0',
    },
    {
      file: 'invalid-season-summary-negative-wins.json',
      schema: 'season-summary.schema.json',
      field: 'wins',
      message: 'must be >= 0',
    },
    {
      file: 'invalid-rivalries-duplicate-members.json',
      schema: 'rivalries.schema.json',
      field: 'members',
      message: 'must NOT have duplicate items',
    },
    {
      file: 'invalid-current-season-status.json',
      schema: 'current-season.schema.json',
      field: 'status',
      message: 'must be equal to one of the allowed values',
    },
  ];
  for (const fixture of invalidFixtures) {
    const value = readJson(path.join(root, 'test/fixtures/data', fixture.file));
    const errors = validateWithSchema(ajv, fixture.schema, value, fixture.file);
    assert.ok(errors.some(error => error.includes(`field "${fixture.field}"`)), `${fixture.file}\n${errors.join('\n')}`);
    assert.ok(errors.some(error => error.includes(fixture.message)), `${fixture.file}\n${errors.join('\n')}`);
  }

  const transactionHistory = readJson(path.join(root, 'assets', 'TransactionHistory.json'));
  assert.deepEqual(
    validateWithSchema(ajv, 'transaction-history.schema.json', transactionHistory, 'TransactionHistory.json'),
    [],
  );
  transactionHistory.seasons[0].transactions[0].unexpected = true;
  assert.ok(
    validateWithSchema(
      ajv,
      'transaction-history.schema.json',
      transactionHistory,
      'TransactionHistory.json',
    ).some(error => error.includes('must NOT have additional properties')),
  );
  const emptyHistory = {
    ...readJson(path.join(root, 'assets', 'TransactionHistory.json')),
    players: [],
    seasons: [],
  };
  assert.ok(
    validateWithSchema(
      ajv,
      'transaction-history.schema.json',
      emptyHistory,
      'TransactionHistory.json',
    ).some(error => error.includes('must NOT have fewer than 1 items')),
  );
});

test('semantic validation accepts the canonical bundle and reports stable rule IDs', () => {
  const valid = validateSemanticBundle(bundle, { root });
  assert.deepEqual(valid.errors, []);

  const duplicate = clone(bundle);
  duplicate.H2H.push(clone(duplicate.H2H[0]));
  assert.ok(validateSemanticBundle(duplicate, { root }).errors.some(error => error.includes('[H2H_DUPLICATE_GAME]')));

  const mismatched = clone(bundle);
  mismatched.SeasonSummary[0].points_for += 1;
  assert.ok(validateSemanticBundle(mismatched, { root }).errors.some(error => error.includes('[SUMMARY_POINTS_MISMATCH]')));

  const current = clone(bundle);
  current.CurrentSeason.games[0].season -= 1;
  assert.ok(validateSemanticBundle(current, { root }).errors.some(error => error.includes('[CURRENT_SEASON_MISMATCH]')));

  const invalidTransactionReference = clone(bundle);
  invalidTransactionReference.TransactionHistory.seasons[0].draft.picks[0].player_id = 'missing-player';
  assert.ok(
    validateSemanticBundle(invalidTransactionReference, { root }).errors
      .some(error => error.includes('[TRANSACTION_MISSING_PLAYER]')),
  );

  const invalidTransactionCoverage = clone(bundle);
  invalidTransactionCoverage.TransactionHistory.seasons[0].coverage.transaction_rounds.pop();
  assert.ok(
    validateSemanticBundle(invalidTransactionCoverage, { root }).errors
      .some(error => error.includes('[TRANSACTION_COVERAGE_ROUNDS]')),
  );

  const invalidTransactionSemantics = clone(bundle);
  const invalidSeason = invalidTransactionSemantics.TransactionHistory.seasons[0];
  const unknownOwner = 'Unknown Owner';
  const unknownPlayer = 'missing-player';
  invalidSeason.coverage.completed_week = invalidSeason.max_week + 1;
  invalidSeason.coverage.matchup_weeks.pop();
  invalidSeason.coverage.missing_player_metadata += 1;
  invalidSeason.draft.pick_count -= 1;
  invalidSeason.draft.draft_id = null;
  Object.assign(invalidSeason.draft.picks[0], {
    owner: unknownOwner,
    player_id: unknownPlayer,
    roster_id: invalidSeason.teams[0].roster_id,
  });
  const transaction = invalidSeason.transactions[0];
  transaction.week = invalidSeason.max_week + 1;
  transaction.participants.push(unknownOwner);
  transaction.adds.push({ owner: unknownOwner, player_id: unknownPlayer });
  transaction.draft_picks.push({
    season: invalidSeason.season,
    round: 1,
    roster_id: invalidSeason.teams[0].roster_id,
    original_owner: unknownOwner,
    owner: unknownOwner,
    previous_owner: unknownOwner,
  });
  transaction.waiver_budget.push({ sender: unknownOwner, receiver: unknownOwner, amount: 1 });
  Object.assign(invalidSeason.player_journeys[0].stints[0], {
    owner: unknownOwner,
    starter_points: 1.234,
  });
  invalidSeason.player_journeys[0].stints[0].acquisition.transaction_id = 'missing-transaction';
  Object.assign(invalidSeason.insights.trades[0], {
    edge_owner: unknownOwner,
    even: true,
    transaction_id: transaction.id,
  });
  invalidSeason.insights.trades[0].sides[0].owner = unknownOwner;
  invalidSeason.insights.trades[0].sides[0].players.push(unknownPlayer);
  Object.assign(invalidSeason.insights.wire_finds[0], {
    transaction_id: transaction.id,
    owner: unknownOwner,
    player_id: unknownPlayer,
  });
  invalidSeason.insights.movement_counts[0].player_id = unknownPlayer;
  invalidSeason.insights.owner_activity[0].owner = unknownOwner;
  invalidSeason.insights.draft_retention[0].owner = unknownOwner;
  invalidSeason.insights.keeper_return.push({
    owner: unknownOwner,
    player_id: unknownPlayer,
    round: 1,
    starts: 0,
    starter_points: 0,
  });
  const semanticErrors = validateSemanticBundle(invalidTransactionSemantics, { root }).errors;
  for (const ruleId of [
    'TRANSACTION_COMPLETED_WEEK',
    'TRANSACTION_DRAFT_RECONCILIATION',
    'TRANSACTION_INVALID_WEEK',
    'TRANSACTION_INVALID_STATUS_MUTATION',
    'TRANSACTION_MISSING_PLAYER',
    'TRANSACTION_OUTCOME_RECONCILIATION',
    'TRANSACTION_POINTS_PRECISION',
    'TRANSACTION_ROSTER_OWNER_MISMATCH',
    'TRANSACTION_UNKNOWN_OWNER',
  ]) {
    assert.ok(semanticErrors.some(error => error.includes(`[${ruleId}]`)), ruleId);
  }

  const staleInsights = clone(bundle);
  staleInsights.TransactionHistory.seasons[0].insights.wire_finds[0].starter_points += 1;
  assert.ok(
    validateSemanticBundle(staleInsights, { root }).errors
      .some(error => error.includes('[TRANSACTION_INSIGHT_RECONCILIATION]')),
  );
});

test('structural validation accepts injected values and reports required source files', () => {
  assert.deepEqual(validateStructuralAssets(root, {
    values: { TransactionHistory: bundle.TransactionHistory },
  }), []);

  const invalid = clone(bundle.TransactionHistory);
  invalid.seasons = [];
  assert.ok(validateStructuralAssets(root, {
    values: { TransactionHistory: invalid },
  }).some(error => error.includes('TransactionHistory.json')));

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-structural-'));
  try {
    fs.cpSync(path.join(root, 'schemas'), path.join(temp, 'schemas'), { recursive: true });
    assert.ok(validateStructuralAssets(temp, { includeGenerated: true })
      .some(error => error.includes('[ASSET_MISSING]')));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('canonical JSON hashing is independent of object key insertion order', () => {
  const a = { z: 1, nested: { b: 2, a: 1 } };
  const b = { nested: { a: 1, b: 2 }, z: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(sha256Json(a), sha256Json(b));
});

test('lowest-score policy excludes only both sides of the immutable Saunders outlier', () => {
  const target = bundle.H2H.find(game => game.season === 2022 && game.date === '2022-12-24' && game.teamA === 'Joel' && game.teamB === 'Plot');
  assert.deepEqual({ scoreA: target.scoreA, scoreB: target.scoreB, type: target.type }, { scoreA: 6.5, scoreB: 4.6, type: 'Saunders' });
  assert.equal(isLowestScoreEligible(target, 'Joel'), false);
  assert.equal(isLowestScoreEligible(target, 'Plot'), false);
  assert.equal(isLowestScoreEligible(target, 'Joe'), true);
  assert.equal(isLowestScoreEligible({ ...target, season: 2023 }, 'Joel'), true);
  assert.equal(isLowestScoreEligible({ ...target, type: 'Regular' }, 'Joel'), true);
  assert.equal(isLowestScoreEligible({ ...target, teamB: 'Nuss' }, 'Joel'), true);
  assert.equal(isLowestScoreEligible({ ...target, scoreA: 6.5, scoreB: 4.6 }, 'Joel'), false);
});

test('derived statistics match the current client calculations', async () => {
  const stats = await import('../js/stats-helpers.js');
  const gauntlet = await import('../js/gauntlet-data.js');
  const derived = buildDerivedStats(bundle);
  const clientAggregates = sortBy(stats.computeSeasonAggregatesAllTeams(bundle.H2H, bundle.SeasonSummary), row => `${row.season}|${row.team}`);
  const generatedAggregates = sortBy(derived.season_aggregates, row => `${row.season}|${row.team}`);
  assert.equal(generatedAggregates.length, clientAggregates.length);
  generatedAggregates.forEach((row, index) => {
    const expected = clientAggregates[index];
    for (const field of ['w', 'l', 't', 'n', 'pf', 'pa', 'actWins', 'expWins', 'pct', 'ppg', 'oppg', 'luck', 'diff']) {
      assert.ok(Math.abs(row[field] - expected[field]) < 1e-9, `${row.team} ${row.season} ${field}`);
    }
  });

  const clientAwards = stats.computeWeeklyAwards(bundle.H2H, 150);
  for (const field of ['top', 'low', 'high150']) {
    assert.deepEqual(sortBy(derived.weekly_awards[field], row => row.team), sortBy(clientAwards[field], row => row.team));
  }

  const clientBottom = stats.computeBottomNWeeklyScoresAllTeams(bundle.H2H, 25)
    .map(({ g: _game, ...row }) => row);
  assert.deepEqual(derived.records.bottom_scores, clientBottom);
  assert.equal(derived.records.bottom_scores.some(row => row.date === '2022-12-24' && ['Joel', 'Plot'].includes(row.team)), false);

  const clientPairs = sortBy(stats.computeHeadToHeadPairs(bundle.H2H, 0), row => `${row.team}|${row.opp}`);
  assert.deepEqual(derived.head_to_head_pairs, clientPairs);

  const clientTeamSeasons = gauntlet.buildTeamSeasons(bundle.H2H, bundle.SeasonSummary);
  assert.equal(derived.team_seasons.length, clientTeamSeasons.length);
  derived.team_seasons.forEach((row, index) => {
    const expected = clientTeamSeasons[index];
    assert.deepEqual(row.scores, expected.scores);
    for (const field of ['id', 'owner', 'season', 'games', 'mean', 'stdev', 'min', 'max', 'median', 'p25', 'p75', 'record', 'wins', 'losses', 'ties', 'finish', 'champion', 'saunders', 'bye', 'pointsFor', 'pointsAgainst']) {
      assert.deepEqual(row[field], expected[field], `${row.id} ${field}`);
    }
  });
});

test('manifest is deterministic, content-addressed, and excludes its own bytes', async () => {
  const first = await buildManifest(root);
  const second = await buildManifest(root);
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.data_version, second.data_version);
  assert.match(first.data_version, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.derived.required, false);
  assert.deepEqual(Object.keys(first.media.leagueHeroSource).sort(), ['fallback', 'path', 'role']);
  assert.deepEqual(await verifyManifest(root), []);

  const committed = readJson(path.join(root, 'assets/asset-manifest.json'));
  committed.data_version = `sha256:${'0'.repeat(64)}`;
  assert.equal((await buildManifest(root)).data_version, first.data_version);

  const temp = copyHeroFixture();
  try {
    for (const file of ['H2H.json', 'SeasonSummary.json', 'Rivalries.json', 'CurrentSeason.json', 'DraftSpot.json', 'DerivedStats.json']) {
      fs.copyFileSync(path.join(root, 'assets', file), path.join(temp, 'assets', file));
    }
    fs.writeFileSync(path.join(temp, 'assets/.LeaguePic.jpeg.icloud'), 'placeholder');
    const withPlaceholder = await buildManifest(temp);
    fs.rmSync(path.join(temp, 'assets/.LeaguePic.jpeg.icloud'));
    const withoutPlaceholder = await buildManifest(temp);
    assert.equal(canonicalJson(withPlaceholder), canonicalJson(withoutPlaceholder));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('manifest transaction coverage handles populated, empty, and generic assets', () => {
  assert.deepEqual(seasonCoverage('TransactionHistory', {
    seasons: [
      { season: 2025, transactions: [{}, {}] },
      { season: 2026, transactions: [{}] },
    ],
  }), { rows: 3, season_min: 2025, season_max: 2026 });
  assert.deepEqual(seasonCoverage('TransactionHistory', {}), {
    rows: 0,
    season_min: null,
    season_max: null,
  });
  assert.deepEqual(seasonCoverage('Rivalries', [{ slug: 'fixture' }]), {
    rows: 1,
    season_min: null,
    season_max: null,
  });
});

test('generated-file comparison reports equal, missing, and stale artifacts', () => {
  const committed = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-committed-'));
  const generated = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-generated-'));
  try {
    for (const directory of [committed, generated]) fs.mkdirSync(path.join(directory, 'nested'));
    fs.writeFileSync(path.join(committed, 'nested/equal.txt'), 'equal');
    fs.writeFileSync(path.join(generated, 'nested/equal.txt'), 'equal');
    fs.writeFileSync(path.join(committed, 'nested/stale.txt'), 'old');
    fs.writeFileSync(path.join(generated, 'nested/stale.txt'), 'new');
    fs.writeFileSync(path.join(generated, 'nested/missing.txt'), 'generated');
    assert.deepEqual(compareGeneratedFiles(committed, generated, ['nested/equal.txt']), []);
    assert.deepEqual(compareGeneratedFiles(committed, generated, [
      'nested/missing.txt',
      'nested/stale.txt',
    ]), [
      'nested/missing.txt: committed generated file is missing',
      'nested/stale.txt: stale; run npm run generate:data',
    ]);
    assert.equal(fromRoot(committed, 'nested/equal.txt'), path.join(committed, 'nested/equal.txt'));
  } finally {
    fs.rmSync(committed, { recursive: true, force: true });
    fs.rmSync(generated, { recursive: true, force: true });
  }
});

test('derived dependency checks reject stale source hashes', () => {
  const derived = readJson(path.join(root, 'assets/DerivedStats.json'));
  assert.deepEqual(validateDerivedDependencies(bundle, derived), []);
  const changed = clone(bundle);
  changed.H2H[0].scoreA += 0.1;
  assert.ok(validateDerivedDependencies(changed, derived).some(error => error.includes('H2H source hash is stale')));
});

test('Draft Spot dependency checks reject stale SeasonSummary hashes', () => {
  const draftSpot = readJson(path.join(root, 'assets/DraftSpot.json'));
  assert.deepEqual(validateDraftSpotDependencies(bundle, draftSpot), []);
  const changed = clone(bundle);
  changed.SeasonSummary[0].draft_pick = changed.SeasonSummary[0].draft_pick === 1 ? 2 : 1;
  assert.ok(validateDraftSpotDependencies(changed, draftSpot).some(error => error.includes('source hash is stale')));
});

test('media audit validates signatures and reports corruption and offloaded source state', async () => {
  const actual = await inspectHeroAssets(root);
  assert.deepEqual(actual.errors, []);
  assert.equal(actual.variants.length, 12);

  const temp = copyHeroFixture();
  try {
    fs.writeFileSync(path.join(temp, 'assets/.LeaguePic.jpeg.icloud'), 'placeholder');
    fs.writeFileSync(path.join(temp, 'assets/hero/league-480.webp'), 'corrupt');
    const corrupt = await inspectHeroAssets(temp);
    assert.ok(corrupt.errors.some(error => error.includes('[MEDIA_SIGNATURE]')));
    assert.ok(corrupt.warnings.some(warning => warning.includes('[MEDIA_SOURCE_OFFLOADED]')));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('media audit catches missing variants, wrong dimensions, and excessive sizes', async t => {
  await t.test('missing variant', async () => {
    const temp = copyHeroFixture();
    try {
      fs.writeFileSync(path.join(temp, 'assets/.LeaguePic.jpeg.icloud'), 'placeholder');
      fs.rmSync(path.join(temp, 'assets/hero/league-480.avif'));
      const result = await inspectHeroAssets(temp);
      assert.ok(result.errors.some(error => error.includes('[MEDIA_MISSING]') && error.includes('league-480.avif')));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  await t.test('wrong dimensions', async () => {
    const temp = copyHeroFixture();
    try {
      fs.writeFileSync(path.join(temp, 'assets/.LeaguePic.jpeg.icloud'), 'placeholder');
      await sharp({
        create: { width: 479, height: 300, channels: 3, background: '#2563eb' },
      }).jpeg().toFile(path.join(temp, 'assets/hero/league-480.jpg'));
      const result = await inspectHeroAssets(temp);
      assert.ok(result.errors.some(error => error.includes('[MEDIA_WIDTH]') && error.includes('league-480.jpg')));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  await t.test('excessive size', async () => {
    const temp = copyHeroFixture();
    try {
      fs.writeFileSync(path.join(temp, 'assets/.LeaguePic.jpeg.icloud'), 'placeholder');
      const requirement = HERO_REQUIREMENTS.find(row => row.file === 'league-480.jpg');
      const filePath = path.join(temp, 'assets/hero/league-480.jpg');
      const image = fs.readFileSync(filePath);
      fs.writeFileSync(filePath, Buffer.concat([image, Buffer.alloc(requirement.maxBytes + 1 - image.length)]));
      const result = await inspectHeroAssets(temp);
      assert.ok(result.errors.some(error => error.includes('[MEDIA_SIZE]') && error.includes('league-480.jpg')));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});

test('media audit rejects unavailable fallbacks and validates local original photos', async t => {
  await t.test('unavailable regeneration fallback', async () => {
    const temp = copyHeroFixture();
    try {
      fs.rmSync(path.join(temp, 'assets/hero/league-1920.jpg'));
      const result = await inspectHeroAssets(temp);
      assert.ok(result.errors.some(error => error.includes('[MEDIA_REGENERATION_SOURCE_MISSING]')));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  await t.test('invalid local original uses the verified fallback', async () => {
    const temp = copyHeroFixture();
    try {
      fs.writeFileSync(path.join(temp, 'assets/LeaguePic.jpeg'), 'not an image');
      const result = await inspectHeroAssets(temp);
      assert.equal(result.source.available, false);
      assert.equal(result.source.invalid, true);
      assert.ok(result.warnings.some(warning => warning.includes('[MEDIA_SOURCE_INVALID]')));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  await t.test('truncated local original fails a full pixel decode', async () => {
    const temp = copyHeroFixture();
    try {
      const source = fs.readFileSync(path.join(root, 'assets/hero/league-1920.jpg'));
      fs.writeFileSync(
        path.join(temp, 'assets/LeaguePic.jpeg'),
        source.subarray(0, Math.floor(source.length * 0.95)),
      );
      const result = await inspectHeroAssets(temp);
      assert.equal(result.source.available, false);
      assert.equal(result.source.invalid, true);
      assert.ok(result.warnings.some(warning => warning.includes('[MEDIA_SOURCE_INVALID]')));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  await t.test('decodable local original is accepted', async () => {
    const temp = copyHeroFixture();
    try {
      await sharp({
        create: { width: 32, height: 20, channels: 3, background: '#2563eb' },
      }).jpeg().toFile(path.join(temp, 'assets/LeaguePic.jpeg'));
      const result = await inspectHeroAssets(temp);
      assert.equal(result.source.available, true);
      assert.equal(result.source.invalid, false);
      assert.ok(!result.warnings.some(warning => warning.includes('[MEDIA_SOURCE_INVALID]')));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});

test('manifest schema rejects repository path traversal', () => {
  const ajv = createAjv(root);
  const manifest = readJson(path.join(root, 'assets/asset-manifest.json'));
  manifest.assets.H2H.path = '../H2H.json';
  const errors = validateWithSchema(ajv, 'asset-manifest.schema.json', manifest, 'asset-manifest.json');
  assert.ok(errors.some(error => error.includes('field "assets.H2H.path"')));
});

test('committed generated contracts and artifacts have no drift', async () => {
  assert.deepEqual(await checkGeneratedAssets(root), []);
});
