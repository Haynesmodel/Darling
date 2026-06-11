import { escapeHtml } from './render-helpers.js';
import { bestTeamSeason, parseTeamSeasonId, teamSeasonId, teamSeasonsForOwner } from './gauntlet-data.js';

const GAUNTLET_SIMULATION_OPTIONS = [1000, 2500, 5000, 10000, 25000, 50000];

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function ownerOptions(teamSeasons) {
  return [...new Set(teamSeasons.map(teamSeason => teamSeason.owner))].sort((a, b) => a.localeCompare(b));
}

function seasonOptionsForOwner(teamSeasons, owner) {
  return teamSeasonsForOwner(teamSeasons, owner).map(teamSeason => teamSeason.season);
}

function defaultSeedForState(state) {
  return `${teamSeasonId(state.selectedOwnerA, state.selectedSeasonA)}|${teamSeasonId(state.selectedOwnerB, state.selectedSeasonB)}|${state.selectedModel}|${state.selectedIncludePostseason ? 'postseason' : 'regular'}|${state.selectedSimulations}`;
}

function clampSimulations(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10000;
  return Math.max(1, Math.min(50000, Math.floor(parsed)));
}

function normalizeSelection(teamSeasons, owner, season, fallbackOwner) {
  const owners = ownerOptions(teamSeasons);
  const resolvedOwner = owners.includes(owner) ? owner : (owners.includes(fallbackOwner) ? fallbackOwner : (owners[0] || null));
  if (!resolvedOwner) return { owner: null, season: null };
  const seasons = seasonOptionsForOwner(teamSeasons, resolvedOwner);
  const resolvedSeason = seasons.includes(Number(season)) ? Number(season) : (seasons[0] ?? null);
  return { owner: resolvedOwner, season: resolvedSeason };
}

function defaultState(teamSeasons) {
  const joeBest = bestTeamSeason(teamSeasons, 'Joe') || bestTeamSeason(teamSeasons);
  const nonJoeBest = bestTeamSeason(teamSeasons.filter(teamSeason => teamSeason.owner !== 'Joe'));
  const sideA = joeBest || null;
  const sideB = nonJoeBest || bestTeamSeason(teamSeasons.filter(teamSeason => !sideA || teamSeason.id !== sideA.id)) || sideA;

  return {
    selectedOwnerA: sideA?.owner ?? null,
    selectedSeasonA: sideA?.season ?? null,
    selectedOwnerB: sideB?.owner ?? null,
    selectedSeasonB: sideB?.season ?? null,
    selectedModel: 'hybrid',
    selectedIncludePostseason: false,
    selectedSimulations: 10000,
    seed: defaultSeedForState({
      selectedOwnerA: sideA?.owner ?? 'A',
      selectedSeasonA: sideA?.season ?? '0',
      selectedOwnerB: sideB?.owner ?? 'B',
      selectedSeasonB: sideB?.season ?? '0',
      selectedModel: 'hybrid',
      selectedIncludePostseason: false,
      selectedSimulations: 10000,
    }),
    seedSource: 'derived',
  };
}

