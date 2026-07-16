import { buildFacetControl, escapeHtml } from './render-helpers.js';
import {
  opponentOptions,
  roundOptionsOrdered,
  seasonOptions,
  teamOptions,
  typeOptions,
  weekOptions,
} from './facet-helpers.js';
import { setFacetSelections } from './state-helpers.js';

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function setDropdownOpen(dropdown, isOpen, doc) {
  const root = docOrDefault(doc);
  if (!root || !dropdown) return;
  dropdown.classList.toggle('open', isOpen);
  const btn = dropdown.querySelector('.dropdown-toggle');
  if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  const menu = dropdown.querySelector('.dropdown-menu');
  if (menu) {
    menu.hidden = !isOpen;
    menu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }
}

function closeDropdowns(except = null, doc) {
  const root = docOrDefault(doc);
  if (!root) return;
  root.querySelectorAll('.dropdown').forEach((dropdown) => {
    if (dropdown !== except) setDropdownOpen(dropdown, false, root);
  });
}

function buildFacet(containerId, values, prefix, onChange, doc) {
  const labels = {
    seasonFilters: 'Filter by season',
    weekFilters: 'Filter by week',
    oppFilters: 'Filter by opponent',
    typeFilters: 'Filter by game type',
    roundFilters: 'Filter by postseason round',
  };
  buildFacetControl(containerId, values, {
    doc,
    prefix,
    label: labels[containerId] || 'Filter options',
    onChange,
  });
}

function buildOpponentFacet(doc, leagueGames, selectedTeam, allTeams, onChange) {
  buildFacet('oppFilters', opponentOptions(leagueGames, selectedTeam, allTeams), 'opp', onChange, doc);
}

function buildHistoryControls({
  doc,
  leagueGames,
  seasonSummaries,
  derivedWeeksSet,
  allTeams,
  selectedTeam,
  onFacetChange,
}) {
  const root = docOrDefault(doc);
  if (!root) {
    return { selectedTeam, teamSelect: null };
  }

  const teamSelect = root.getElementById('teamSelect');
  const teams = teamOptions(seasonSummaries, leagueGames, allTeams);
  const resolvedTeam = teams.some(t => t.value === selectedTeam)
    ? selectedTeam
    : (teams[0]?.value || selectedTeam);

  if (teamSelect) {
    teamSelect.innerHTML = teams.map(t => `<option value="${escapeHtml(t.value)}">${escapeHtml(t.label)}</option>`).join('');
    teamSelect.value = resolvedTeam;
  }

  buildFacet('seasonFilters', seasonOptions(leagueGames), 'season', onFacetChange, root);
  buildFacet('weekFilters', weekOptions(derivedWeeksSet), 'week', onFacetChange, root);
  buildOpponentFacet(root, leagueGames, resolvedTeam, allTeams, onFacetChange);
  buildFacet('typeFilters', typeOptions(leagueGames), 'type', onFacetChange, root);
  buildFacet('roundFilters', roundOptionsOrdered(leagueGames), 'round', onFacetChange, root);

  return { selectedTeam: resolvedTeam, teamSelect };
}

function rebuildOpponentFacet({
  doc,
  leagueGames,
  selectedTeam,
  allTeams,
  onFacetChange,
}) {
  const root = docOrDefault(doc);
  if (!root) return;
  buildOpponentFacet(root, leagueGames, selectedTeam, allTeams, onFacetChange);
}

function resetFacetControls({ doc }) {
  const root = docOrDefault(doc);
  if (!root) return;
  ['seasonFilters', 'weekFilters', 'oppFilters', 'typeFilters', 'roundFilters'].forEach((id) => {
    const pref = id.startsWith('season') ? 'season'
      : id.startsWith('week') ? 'week'
      : id.startsWith('opp') ? 'opp'
      : id.startsWith('type') ? 'type'
      : 'round';
    const container = root.getElementById(id);
    if (!container) return;
    const all = container.querySelector(`.${pref}-all`);
    const cbs = container.querySelectorAll(`.${pref}-cb`);
    if (all) all.checked = true;
    cbs.forEach(cb => { cb.checked = false; });
  });
}

function readFacetSelections({
  doc,
  leagueGames,
  derivedWeeksSet,
  selectedTeam,
  allTeams,
}) {
  const root = docOrDefault(doc);
  if (!root) {
    return {
      selectedSeasons: new Set(),
      selectedWeeks: new Set(),
      selectedOpponents: new Set(),
      selectedTypes: new Set(),
      selectedRounds: new Set(),
      universe: { seasons: [], weeks: [], opponents: [], types: [], rounds: [] },
    };
  }

  const selectedSeasons = (root.querySelector('#seasonFilters .season-all')?.checked)
    ? new Set()
    : new Set([...root.querySelectorAll('#seasonFilters .season-cb')]
      .filter(cb => cb.checked)
      .map(cb => +decodeURIComponent(cb.dataset.value)));

  const selectedWeeks = (root.querySelector('#weekFilters .week-all')?.checked)
    ? new Set()
    : new Set([...root.querySelectorAll('#weekFilters .week-cb')]
      .filter(cb => cb.checked)
      .map(cb => +decodeURIComponent(cb.dataset.value)));

  const selectedOpponents = (root.querySelector('#oppFilters .opp-all')?.checked)
    ? new Set()
    : new Set([...root.querySelectorAll('#oppFilters .opp-cb')]
      .filter(cb => cb.checked)
      .map(cb => decodeURIComponent(cb.dataset.value)));

  const selectedTypes = (root.querySelector('#typeFilters .type-all')?.checked)
    ? new Set()
    : new Set([...root.querySelectorAll('#typeFilters .type-cb')]
      .filter(cb => cb.checked)
      .map(cb => decodeURIComponent(cb.dataset.value)));

  const selectedRounds = (root.querySelector('#roundFilters .round-all')?.checked)
    ? new Set()
    : new Set([...root.querySelectorAll('#roundFilters .round-cb')]
      .filter(cb => cb.checked)
      .map(cb => decodeURIComponent(cb.dataset.value)));

  const universe = {
    seasons: seasonOptions(leagueGames),
    weeks: weekOptions(derivedWeeksSet),
    opponents: opponentOptions(leagueGames, selectedTeam, allTeams),
    types: typeOptions(leagueGames),
    rounds: roundOptionsOrdered(leagueGames),
  };

  return {
    selectedSeasons,
    selectedWeeks,
    selectedOpponents,
    selectedTypes,
    selectedRounds,
    universe,
  };
}

function updateFacetCountTexts({
  doc,
  selectedSeasons,
  selectedWeeks,
  selectedOpponents,
  selectedTypes,
  selectedRounds,
  universe,
}) {
  const root = docOrDefault(doc);
  if (!root) return;
  const setText = (id, selSet, uniArr) => {
    const el = root.getElementById(id);
    if (!el) return;
    if (selSet.size === 0 || selSet.size === uniArr.length) el.textContent = 'All';
    else el.textContent = `${selSet.size} selected`;
  };
  setText('seasonCountText', selectedSeasons, universe.seasons);
  setText('weekCountText', selectedWeeks, universe.weeks);
  setText('oppCountText', selectedOpponents, universe.opponents);
  setText('typeCountText', selectedTypes, universe.types);
  setText('roundCountText', selectedRounds, universe.rounds);
}

export {
  buildHistoryControls,
  closeDropdowns,
  readFacetSelections,
  rebuildOpponentFacet,
  resetFacetControls,
  setDropdownOpen,
  updateFacetCountTexts,
  setFacetSelections,
};
