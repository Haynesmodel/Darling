import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCurrentSeasonControls,
  resolveCurrentSeasonState,
} from '../js/current-season-controls.js';

function makeSelect() {
  return {
    innerHTML: '',
    value: '',
    disabled: false,
    dataset: {},
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
  };
}

test('current-season controls populate and emit projection mode changes', () => {
  const currentSeason = {
    season: 2026,
    current_week: 1,
    games: [
      { season: 2026, week: 1, teamA: 'Joe', teamB: 'Shap', scoreA: 10, scoreB: 8, type: 'Regular', status: 'live' },
    ],
  };
  const elements = new Map([
    ['currentSeasonSelect', makeSelect()],
    ['currentWeekSelect', makeSelect()],
    ['currentOwnerSelect', makeSelect()],
    ['currentViewSelect', makeSelect()],
    ['currentProjectionSelect', makeSelect()],
  ]);
  const doc = { getElementById(id) { return elements.get(id) || null; } };
  let emitted = null;

  const state = buildCurrentSeasonControls({
    doc,
    currentSeason,
    selectedSeason: 2026,
    selectedWeek: 1,
    selectedOwner: 'Joe',
    selectedView: 'standings',
    selectedProjectionMode: 'current',
    onChange(next) { emitted = next; },
  });

  assert.equal(state.selectedProjectionMode, 'current');
  assert.match(elements.get('currentProjectionSelect').innerHTML, /Completed Only/);
  assert.equal(elements.get('currentProjectionSelect').value, 'current');

  elements.get('currentProjectionSelect').value = 'ifScoresHold';
  elements.get('currentProjectionSelect').listeners.change();
  assert.equal(emitted.selectedProjectionMode, 'ifScoresHold');
  assert.equal(emitted.selectedView, 'standings');
  assert.equal(emitted.selectedOwner, 'Joe');
});

test('current-season state normalizes invalid projection modes', () => {
  const state = resolveCurrentSeasonState({
    currentSeason: {
      season: 2026,
      current_week: 1,
      games: [
        { season: 2026, week: 1, teamA: 'Joe', teamB: 'Shap', scoreA: 10, scoreB: 8, type: 'Regular' },
      ],
    },
    selectedProjectionMode: 'bad-mode',
  });
  assert.equal(state.selectedProjectionMode, 'ifScoresHold');
});