function resolveGauntletInitialState({ teamSeasons = [], urlState = null, currentState = null } = {}) {
  const base = currentState && currentState.selectedOwnerA
    ? currentState
    : defaultState(teamSeasons);

  const parsedA = urlState?.gauntletA ? parseTeamSeasonId(urlState.gauntletA) : null;
  const parsedB = urlState?.gauntletB ? parseTeamSeasonId(urlState.gauntletB) : null;
  const selectedA = parsedA
    ? normalizeSelection(teamSeasons, parsedA.owner, parsedA.season, base.selectedOwnerA)
    : normalizeSelection(teamSeasons, base.selectedOwnerA, base.selectedSeasonA, base.selectedOwnerA);
  const selectedB = parsedB
    ? normalizeSelection(teamSeasons, parsedB.owner, parsedB.season, base.selectedOwnerB)
    : normalizeSelection(teamSeasons, base.selectedOwnerB, base.selectedSeasonB, base.selectedOwnerB);

  const selectedModel = urlState?.gauntletModel === 'historical'
    ? 'historical'
    : (base.selectedModel || 'hybrid');
  const selectedIncludePostseason = urlState?.gauntletIncludePostseason === null || urlState?.gauntletIncludePostseason === undefined
    ? !!base.selectedIncludePostseason
    : !!urlState.gauntletIncludePostseason;
  const selectedSimulations = clampSimulations(urlState?.gauntletSimulations ?? base.selectedSimulations);
  const explicitSeed = typeof urlState?.gauntletSeed === 'string' && urlState.gauntletSeed.trim();
  const seedSource = explicitSeed ? 'explicit' : (base.seedSource || 'derived');
  const seed = explicitSeed
    ? urlState.gauntletSeed
    : (seedSource === 'explicit' && base.seed ? base.seed : defaultSeedForState({
      selectedOwnerA: selectedA.owner,
      selectedSeasonA: selectedA.season,
      selectedOwnerB: selectedB.owner,
      selectedSeasonB: selectedB.season,
      selectedModel,
      selectedIncludePostseason,
      selectedSimulations,
    }));

  return {
    selectedOwnerA: selectedA.owner,
    selectedSeasonA: selectedA.season,
    selectedOwnerB: selectedB.owner,
    selectedSeasonB: selectedB.season,
    selectedModel,
    selectedIncludePostseason,
    selectedSimulations,
    seed,
    seedSource,
  };
}

function selectHtml(options, selectedValue, attrs = '') {
  return options.map(option => {
    const value = typeof option === 'object' ? option.value : option;
    const label = typeof option === 'object' ? option.label : option;
    const selected = `${value}` === `${selectedValue}` ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
  }).join('');
}

function renderControlsHtml(teamSeasons, state) {
  const owners = ownerOptions(teamSeasons);
  const seasonsA = seasonOptionsForOwner(teamSeasons, state.selectedOwnerA);
  const seasonsB = seasonOptionsForOwner(teamSeasons, state.selectedOwnerB);
  const eraAdjustedChecked = state.selectedModel !== 'historical';
  const includePostseasonChecked = !!state.selectedIncludePostseason;
  return `
    <div class="gauntlet-controls-grid">
      <label class="gauntlet-field">
        <span>Owner A</span>
        <select id="gauntletOwnerA" aria-label="Owner A">${selectHtml(owners, state.selectedOwnerA)}</select>
      </label>
      <label class="gauntlet-field">
        <span>Season A</span>
        <select id="gauntletSeasonA" aria-label="Season A">${selectHtml(seasonsA, state.selectedSeasonA)}</select>
      </label>
      <label class="gauntlet-field">
        <span>Owner B</span>
        <select id="gauntletOwnerB" aria-label="Owner B">${selectHtml(owners, state.selectedOwnerB)}</select>
      </label>
      <label class="gauntlet-field">
        <span>Season B</span>
        <select id="gauntletSeasonB" aria-label="Season B">${selectHtml(seasonsB, state.selectedSeasonB)}</select>
      </label>
      <label class="gauntlet-field gauntlet-field-checkbox">
        <span>Model</span>
        <span class="gauntlet-checkbox-row">
          <input type="checkbox" id="gauntletEraAdjusted" aria-label="Era-adjusted model" ${eraAdjustedChecked ? 'checked' : ''} />
          <span>Era-adjusted</span>
        </span>
        <span class="gauntlet-checkbox-row">
          <input type="checkbox" id="gauntletIncludePostseason" aria-label="Include postseason" ${includePostseasonChecked ? 'checked' : ''} />
          <span>Include postseason</span>
        </span>
      </label>
      <label class="gauntlet-field">
        <span>Simulations</span>
        <select id="gauntletSimulations" aria-label="Simulation count">${selectHtml(GAUNTLET_SIMULATION_OPTIONS, state.selectedSimulations)}</select>
      </label>
      <div class="gauntlet-actions">
        <button type="button" id="gauntletRerollBtn" class="btn primary">Reroll Seed</button>
        <div class="gauntlet-seed" id="gauntletSeedValue">Seed: ${escapeHtml(state.seed || '')}</div>
      </div>
    </div>
  `;
}

