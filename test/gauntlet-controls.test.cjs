const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let controls;

test.before(async () => {
  controls = await import(`${pathToFileURL(path.join(__dirname, '../js/gauntlet-controls.js')).href}?${Date.now()}`);
});

function season(owner, year, score = 100) {
  return {
    id: `${owner}:${year}`,
    owner,
    season: year,
    average: score,
    games: 14,
    standardDeviation: 10,
  };
}

const teamSeasons = [
  season('Alpha', 2024, 110),
  season('Alpha', 2023, 105),
  season('Beta', 2022, 100),
];

test('gauntlet state derives distinct best teams and handles empty data', () => {
  const selected = controls.resolveGauntletInitialState({ teamSeasons });
  assert.equal(selected.selectedOwnerA, 'Alpha');
  assert.equal(selected.selectedSeasonA, 2024);
  assert.equal(selected.selectedOwnerB, 'Beta');
  assert.equal(selected.selectedSeasonB, 2022);
  assert.equal(selected.seedSource, 'derived');
  assert.match(selected.seed, /Alpha:2024\|Beta:2022/);

  const sameOwner = controls.resolveGauntletInitialState({
    teamSeasons: teamSeasons.slice(0, 2),
  });
  assert.equal(sameOwner.selectedOwnerA, 'Alpha');
  assert.equal(sameOwner.selectedOwnerB, 'Alpha');
  assert.notEqual(sameOwner.selectedSeasonA, sameOwner.selectedSeasonB);

  const single = controls.resolveGauntletInitialState({ teamSeasons: [teamSeasons[0]] });
  assert.equal(single.selectedOwnerB, 'Alpha');
  assert.equal(single.selectedSeasonB, 2024);

  assert.deepEqual(
    controls.resolveGauntletInitialState().selectedOwnerA,
    null,
  );
});

test('gauntlet state normalizes invalid URLs, clamps simulations, and preserves explicit seeds', () => {
  const invalid = controls.resolveGauntletInitialState({
    teamSeasons,
    urlState: {
      gauntletA: 'Missing:9999',
      gauntletB: 'also-invalid',
      gauntletModel: 'unknown',
      gauntletIncludePostseason: false,
      gauntletSimulations: Number.POSITIVE_INFINITY,
    },
  });
  assert.equal(invalid.selectedOwnerA, 'Alpha');
  assert.equal(invalid.selectedOwnerB, 'Beta');
  assert.equal(invalid.selectedModel, 'hybrid');
  assert.equal(invalid.selectedSimulations, 10000);

  const explicit = controls.resolveGauntletInitialState({
    teamSeasons,
    urlState: {
      gauntletA: 'Beta:2022',
      gauntletB: 'Alpha:2023',
      gauntletModel: 'historical',
      gauntletIncludePostseason: true,
      gauntletSimulations: 99999,
      gauntletSeed: ' fixed-seed ',
    },
  });
  assert.equal(explicit.selectedModel, 'historical');
  assert.equal(explicit.selectedIncludePostseason, true);
  assert.equal(explicit.selectedSimulations, 50000);
  assert.equal(explicit.seed, ' fixed-seed ');
  assert.equal(explicit.seedSource, 'explicit');

  const preserved = controls.resolveGauntletInitialState({
    teamSeasons,
    currentState: {
      ...explicit,
      selectedSimulations: -4,
      seed: 'preserved',
      seedSource: 'explicit',
    },
  });
  assert.equal(preserved.selectedSimulations, 1);
  assert.equal(preserved.seed, 'preserved');
});

test('gauntlet controls return safe fallbacks without a document', () => {
  const selected = controls.resolveGauntletInitialState({ teamSeasons });
  assert.equal(controls.buildGauntletControls({
    doc: null,
    teamSeasons,
    selectedState: selected,
  }), selected);
  assert.deepEqual(controls.readGauntletControls({ doc: null }), {
    selectedOwnerA: null,
    selectedSeasonA: null,
    selectedOwnerB: null,
    selectedSeasonB: null,
    selectedModel: 'hybrid',
    selectedIncludePostseason: false,
    selectedSimulations: 10000,
    seed: null,
    seedSource: 'derived',
  });
  assert.equal(controls.syncGauntletControls({
    doc: { getElementById: () => null },
    teamSeasons,
    selectedState: selected,
  }), null);
});
