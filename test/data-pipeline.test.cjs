const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const { canonicalJson, readJson, sha256Json } = require('../scripts/data/canonical-json.cjs');
const { HERO_REQUIREMENTS } = require('../scripts/data/constants.cjs');
const { buildDerivedStats } = require('../scripts/data/derived-stats.cjs');
const { buildManifest, verifyManifest } = require('../scripts/data/manifest.cjs');
const { inspectHeroAssets } = require('../scripts/data/media-validation.cjs');
const { createAjv, validateWithSchema } = require('../scripts/data/schema-validation.cjs');
const { validateSemanticBundle } = require('../scripts/data/semantic-validation.cjs');
const { checkGeneratedAssets } = require('../scripts/check_generated_assets.cjs');
const { validateDraftSpotDependencies, validateDerivedDependencies } = require('../scripts/validate_assets.cjs');

const root = path.join(__dirname, '..');
const bundle = {
  H2H: readJson(path.join(root, 'assets', 'H2H.json')),
  SeasonSummary: readJson(path.join(root, 'assets', 'SeasonSummary.json')),
  Rivalries: readJson(path.join(root, 'assets', 'Rivalries.json')),
  CurrentSeason: readJson(path.join(root, 'assets', 'CurrentSeason.json')),
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
});

test('canonical JSON hashing is independent of object key insertion order', () => {
  const a = { z: 1, nested: { b: 2, a: 1 } };
  const b = { nested: { a: 1, b: 2 }, z: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(sha256Json(a), sha256Json(b));
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