function applyStateToControls({ doc, teamSeasons, selectedState }) {
  const root = docOrDefault(doc);
  if (!root) return null;
  const container = root.getElementById('gauntletControls');
  if (!container) return null;

  container.innerHTML = renderControlsHtml(teamSeasons, selectedState);
  container.dataset.ready = '1';
  container.dataset.seed = selectedState.seed || '';
  container.dataset.seedSource = selectedState.seedSource || 'derived';

  const ownerA = root.getElementById('gauntletOwnerA');
  const seasonA = root.getElementById('gauntletSeasonA');
  const ownerB = root.getElementById('gauntletOwnerB');
  const seasonB = root.getElementById('gauntletSeasonB');
  const eraAdjusted = root.getElementById('gauntletEraAdjusted');
  const includePostseason = root.getElementById('gauntletIncludePostseason');
  const sims = root.getElementById('gauntletSimulations');

  if (ownerA) ownerA.value = `${selectedState.selectedOwnerA ?? ''}`;
  if (ownerB) ownerB.value = `${selectedState.selectedOwnerB ?? ''}`;
  if (eraAdjusted) eraAdjusted.checked = selectedState.selectedModel !== 'historical';
  if (includePostseason) includePostseason.checked = !!selectedState.selectedIncludePostseason;
  if (sims) sims.value = `${selectedState.selectedSimulations}`;

  const syncSeasonOptions = (select, owner, season) => {
    if (!select) return;
    const seasons = seasonOptionsForOwner(teamSeasons, owner);
    select.innerHTML = selectHtml(seasons, season);
    select.value = `${season ?? ''}`;
  };

  syncSeasonOptions(seasonA, selectedState.selectedOwnerA, selectedState.selectedSeasonA);
  syncSeasonOptions(seasonB, selectedState.selectedOwnerB, selectedState.selectedSeasonB);

  const seedValue = root.getElementById('gauntletSeedValue');
  if (seedValue) seedValue.textContent = `Seed: ${selectedState.seed || ''}`;

  return container;
}

function updateStateFromControls({ doc, teamSeasons, onChange, side = null }) {
  const root = docOrDefault(doc);
  if (!root) return;
  const ownerA = root.getElementById('gauntletOwnerA');
  const seasonA = root.getElementById('gauntletSeasonA');
  const ownerB = root.getElementById('gauntletOwnerB');
  const seasonB = root.getElementById('gauntletSeasonB');

  const applySide = (ownerSelect, seasonSelect) => {
    if (!ownerSelect || !seasonSelect) return;
    const seasons = seasonOptionsForOwner(teamSeasons, ownerSelect.value);
    seasonSelect.innerHTML = selectHtml(seasons, seasonSelect.value || seasons[0] || null);
    if (!seasons.includes(Number(seasonSelect.value))) {
      seasonSelect.value = `${seasons[0] ?? ''}`;
    }
  };

  if (side === 'A') applySide(ownerA, seasonA);
  if (side === 'B') applySide(ownerB, seasonB);
  if (side === null) {
    applySide(ownerA, seasonA);
    applySide(ownerB, seasonB);
  }

  if (typeof onChange === 'function') onChange(readGauntletControls({ doc }));
}

function randomSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `reroll-${Math.random().toString(36).slice(2, 10)}`;
}

