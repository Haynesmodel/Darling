import test from 'node:test';
import assert from 'node:assert/strict';

import { readDraftSpotControls } from '../js/draft-spot-controls.js';

function makeDoc(values = {}) {
  return {
    getElementById(id) {
      if (!(id in values)) return null;
      return values[id];
    },
  };
}

test('draft spot controls promote zone selection and let explicit mode changes clear selections', () => {
  const zoneDoc = makeDoc({
    draftModeSelect: { value: 'league' },
    draftOwnerSelect: { value: '__ALL__' },
    draftStartSeason: { value: '2017' },
    draftEndSeason: { value: '2025' },
    draftMetricSelect: { value: 'avgFinish' },
    draftMinSampleSelect: { value: '1' },
    draftNormalizeToggle: { checked: false },
    draftZoneSelect: { value: 'late' },
  });

  const zoneState = readDraftSpotControls({
    doc: zoneDoc,
    previousState: { mode: 'league', selectedPick: 10 },
    changedControl: 'draftZoneSelect',
  });
  assert.equal(zoneState.mode, 'zone');
  assert.equal(zoneState.selectedPick, null);
  assert.equal(zoneState.selectedZone, 'late');

  const modeDoc = makeDoc({
    draftModeSelect: { value: 'league' },
    draftOwnerSelect: { value: '__ALL__' },
    draftStartSeason: { value: '2017' },
    draftEndSeason: { value: '2025' },
    draftMetricSelect: { value: 'avgFinish' },
    draftMinSampleSelect: { value: '1' },
    draftNormalizeToggle: { checked: true },
    draftZoneSelect: { value: 'late' },
  });

  const leagueState = readDraftSpotControls({
    doc: modeDoc,
    previousState: { mode: 'zone', selectedZone: 'late', selectedPick: null },
    changedControl: 'draftModeSelect',
  });
  assert.equal(leagueState.mode, 'league');
  assert.equal(leagueState.normalize, 'percentile');
  assert.equal(leagueState.selectedPick, null);
  assert.equal(leagueState.selectedZone, null);

  const ownerDoc = makeDoc({
    draftModeSelect: { value: 'pick' },
    draftOwnerSelect: { value: 'Joe' },
    draftStartSeason: { value: '2017' },
    draftEndSeason: { value: '2025' },
    draftMetricSelect: { value: 'avgFinish' },
    draftMinSampleSelect: { value: '1' },
    draftNormalizeToggle: { checked: false },
    draftZoneSelect: { value: '' },
  });

  const ownerState = readDraftSpotControls({
    doc: ownerDoc,
    previousState: { mode: 'pick', selectedPick: 10 },
    changedControl: 'draftOwnerSelect',
  });
  assert.equal(ownerState.mode, 'owner');
  assert.equal(ownerState.owner, 'Joe');
  assert.equal(ownerState.selectedPick, null);
  assert.equal(ownerState.selectedZone, null);
});
