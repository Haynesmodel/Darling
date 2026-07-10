import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyHistoryGameQuery,
  buildHistoryGameRows,
  queryHistoryGames,
} from '../js/history-game-query.js';

const games = [
  { season: 2024, date: '2024-09-01', teamA: 'Joe', teamB: 'Joel', scoreA: 160, scoreB: 90, type: 'Regular', round: '' },
  { season: 2024, date: '2024-09-08', teamA: 'Shap', teamB: 'Joe', scoreA: 120, scoreB: 80, type: 'Playoff', round: 'Semi Final' },
  { season: 2024, date: '2024-09-15', teamA: 'Joel', teamB: 'Shap', scoreA: 100, scoreB: 100, type: 'Regular', round: '' },
];

test('perspective rows represent both sides in league mode and one side in owner mode', () => {
  const leagueRows = buildHistoryGameRows(games, { selectedTeam: '__ALL__', allTeams: '__ALL__' });
  const joeRows = buildHistoryGameRows(games, { selectedTeam: 'Joe', allTeams: '__ALL__' });
  assert.equal(leagueRows.length, 6);
  assert.equal(joeRows.length, 2);
  assert.deepEqual(joeRows.map(row => row.result), ['W', 'L']);
  assert.deepEqual(joeRows.map(row => row.margin), [70, -40]);
});

test('history game queries compose result, threshold, sort, and limit state', () => {
  const rows = buildHistoryGameRows(games, { selectedTeam: '__ALL__', allTeams: '__ALL__' });
  const biggestLoss = applyHistoryGameQuery(rows, { gameResult: 'L', gameSort: 'marginAsc', gameLimit: 1 });
  assert.equal(biggestLoss.length, 1);
  assert.equal(biggestLoss[0].team, 'Joel');
  assert.equal(biggestLoss[0].margin, -70);

  const highScores = applyHistoryGameQuery(rows, { gameMinScore: 120, gameSort: 'scoreDesc' });
  assert.deepEqual(highScores.map(row => row.score), [160, 120]);

  const view = queryHistoryGames(games, {
    selectedTeam: 'Joe',
    allTeams: '__ALL__',
    query: { gameMaxScore: 100 },
  });
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0].score, 80);
  assert.match(view.summary, /scores of at most 100/);
});
