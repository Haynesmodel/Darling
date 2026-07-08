import { escapeHtml } from './render-helpers.js';
import {
  currentSeasonWeeks,
  latestCompletedWeek,
  latestLeagueSeason,
} from './current-season-data.js';
import {
  CURRENT_VIEW_MODES,
  normalizeCurrentView,
} from './current-season-command-data.js';

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function availableSeasons(leagueGames = [], seasonSummaries = [], currentSeason = null) {
  return [...new Set([
    Number(currentSeason?.season),
    ...leagueGames.map(game => Number(game.season)),
    ...seasonSummaries.map(row => Number(row.season)),
  ].filter(Number.isFinite))].sort((a, b) => b - a);
}

function availableOwners(leagueGames = [], seasonSummaries = [], currentSeason = null, season = null) {
  const target = Number(season);
  const owners = new Set();
  for (const row of seasonSummaries) {
    if ((!Number.isFinite(target) || Number(row.season) === target) && row.owner) owners.add(row.owner);
  }
  const games = currentSeason && Number(currentSeason.season) === target && Array.isArray(currentSeason.games)
    ? currentSeason.games
    : leagueGames.filter(game => !Number.isFinite(target) || Number(game.season) === target);
  for (const game of games) {
    if (game.teamA) owners.add(game.teamA);
    if (game.teamB) owners.add(game.teamB);
  }
  return [...owners].sort((a, b) => a.localeCompare(b));
}

function renderOptions(values, selectedValue) {
  return values.map(value => {
    const selected = Number(value) === Number(selectedValue) ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
  }).join('');
}

function renderOwnerOptions(values, selectedValue) {
  return [
    `<option value=""${selectedValue ? '' : ' selected'}>All Owners</option>`,
    ...values.map(value => {
      const selected = value === selectedValue ? ' selected' : '';
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
    }),
  ].join('');
}

function renderViewOptions(selectedValue) {
  const labels = {
    command: 'Command Center',
    matchups: 'Matchups',
    standings: 'Standings',
    owners: 'Owners',
  };
  const selectedView = normalizeCurrentView(selectedValue);
  return CURRENT_VIEW_MODES.map(value => {
    const selected = value === selectedView ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(labels[value] || value)}</option>`;
  }).join('');
}

function resolveCurrentSeasonState({
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  selectedSeason = null,
  selectedWeek = null,
  selectedOwner = '',
  selectedView = 'command',
} = {}) {
  const seasons = availableSeasons(leagueGames, seasonSummaries, currentSeason);
  const fallbackSeason = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason);
  const season = seasons.includes(Number(selectedSeason)) ? Number(selectedSeason) : fallbackSeason;
  const weeks = currentSeasonWeeks(leagueGames, season, currentSeason);
  const fallbackWeek = latestCompletedWeek(leagueGames, season, currentSeason) ?? weeks[weeks.length - 1] ?? null;
  const week = weeks.includes(Number(selectedWeek)) ? Number(selectedWeek) : fallbackWeek;
  const owners = availableOwners(leagueGames, seasonSummaries, currentSeason, season);
  const owner = owners.includes(selectedOwner) ? selectedOwner : '';
  const view = normalizeCurrentView(selectedView);
  return { selectedSeason: season, selectedWeek: week, selectedOwner: owner, selectedView: view, seasons, weeks, owners };
}

function buildCurrentSeasonControls({
  doc,
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  selectedSeason = null,
  selectedWeek = null,
  selectedOwner = '',
  selectedView = 'command',
  onChange,
} = {}) {
  const root = docOrDefault(doc);
  if (!root) {
    return resolveCurrentSeasonState({ leagueGames, seasonSummaries, currentSeason, selectedSeason, selectedWeek });
  }

  const seasonSelect = root.getElementById('currentSeasonSelect');
  const weekSelect = root.getElementById('currentWeekSelect');
  const ownerSelect = root.getElementById('currentOwnerSelect');
  const viewSelect = root.getElementById('currentViewSelect');
  const state = resolveCurrentSeasonState({ leagueGames, seasonSummaries, currentSeason, selectedSeason, selectedWeek, selectedOwner, selectedView });

  const syncSecondaryOptions = (season, preferredWeek = null, preferredOwner = '') => {
    const weeks = currentSeasonWeeks(leagueGames, season, currentSeason);
    const fallbackWeek = latestCompletedWeek(leagueGames, season, currentSeason) ?? weeks[weeks.length - 1] ?? null;
    const week = weeks.includes(Number(preferredWeek)) ? Number(preferredWeek) : fallbackWeek;
    const owners = availableOwners(leagueGames, seasonSummaries, currentSeason, season);
    const owner = owners.includes(preferredOwner) ? preferredOwner : '';
    if (weekSelect) {
      weekSelect.innerHTML = renderOptions(weeks, week);
      if (Number.isFinite(week)) weekSelect.value = `${week}`;
      weekSelect.disabled = weeks.length === 0;
    }
    if (ownerSelect) {
      ownerSelect.innerHTML = renderOwnerOptions(owners, owner);
      ownerSelect.value = owner;
      ownerSelect.disabled = owners.length === 0;
    }
    return { weeks, week, owners, owner };
  };

  if (seasonSelect) {
    seasonSelect.innerHTML = renderOptions(state.seasons, state.selectedSeason);
    if (Number.isFinite(state.selectedSeason)) seasonSelect.value = `${state.selectedSeason}`;
  }
  syncSecondaryOptions(state.selectedSeason, state.selectedWeek, state.selectedOwner);
  if (viewSelect) {
    viewSelect.innerHTML = renderViewOptions(state.selectedView);
    viewSelect.value = state.selectedView;
  }

  const emitChange = () => {
    const nextSeason = Number(seasonSelect?.value || state.selectedSeason);
    const synced = syncSecondaryOptions(nextSeason, weekSelect?.value || state.selectedWeek, ownerSelect?.value || state.selectedOwner);
    const nextWeek = Number(weekSelect?.value || synced.week);
    const nextOwner = synced.owners.includes(ownerSelect?.value) ? ownerSelect.value : '';
    const nextView = normalizeCurrentView(viewSelect?.value || state.selectedView);
    if (typeof onChange === 'function') {
      onChange({
        selectedSeason: Number.isFinite(nextSeason) ? nextSeason : null,
        selectedWeek: Number.isFinite(nextWeek) ? nextWeek : null,
        selectedOwner: nextOwner,
        selectedView: nextView,
      });
    }
  };

  if (seasonSelect && !seasonSelect.dataset.bound) {
    seasonSelect.addEventListener('change', emitChange);
    seasonSelect.dataset.bound = '1';
  }
  if (weekSelect && !weekSelect.dataset.bound) {
    weekSelect.addEventListener('change', emitChange);
    weekSelect.dataset.bound = '1';
  }
  if (ownerSelect && !ownerSelect.dataset.bound) {
    ownerSelect.addEventListener('change', emitChange);
    ownerSelect.dataset.bound = '1';
  }
  if (viewSelect && !viewSelect.dataset.bound) {
    viewSelect.addEventListener('change', emitChange);
    viewSelect.dataset.bound = '1';
  }

  return {
    ...state,
    seasonSelect,
    weekSelect,
    ownerSelect,
    viewSelect,
  };
}

export {
  availableSeasons,
  availableOwners,
  buildCurrentSeasonControls,
  resolveCurrentSeasonState,
};
