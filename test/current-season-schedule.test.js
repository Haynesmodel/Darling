import test from 'node:test';
import assert from 'node:assert/strict';
import currentSeason from '../assets/CurrentSeason.json' with { type: 'json' };
import { buildScheduleComparison } from '../js/current-season-schedule.js';

const fixture = [
  ['A', 'B', 10, 8, 1], ['C', 'D', 7, 7, 1],
  ['A', 'C', 5, 9, 2], ['B', 'D', 11, 5, 2],
].map(([teamA, teamB, scoreA, scoreB, week]) => ({ season: 2025, week, teamA, teamB, scoreA, scoreB, type: 'Regular' }));

test('schedule matrix, all-play and collision detail reconcile over complete weeks', () => {
  const model = buildScheduleComparison({ leagueGames: fixture, season: 2025, week: 2, owner: 'A', donor: 'B' });
  assert.deepEqual(model.weeks, [1, 2]);
  assert.deepEqual(model.matrix.A.A, { W: 1, L: 1, T: 0 });
  assert.deepEqual(model.allPlay.A.weeks[1], { W: 3, L: 0, T: 0 });
  assert.deepEqual(model.allPlay.A.total, { W: 3, L: 2, T: 1 });
  assert.equal(model.details[0].collision, true);
  assert.equal(model.details[0].alternativeOpponent, 'B');
  const tiedWeek = buildScheduleComparison({ leagueGames: fixture, season: 2025, week: 1, owner: 'C', donor: 'C' });
  assert.deepEqual(tiedWeek.details[0].tied, [{ owner: 'D', score: 7 }]);
  for (const team of model.teams) for (const w of model.weeks) {
    const row = model.allPlay[team].weeks[w];
    assert.equal(row.W + row.L + row.T, model.teams.length - 1);
  }
});

test('a duplicate team game excludes that entire week', () => {
  const model = buildScheduleComparison({ leagueGames: [...fixture, fixture[2]], season: 2025, week: 2 });
  assert.deepEqual(model.weeks, [1]);
  assert.deepEqual(model.excluded, [{ week: 2, reason: 'has duplicate or unknown teams' }]);
});

test('incomplete, live, scoreless and invalid-week slates do not enter totals', () => {
  const model = buildScheduleComparison({ leagueGames: [
    ...fixture,
    { season: 2025, week: 3, teamA: 'A', teamB: 'B', scoreA: 1, scoreB: 2, type: 'Regular', status: 'live' },
    { season: 2025, week: 4, teamA: 'A', teamB: 'B', scoreA: null, scoreB: 2, type: 'Regular' },
    { season: 2025, teamA: 'A', teamB: 'B', scoreA: 1, scoreB: 2, type: 'Regular' },
  ], season: 2025, week: 4 });
  assert.deepEqual(model.weeks, [1, 2]);
  assert.deepEqual(model.excluded.map(row => row.week), ['?', 3, 4]);
  assert.equal(model.allPlay.A.total.W + model.allPlay.A.total.L + model.allPlay.A.total.T, 6);
});

test('committed 2026 snapshot reconciles its final Week 3 slate', () => {
  const model = buildScheduleComparison({ currentSeason, season: 2026, week: 3, owner: 'Joe', donor: 'Plot' });
  assert.deepEqual(model.weeks, [1, 2, 3]);
  assert.deepEqual(model.excluded, []);
  assert.equal(model.teams.length, 12);
  assert.equal(model.allPlay.Joe.total.W + model.allPlay.Joe.total.L + model.allPlay.Joe.total.T, 33);
  assert.equal(model.matrix.Joe.Joe.W + model.matrix.Joe.Joe.L + model.matrix.Joe.Joe.T, 3);
});
