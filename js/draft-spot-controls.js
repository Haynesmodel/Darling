import { escapeHtml } from './render-helpers.js';
import {
  DRAFT_ALL_OWNERS,
  DRAFT_METRICS,
  DRAFT_VIEW_MODES,
  DRAFT_ZONES,
  normalizeDraftAsset,
  resolveDraftSpotState,
} from './draft-spot-data.js';

function optionHtml(value, label, selectedValue) {
  const selected = String(value) === String(selectedValue) ? ' selected' : '';
  return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
}

function metricOptions(selectedMetric) {
  return Object.values(DRAFT_METRICS)
    .map(metric => optionHtml(metric.key, metric.label, selectedMetric))
    .join('');
}

function buildDraftSpotControls(opts = {}) {
  const root = opts.doc || (typeof document !== 'undefined' ? document : null);
  const container = root?.getElementById('draftControls');
  if (!container) return null;

  const asset = normalizeDraftAsset(opts.asset);
  const state = resolveDraftSpotState(asset, opts.selectedState || {}, opts.currentState || {});
  const seasons = [...new Set((asset?.rows || []).map(row => row.season))].sort((a, b) => a - b);
  const owners = [...new Set((asset?.rows || []).map(row => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const minSamples = [1, 2, 3, 5];

  container.innerHTML = `
    <label>Mode:
      <select id="draftModeSelect">
        ${DRAFT_VIEW_MODES.map(mode => optionHtml(mode.key, mode.label, state.mode)).join('')}
      </select>
    </label>
    <label>Owner:
      <select id="draftOwnerSelect">
        ${optionHtml(DRAFT_ALL_OWNERS, 'All Owners', state.owner)}
        ${owners.map(owner => optionHtml(owner, owner, state.owner)).join('')}
      </select>
    </label>
    <label>Start:
      <select id="draftStartSeason">
        ${seasons.map(season => optionHtml(season, season, state.startSeason)).join('')}
      </select>
    </label>
    <label>End:
      <select id="draftEndSeason">
        ${seasons.map(season => optionHtml(season, season, state.endSeason)).join('')}
      </select>
    </label>
    <label>Metric:
      <select id="draftMetricSelect">${metricOptions(state.metric)}</select>
    </label>
    <label>Minimum Sample:
      <select id="draftMinSampleSelect">
        ${minSamples.map(value => optionHtml(value, value, state.minSample)).join('')}
      </select>
    </label>
    <label class="checkbox-label">
      <input type="checkbox" id="draftNormalizeToggle"${state.normalize === 'percentile' ? ' checked' : ''} />
      Draft percentile
    </label>
    <label>Zone:
      <select id="draftZoneSelect">
        ${optionHtml('', 'All Zones', state.selectedZone || '')}
        ${DRAFT_ZONES.map(zone => optionHtml(zone.key, zone.label, state.selectedZone || '')).join('')}
      </select>
    </label>
  `;

  container.onchange = (event) => {
    if (typeof opts.onChange === 'function') {
      const changedControl = typeof event?.target?.id === 'string' ? event.target.id : '';
      opts.onChange(readDraftSpotControls({ doc: root, previousState: state, changedControl }));
    }
  };

  return state;
}

function readDraftSpotControls(opts = {}) {
  const root = opts.doc || (typeof document !== 'undefined' ? document : null);
  const previousState = opts.previousState || {};
  const changedControl = opts.changedControl || '';
  let mode = root?.getElementById('draftModeSelect')?.value || previousState.mode || 'league';
  const owner = root?.getElementById('draftOwnerSelect')?.value || previousState.owner || DRAFT_ALL_OWNERS;
  const startSeason = Number(root?.getElementById('draftStartSeason')?.value || previousState.startSeason);
  const endSeason = Number(root?.getElementById('draftEndSeason')?.value || previousState.endSeason);
  const metric = root?.getElementById('draftMetricSelect')?.value || previousState.metric || 'avgFinish';
  const minSample = Number(root?.getElementById('draftMinSampleSelect')?.value || previousState.minSample || 1);
  const normalize = root?.getElementById('draftNormalizeToggle')?.checked ? 'percentile' : 'raw';
  let selectedZone = root?.getElementById('draftZoneSelect')?.value || null;
  let selectedPick = previousState.selectedPick || null;

  if (changedControl === 'draftModeSelect') {
    selectedPick = null;
    selectedZone = null;
  } else if (changedControl === 'draftOwnerSelect') {
    mode = owner === DRAFT_ALL_OWNERS ? 'league' : 'owner';
    selectedPick = null;
    selectedZone = null;
  } else if (changedControl === 'draftZoneSelect' && selectedZone) {
    mode = 'zone';
    selectedPick = null;
  } else if (mode !== 'pick') {
    selectedPick = null;
  }

  return {
    ...previousState,
    mode,
    owner,
    startSeason,
    endSeason,
    metric,
    minSample,
    normalize,
    selectedPick: selectedZone ? null : selectedPick,
    selectedZone,
  };
}

function syncDraftSpotControls(opts = {}) {
  return buildDraftSpotControls(opts);
}

export {
  buildDraftSpotControls,
  readDraftSpotControls,
  syncDraftSpotControls,
};
