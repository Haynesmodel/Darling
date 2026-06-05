import { escapeHtml } from './render-helpers.js';
import { teamOptions } from './facet-helpers.js';

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function isPairRivalry(rivalry) {
  return String(rivalry?.type || '').toLowerCase() === 'pair' && Array.isArray(rivalry.members) && rivalry.members.length === 2;
}

function rivalryKey(teamA, teamB) {
  return [teamA, teamB].map(v => String(v || '').trim()).sort((a, b) => a.localeCompare(b)).join('|');
}

function buildPairRivalryIndex(rivalries = []) {
  return rivalries
    .filter(isPairRivalry)
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.slug || '').localeCompare(String(b.slug || '')))
    .reduce((map, rivalry) => {
      const value = rivalry.slug || rivalry.members.join('|');
      const key = rivalryKey(rivalry.members[0], rivalry.members[1]);
      if (!map.has(key)) {
        map.set(key, { ...rivalry, value });
      }
      return map;
    }, new Map());
}

function buildPairOptions(rivalries = []) {
  return rivalries
    .filter(isPairRivalry)
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.slug || '').localeCompare(String(b.slug || '')))
    .map(rivalry => {
      const value = rivalry.slug || rivalry.members.join('|');
      const label = rivalry.note ? `${rivalry.name} - ${rivalry.note}` : rivalry.name;
      return {
        value,
        label,
        members: rivalry.members.slice(),
      };
    });
}

function firstDifferentTeam(team, teams) {
  return teams.find(t => t !== team) || teams[0] || team;
}

function choosePreferredOpponent(teamA, pairOptions) {
  const match = pairOptions.find(opt => opt.members.includes(teamA));
  if (!match) return null;
  return match.members.find(member => member !== teamA) || null;
}

function resolveInitialTeams(teams, pairOptions, selectedTeamA, selectedTeamB) {
  const teamA = teams.includes(selectedTeamA) ? selectedTeamA : (teams[0] || selectedTeamA);
  const preferredB = choosePreferredOpponent(teamA, pairOptions) || firstDifferentTeam(teamA, teams);
  let teamB = teams.includes(selectedTeamB) && selectedTeamB !== teamA ? selectedTeamB : preferredB;
  if (!teamB || teamB === teamA) teamB = firstDifferentTeam(teamA, teams);
  return { teamA, teamB };
}

function optionsForSide(teams, blockedTeam) {
  return teams.filter(team => team !== blockedTeam);
}

function renderTeamOptions(teams, blockedTeam) {
  return optionsForSide(teams, blockedTeam)
    .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join('');
}

function buildRivalryControls({
  doc,
  leagueGames,
  seasonSummaries,
  rivalries,
  selectedTeamA,
  selectedTeamB,
  onChange,
  allTeams = '__ALL__',
}) {
  const root = docOrDefault(doc);
  if (!root) {
    return { selectedTeamA, selectedTeamB };
  }

  const teamASelect = root.getElementById('rivalryTeamA');
  const teamBSelect = root.getElementById('rivalryTeamB');
  if (!teamASelect || !teamBSelect) {
    return { selectedTeamA, selectedTeamB };
  }

  const teams = teamOptions(seasonSummaries, leagueGames, allTeams)
    .filter(team => team.value !== allTeams)
    .map(team => team.value);
  const pairOptions = buildPairOptions(rivalries);

  const resolved = resolveInitialTeams(teams, pairOptions, selectedTeamA, selectedTeamB);

  const setControls = (teamA, teamB) => {
    teamASelect.innerHTML = renderTeamOptions(teams, teamB);
    teamBSelect.innerHTML = renderTeamOptions(teams, teamA);
    teamASelect.value = teamA;
    teamBSelect.value = teamB;
  };

  const emitChange = () => {
    const teamA = teamASelect.value;
    let teamB = teamBSelect.value;
    if (teamA === teamB) {
      teamB = firstDifferentTeam(teamA, teams);
    }
    setControls(teamA, teamB);
    if (typeof onChange === 'function') {
      onChange({
        selectedTeamA: teamA,
        selectedTeamB: teamB,
      });
    }
  };

  if (!teamASelect.dataset.bound) {
    teamASelect.addEventListener('change', emitChange);
    teamASelect.dataset.bound = '1';
  }
  if (!teamBSelect.dataset.bound) {
    teamBSelect.addEventListener('change', emitChange);
    teamBSelect.dataset.bound = '1';
  }

  setControls(resolved.teamA, resolved.teamB);
  emitChange();

  return {
    selectedTeamA: teamASelect.value,
    selectedTeamB: teamBSelect.value,
  };
}

export {
  buildPairOptions,
  buildPairRivalryIndex,
  buildRivalryControls,
  choosePreferredOpponent,
  firstDifferentTeam,
  isPairRivalry,
  resolveInitialTeams,
  rivalryKey,
};
