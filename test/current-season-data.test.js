import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveWeeksInPlace } from '../js/core-helpers.js';
import {
  buildCurrentMatchupRows,
  buildCurrentSeasonStandings,
  buildTeamCurrentSeasonSnapshot,
  currentSeasonGames,
  currentSeasonWeeks,
  gamesForSeasonWeek,
  latestCompletedWeek,
  latestLeagueSeason,
} from '../js/current-season-data.js';

const games = [
  { season: 2024, date: '2024-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 91, scoreB: 99, week: 1, type: 'Regular', round: '' },
  { season: 2024, date: '2024-12-14', teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 100, week: 15, type: 'Playoff', round: 'Semi Final' },
  { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 110, scoreB: 100, week: 1, type: 'Regular', round: '' },
  { season: 2025, date: '2025-09-07', teamA: 'Nuss', teamB: 'Joel', scoreA: 90, scoreB: 95, week: 1, type: 'Regular', round: '' },
  { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Nuss', scoreA: 80, scoreB: 85, week: 2, type: 'Regular', round: '' },
  { season: 2025, date: '2025-09-14', teamA: 'Shap', teamB: 'Joel', scoreA: 105, scoreB: 97, week: 2, type: 'Regular', round: '' },
];

deriveWeeksInPlace(games);

test('current-season helpers derive latest season and weeks', () => {
  assert.equal(latestLeagueSeason(games), 2025);
  assert.equal(latestLeagueSeason([], [{ season: 2030, owner: 'Joe' }]), 2030);
  assert.equal(currentSeasonGames(games, 2025).length, 4);
  assert.deepEqual(currentSeasonWeeks(games, 2025), [1, 2]);
  assert.equal(latestCompletedWeek(games, 2025), 2);
  assert.deepEqual(gamesForSeasonWeek(games, 2025, 1).map(game => game.teamA), ['Joe', 'Nuss']);
});

test('current-season standings are calculated from regular current games', () => {
  const standings = buildCurrentSeasonStandings({ leagueGames: games, season: 2025 });
  const shap = standings.find(row => row.owner === 'Shap');
  const joe = standings.find(row => row.owner === 'Joe');

  assert.equal(shap.record, '1-1');
  assert.equal(shap.pointsFor, 205);
  assert.equal(shap.pointsAgainst, 207);
  assert.equal(shap.streak, 'W1');
  assert.equal(joe.record, '1-1');
  assert.equal(joe.pointsFor, 190);
  assert.equal(joe.pointsAgainst, 185);
  assert.ok(standings.every(row => Number.isFinite(row.rank)));
});

test('current matchup rows include historical head-to-head context', () => {
  const rows = buildCurrentMatchupRows({ leagueGames: games, season: 2025, week: 1 });
  const joeShap = rows.find(row => row.teamA === 'Joe' && row.teamB === 'Shap');

  assert.equal(joeShap.allTimeContext.allTime.recordA, '2-1');
  assert.equal(joeShap.historicContext.allTime.recordA, '1-1');
  assert.equal(joeShap.currentSeasonContext.selected.recordA, '1-0');
  assert.equal(joeShap.lastMeeting.date, '2024-12-14');
  assert.equal(joeShap.playoffMeetings, 1);
  assert.equal(joeShap.currentFormA, 'W');
  assert.equal(joeShap.rivalryUrl, '?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Shap');
});

test('current-season helpers prefer Sleeper current-season asset when present', () => {
  const sleeperAsset = {
    season: 2026,
    current_week: 1,
    games: [
      { season: 2026, date: '2026-09-06', teamA: 'Joe', teamB: 'Shap', scoreA: null, scoreB: null, week: 1, type: 'Regular', round: '', status: 'scheduled' },
      { season: 2026, date: '2026-09-06', teamA: 'Nuss', teamB: 'Joel', scoreA: 100, scoreB: 90, week: 1, type: 'Regular', round: '', status: 'final' },
    ],
  };

  const standings = buildCurrentSeasonStandings({ leagueGames: games, currentSeason: sleeperAsset });
  assert.equal(standings.find(row => row.owner === 'Joe').games, 0);
  assert.equal(standings.find(row => row.owner === 'Nuss').record, '1-0');

  const rows = buildCurrentMatchupRows({ leagueGames: games, currentSeason: sleeperAsset });
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.teamA === 'Joe').scoreA, null);
  assert.equal(rows.find(row => row.teamA === 'Joe').resultA, 'T');
});

test('team current-season snapshot includes ranks and extremes', () => {
  const snapshot = buildTeamCurrentSeasonSnapshot({ owner: 'Joe', leagueGames: games, season: 2025 });
  assert.equal(snapshot.standing.record, '1-1');
  assert.equal(snapshot.bestWin.opp, 'Shap');
  assert.equal(snapshot.worstLoss.opp, 'Nuss');
  assert.ok(snapshot.scoringRank >= 1);
  assert.ok(snapshot.opponentScoringRank >= 1);
});
