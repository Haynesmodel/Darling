import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrophyControls,
  resolveInitialOwner,
} from '../js/trophy-controls.js';

function makeSelect() {
  const listeners = {};
  return {
    dataset: {},
    innerHTML: '',
    value: '',
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    trigger(type) {
      if (listeners[type]) {
        listeners[type]({ target: this });
      }
    },
  };
}

function makeDoc(select) {
  return {
    getElementById(id) {
      return id === 'trophyOwnerSelect' ? select : null;
    },
  };
}

test('resolveInitialOwner prefers Joe then the first owner', () => {
  assert.equal(resolveInitialOwner(['Zook', 'Joe', 'Shap'], 'Shap'), 'Shap');
  assert.equal(resolveInitialOwner(['Zook', 'Joe', 'Shap'], 'Missing'), 'Joe');
  assert.equal(resolveInitialOwner(['Zook', 'Shap'], 'Missing'), 'Zook');
});

test('buildTrophyControls populates owners and emits selected owner changes', () => {
  const select = makeSelect();
  const doc = makeDoc(select);
  const changes = [];

  const result = buildTrophyControls({
    doc,
    leagueGames: [
      { teamA: 'Joe', teamB: 'Shap' },
      { teamA: 'Joel', teamB: 'Zook' },
    ],
    seasonSummaries: [
      { owner: 'Joe' },
      { owner: 'Joel' },
      { owner: 'Shap' },
      { owner: 'Zook' },
    ],
    selectedOwner: 'Missing',
    allTeams: '__ALL__',
    onChange: (next) => changes.push(next),
  });

  assert.equal(result.selectedOwner, 'Joe');
  assert.equal(select.dataset.bound, '1');
  assert.match(select.innerHTML, /value="Joe"/);
  assert.match(select.innerHTML, /value="Joel"/);
  assert.doesNotMatch(select.innerHTML, /All Teams/);
  assert.deepEqual(changes, [{ selectedOwner: 'Joe' }]);

  select.value = 'Joel';
  select.trigger('change');
  assert.deepEqual(changes, [
    { selectedOwner: 'Joe' },
    { selectedOwner: 'Joel' },
  ]);
});
