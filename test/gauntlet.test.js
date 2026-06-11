import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTeamSeasons,
  teamSeasonId,
  parseTeamSeasonId,
  bestTeamSeason,
  headToHeadContext,
} from '../js/gauntlet-data.js';
import {
  hashSeed,
  seededRng,
  drawScore,
  simulateMatchup,
  histogramBins,
} from '../js/gauntlet-simulator.js';

test('gauntlet data helpers build team seasons from regular games only', () => {
  const leagueGames = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Zook', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Zook', scoreA: 110, scoreB: 120, type: 'Playoff', round: 'Final' },
    { season: 2025, date: '2025-09-21', teamA: 'Joe', teamB: 'Zook', scoreA: 120, scoreB: 130, type: 'Saunders', round: 'Saunders Final' },
    { season: 2025, date: '2025-09-28', teamA: 'A&B', teamB: 'Joe', scoreA: 80, scoreB: 70, type: 'Regular', round: '' },
  ];
  const seasonSummaries = [
    { owner: 'Joe', season: 2025, wins: 2, losses: 0, ties: 0, finish: 1, points_for: 170, points_against: 150, champion: true, saunders: false, bye: true },
    { owner: 'A&B', season: 2025, wins: 0, losses: 1, ties: 0, finish: 4, points_for: 80, points_against: 70, champion: false, saunders: false, bye: false },
  ];

  const teamSeasons = buildTeamSeasons(leagueGames, seasonSummaries);
  const joe = teamSeasons.find(teamSeason => teamSeason.id === 'Joe:2025');
  const ab = teamSeasons.find(teamSeason => teamSeason.id === 'A&B:2025');
  const zook = teamSeasons.find(teamSeason => teamSeason.id === 'Zook:2025');

  assert.equal(teamSeasons.length, 3);
  assert.deepEqual(joe.scores, [100, 70]);
  assert.equal(joe.games, 2);
  assert.equal(joe.mean, 85);
  assert.equal(joe.stdev, 15);
  assert.equal(joe.min, 70);
  assert.equal(joe.max, 100);
  assert.equal(joe.record, '2-0');
  assert.equal(joe.finish, 1);
  assert.equal(joe.champion, true);
  assert.equal(joe.bye, true);
  assert.equal(joe.pointsFor, 170);
  assert.equal(joe.pointsAgainst, 150);
  assert.deepEqual(zook.scores, [90]);
  assert.deepEqual(ab.scores, [80]);
});

test('gauntlet data helpers can include weighted postseason games', () => {
  const leagueGames = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Zook', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Zook', scoreA: 200, scoreB: 150, type: 'Playoff', round: 'Final' },
  ];
  const teamSeasons = buildTeamSeasons(leagueGames, [], { includePostseason: true });
  const joe = teamSeasons.find(teamSeason => teamSeason.id === 'Joe:2025');

  assert.equal(joe.games, 2);
  assert.deepEqual(joe.scores, [100, 200]);
  assert.deepEqual(joe.scoreEvents.map(event => event.weight), [1, 2]);
  assert.ok(Math.abs(joe.mean - 166.6666667) < 0.001);
  assert.ok(joe.stdev > 0);
});

test('gauntlet ids and ranking helpers round-trip and rank correctly', () => {
  const id = teamSeasonId('A&B', 2024);
  assert.equal(id, 'A&B:2024');
  assert.deepEqual(parseTeamSeasonId(id), { owner: 'A&B', season: 2024 });
  assert.equal(parseTeamSeasonId('bad-id'), null);

  const rows = [
    { owner: 'Joe', season: 2024, id: 'Joe:2024', finish: 2, wins: 9, pointsFor: 100 },
    { owner: 'Joe', season: 2025, id: 'Joe:2025', finish: 2, wins: 10, pointsFor: 90 },
    { owner: 'Joe', season: 2023, id: 'Joe:2023', finish: 2, wins: 10, pointsFor: 110 },
  ];
  assert.equal(bestTeamSeason(rows, 'Joe').season, 2023);
});

test('gauntlet head-to-head context summarizes all-time and selected-season meetings', () => {
  const games = [
    { season: 2024, date: '2024-09-07', teamA: 'Joe', teamB: 'Zook', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2024, date: '2024-12-07', teamA: 'Zook', teamB: 'Joe', scoreA: 130, scoreB: 120, type: 'Playoff', round: 'Final' },
    { season: 2025, date: '2025-09-07', teamA: 'Zook', teamB: 'Joe', scoreA: 80, scoreB: 80, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Zook', scoreA: 90, scoreB: 100, type: 'Regular', round: '' },
  ];

  const context = headToHeadContext('Joe', 'Zook', games, [2025]);
  assert.equal(context.allTime.games, 4);
  assert.equal(context.allTime.winsA, 1);
  assert.equal(context.allTime.winsB, 2);
  assert.equal(context.allTime.ties, 1);
  assert.equal(context.allTime.recordA, '1-2-1');
  assert.equal(context.allTime.highestCombined.date, '2024-12-07');
  assert.equal(context.allTime.mostRecent.date, '2025-09-14');
  assert.equal(context.selected.games, 2);
  assert.equal(context.selected.recordA, '0-1-1');
});

test('gauntlet simulator helpers are deterministic and bounded', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));

  const rngA = seededRng('repeatable');
  const rngB = seededRng('repeatable');
  assert.equal(rngA(), rngB());
  assert.equal(rngA(), rngB());

  const historicalSeason = { scores: [10, 20, 30], mean: 20, stdev: 0, min: 10, max: 30 };
  const drawnHistorical = Array.from({ length: 20 }, () => drawScore(historicalSeason, 'historical', seededRng('hist')));
  assert.ok(drawnHistorical.every(score => historicalSeason.scores.includes(score)));

  const weightedSeason = {
    scores: [10, 20],
    scoreEvents: [
      { score: 10, weight: 1 },
      { score: 20, weight: 3 },
    ],
    mean: 17.5,
    stdev: 0,
    min: 10,
    max: 20,
  };
  assert.equal(drawScore(weightedSeason, 'historical', () => 0.1), 10);
  assert.equal(drawScore(weightedSeason, 'historical', () => 0.5), 20);

  const hybridSeason = { scores: [10, 20, 30], mean: 20, stdev: 12, min: 10, max: 30 };
  const drawnHybrid = Array.from({ length: 50 }, () => drawScore(hybridSeason, 'hybrid', seededRng('hyb')));
  assert.ok(drawnHybrid.every(score => score >= 10 && score <= 30));

  const strongA = { id: 'A:1', scores: [140, 145, 150], mean: 145, stdev: 4, min: 140, max: 150 };
  const weakB = { id: 'B:1', scores: [90, 95, 100], mean: 95, stdev: 4, min: 90, max: 100 };
  const result1 = simulateMatchup(strongA, weakB, { model: 'historical', simulations: 2000, seed: 'match' });
  const result2 = simulateMatchup(strongA, weakB, { model: 'historical', simulations: 2000, seed: 'match' });
  assert.equal(result1.pctA, result2.pctA);
  assert.ok(result1.pctA > 0.95);

  const mirror = simulateMatchup(strongA, strongA, { model: 'historical', simulations: 5000, seed: 'mirror' });
  assert.ok(mirror.pctA > 0.45 && mirror.pctA < 0.55);

  const bins = histogramBins([1, 1.5, 2, 3, 4], { bins: 4, min: 1, max: 5 });
  assert.equal(bins.length, 4);
  assert.deepEqual(bins.map(bin => bin.count), [2, 1, 1, 1]);
});
