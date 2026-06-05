import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableDynastySeasons,
  buildDynastyControls,
  normalizeDynastyRange,
  resolveDynastyInitialState,
} from '../js/dynasty-controls.js';

function makeSelect() {
  const listeners = {};
  return {
    dataset: {},
    innerHTML: '',
    value: '',
    checked: false,
    disabled: false,
    textContent: '',
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    trigger(type) {
      if (listeners[type]) listeners[type]({ target: this });
    },
  };
}

function makeDoc(map) {
  return {
    getElementById(id) {
      return map[id] || null;
    },
  };
}

test('availableDynastySeasons and normalizeDynastyRange preserve requested bounds', () => {
  const seasons = availableDynastySeasons([
    { season: 2023 },
    { season: 2021 },
    { season: 2022 },
  ]);
  assert.deepEqual(seasons, [2021, 2022, 2023]);

  const range = normalizeDynastyRange({
    availableSeasons: seasons,
    requestedStartSeason: 2018,
    requestedEndSeason: 2030,
  });
  assert.equal(range.startSeason, 2021);
  assert.equal(range.endSeason, 2023);
  assert.equal(range.requestedStartSeason, 2018);
  assert.equal(range.requestedEndSeason, 2030);
});

test('resolveDynastyInitialState defaults to Joe and latest seasons', () => {
  const state = resolveDynastyInitialState({
    seasonSummaries: [
      { season: 2021, owner: 'Joe' },
      { season: 2022, owner: 'Shap' },
      { season: 2023, owner: 'Nuss' },
      { season: 2024, owner: 'Joe' },
      { season: 2025, owner: 'Joel' },
    ],
  });

  assert.equal(state.mode, 'calculator');
  assert.equal(state.owner, 'Joe');
  assert.equal(state.startSeason, 2023);
  assert.equal(state.endSeason, 2025);
  assert.equal(state.minSeasons, 2);
  assert.equal(state.includeSaundersPenalty, true);
});

test('buildDynastyControls populates controls and emits normalized changes', () => {
  const modeSelect = makeSelect();
  const ownerSelect = makeSelect();
  const startSelect = makeSelect();
  const endSelect = makeSelect();
  const minSeasonSelect = makeSelect();
  const saundersToggle = makeSelect();
  const hint = makeSelect();
  const doc = makeDoc({
    dynastyModeSelect: modeSelect,
    dynastyOwnerSelect: ownerSelect,
    dynastyStartSeason: startSelect,
    dynastyEndSeason: endSelect,
    dynastyMinSeasons: minSeasonSelect,
    dynastySaundersToggle: saundersToggle,
    dynastyControlHint: hint,
  });
  const changes = [];

  const result = buildDynastyControls({
    doc,
    seasonSummaries: [
      { season: 2021, owner: 'Joe' },
      { season: 2021, owner: 'Shap' },
      { season: 2022, owner: 'Joe' },
      { season: 2022, owner: 'Shap' },
      { season: 2023, owner: 'Joe' },
      { season: 2023, owner: 'Shap' },
    ],
    onChange: (next) => changes.push(next),
  });

  assert.equal(result.mode, 'calculator');
  assert.equal(result.owner, 'Joe');
  assert.equal(modeSelect.dataset.bound, '1');
  assert.equal(ownerSelect.dataset.bound, '1');
  assert.equal(ownerSelect.disabled, false);
  assert.equal(startSelect.disabled, false);
  assert.equal(endSelect.disabled, false);
  assert.match(hint.textContent, /Individual scores one owner/);
  assert.match(modeSelect.innerHTML, /Rolling 3-Year Windows/);
  assert.match(ownerSelect.innerHTML, /value="Joe"/);
  assert.doesNotMatch(ownerSelect.innerHTML, /All Owners/);
  assert.deepEqual(changes, [{
    mode: 'calculator',
    owner: 'Joe',
    startSeason: 2021,
    endSeason: 2023,
    requestedStartSeason: 2021,
    requestedEndSeason: 2023,
    minSeasons: 2,
    includeSaundersPenalty: true,
  }]);

  ownerSelect.value = 'Shap';
  ownerSelect.trigger('change');
  assert.equal(ownerSelect.value, 'Shap');
  assert.equal(changes.at(-1).owner, 'Shap');
  assert.equal(changes.at(-1).mode, 'calculator');

  modeSelect.value = 'all-time';
  modeSelect.trigger('change');
  assert.equal(ownerSelect.disabled, true);
  assert.equal(startSelect.disabled, true);
  assert.equal(endSelect.disabled, true);
  assert.equal(ownerSelect.value, '__ALL__');
  assert.match(hint.textContent, /All-Time Leaderboard/);
  assert.match(ownerSelect.innerHTML, /All Owners/);

  ownerSelect.value = '__ALL__';
  ownerSelect.trigger('change');
  const last = changes.at(-1);
  assert.equal(last.mode, 'all-time');
  assert.equal(last.owner, 'Shap');
});