function buildGauntletControls({ doc, teamSeasons, selectedState, onChange }) {
  const root = docOrDefault(doc);
  if (!root) {
    return selectedState;
  }

  const state = selectedState || defaultState(teamSeasons);
  applyStateToControls({ doc: root, teamSeasons, selectedState: state });

  const ownerA = root.getElementById('gauntletOwnerA');
  const seasonA = root.getElementById('gauntletSeasonA');
  const ownerB = root.getElementById('gauntletOwnerB');
  const seasonB = root.getElementById('gauntletSeasonB');
  const eraAdjusted = root.getElementById('gauntletEraAdjusted');
  const includePostseason = root.getElementById('gauntletIncludePostseason');
  const sims = root.getElementById('gauntletSimulations');
  const reroll = root.getElementById('gauntletRerollBtn');

  const notify = () => {
    if (typeof onChange === 'function') onChange(readGauntletControls({ doc: root }));
  };

  if (ownerA && !ownerA.dataset.bound) {
    ownerA.addEventListener('change', () => updateStateFromControls({ doc: root, teamSeasons, onChange, side: 'A' }));
    ownerA.dataset.bound = '1';
  }
  if (seasonA && !seasonA.dataset.bound) {
    seasonA.addEventListener('change', notify);
    seasonA.dataset.bound = '1';
  }
  if (ownerB && !ownerB.dataset.bound) {
    ownerB.addEventListener('change', () => updateStateFromControls({ doc: root, teamSeasons, onChange, side: 'B' }));
    ownerB.dataset.bound = '1';
  }
  if (seasonB && !seasonB.dataset.bound) {
    seasonB.addEventListener('change', notify);
    seasonB.dataset.bound = '1';
  }
  if (eraAdjusted && !eraAdjusted.dataset.bound) {
    eraAdjusted.addEventListener('change', notify);
    eraAdjusted.dataset.bound = '1';
  }
  if (includePostseason && !includePostseason.dataset.bound) {
    includePostseason.addEventListener('change', notify);
    includePostseason.dataset.bound = '1';
  }
  if (sims && !sims.dataset.bound) {
    sims.addEventListener('change', notify);
    sims.dataset.bound = '1';
  }
  if (reroll && !reroll.dataset.bound) {
    reroll.addEventListener('click', () => {
      const container = root.getElementById('gauntletControls');
      if (!container) return;
      container.dataset.seed = randomSeed();
      container.dataset.seedSource = 'explicit';
      const seedValue = root.getElementById('gauntletSeedValue');
      if (seedValue) seedValue.textContent = `Seed: ${container.dataset.seed}`;
      notify();
    });
    reroll.dataset.bound = '1';
  }

  return readGauntletControls({ doc: root });
}

function readGauntletControls({ doc }) {
  const root = docOrDefault(doc);
  if (!root) return {
    selectedOwnerA: null,
    selectedSeasonA: null,
    selectedOwnerB: null,
    selectedSeasonB: null,
    selectedModel: 'hybrid',
    selectedIncludePostseason: false,
    selectedSimulations: 10000,
    seed: null,
    seedSource: 'derived',
  };

  const ownerA = root.getElementById('gauntletOwnerA');
  const seasonA = root.getElementById('gauntletSeasonA');
  const ownerB = root.getElementById('gauntletOwnerB');
  const seasonB = root.getElementById('gauntletSeasonB');
  const eraAdjusted = root.getElementById('gauntletEraAdjusted');
  const includePostseason = root.getElementById('gauntletIncludePostseason');
  const sims = root.getElementById('gauntletSimulations');
  const container = root.getElementById('gauntletControls');

  return {
    selectedOwnerA: ownerA?.value || null,
    selectedSeasonA: seasonA?.value ? Number(seasonA.value) : null,
    selectedOwnerB: ownerB?.value || null,
    selectedSeasonB: seasonB?.value ? Number(seasonB.value) : null,
    selectedModel: eraAdjusted?.checked ? 'hybrid' : 'historical',
    selectedIncludePostseason: includePostseason?.checked || false,
    selectedSimulations: clampSimulations(sims?.value ?? 10000),
    seed: container?.dataset.seed || null,
    seedSource: container?.dataset.seedSource || 'derived',
  };
}

function syncGauntletControls({ doc, teamSeasons, selectedState }) {
  return applyStateToControls({ doc, teamSeasons, selectedState });
}

export {
  resolveGauntletInitialState,
  buildGauntletControls,
  readGauntletControls,
  syncGauntletControls,
};
