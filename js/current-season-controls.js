import { escapeHtml } from './render-helpers.js';
import {
  currentSeasonWeeks,
  latestCompletedWeek,
  latestLeagueSeason,
} from './current-season-data.js';

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

function renderOptions(values, selectedValue) {
  return values.map(value => {
    const selected = Number(value) === Number(selectedValue) ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
  }).join('');
}

function resolveCurrentSeasonState({
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  selectedSeason = null,
  selectedWeek = null,
} = {}) {
  const seasons = availableSeasons(leagueGames, seasonSummaries, currentSeason);
  const fallbackSeason = latestLeagueSeason(leagueGames, seasonSummaries, currentSeason);
  const season = seasons.includes(Number(selectedSeason)) ? Number(selectedSeason) : fallbackSeason;
  const weeks = currentSeasonWeeks(leagueGames, season, currentSeason);
  const fallbackWeek = latestCompletedWeek(leagueGames, season, currentSeason) ?? weeks[weeks.length - 1] ?? null;
  const week = weeks.includes(Number(selectedWeek)) ? Number(selectedWeek) : fallbackWeek;
  return { selectedSeason: season, selectedWeek: week, seasons, weeks };
}

function buildCurrentSeasonControls({
  doc,
  leagueGames = [],
  seasonSummaries = [],
  currentSeason = null,
  selectedSeason = null,
  selectedWeek = null,
  onChange,
} = {}) {
  const root = docOrDefault(doc);
  if (!root) {
    return resolveCurrentSeasonState({ leagueGames, seasonSummaries, currentSeason, selectedSeason, selectedWeek });
  }

  const seasonSelect = root.getElementById('currentSeasonSelect');
  const weekSelect = root.getElementById('currentWeekSelect');
  const state = resolveCurrentSeasonState({ leagueGames, seasonSummaries, currentSeason, selectedSeason, selectedWeek });

  const syncWeekOptions = (season, preferredWeek = null) => {
    const weeks = currentSeasonWeeks(leagueGames, season, currentSeason);
    const fallbackWeek = latestCompletedWeek(leagueGames, season, currentSeason) ?? weeks[weeks.length - 1] ?? null;
    const week = weeks.includes(Number(preferredWeek)) ? Number(preferredWeek) : fallbackWeek;
    if (weekSelect) {
      weekSelect.innerHTML = renderOptions(weeks, week);
      if (Number.isFinite(week)) weekSelect.value = `${week}`;
      weekSelect.disabled = weeks.length === 0;
    }
    return { weeks, week };
  };

  if (seasonSelect) {
    seasonSelect.innerHTML = renderOptions(state.seasons, state.selectedSeason);
    if (Number.isFinite(state.selectedSeason)) seasonSelect.value = `${state.selectedSeason}`;
  }
  syncWeekOptions(state.selectedSeason, state.selectedWeek);

  const emitChange = () => {
    const nextSeason = Number(seasonSelect?.value || state.selectedSeason);
    const synced = syncWeekOptions(nextSeason, weekSelect?.value || state.selectedWeek);
    const nextWeek = Number(weekSelect?.value || synced.week);
    if (typeof onChange === 'function') {
      onChange({
        selectedSeason: Number.isFinite(nextSeason) ? nextSeason : null,
        selectedWeek: Number.isFinite(nextWeek) ? nextWeek : null,
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

  return {
    ...state,
    seasonSelect,
    weekSelect,
  };
}

export {
  availableSeasons,
  buildCurrentSeasonControls,
  resolveCurrentSeasonState,
};
