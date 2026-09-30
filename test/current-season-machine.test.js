import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlayoffMachine, playoffMachineGameKey } from '../js/current-season-machine.js';
import { qualifyStandings } from '../js/current-season-command-data.js';

const teams = 'ABCDEFGH'.split('');
const game = (week, teamA, teamB, scoreA = null, scoreB = null, status = 'scheduled') => ({
  season: 2026, date: `2026-09-${week}`, teamA, teamB, scoreA, scoreB, week,
  round: '', type: 'Regular', status,
});
const season = {
  season: 2026,
  regular_season_max_week: 2,
  playoff_rules: {
    regular_season_max_week: 2, playoff_slots: 6, bye_slots: 2, saunders_slots: 2,
    sixth_spot_rule: 'points_for_outside_top_five',
    standings_tiebreakers: ['win_pct', 'points_for', 'points_differential', 'owner'],
  },
  teams: teams.map((owner, roster_id) => ({ owner, roster_id: roster_id + 1 })),
  games: [
    game(1, 'A', 'B', 110, 100, 'final'), game(1, 'C', 'D', 110, 100, 'final'),
    game(1, 'E', 'F', 110, 100, 'final'), game(1, 'G', 'H', 110, 100, 'final'),
    game(2, 'A', 'C'), game(2, 'B', 'D'), game(2, 'E', 'G'), game(2, 'F', 'H'),
  ],
};

test('points-for qualifier keeps top five and awards seed six to the highest-PF outsider', () => {
  const rows = teams.map((owner, index) => ({
    owner, wins: 12 - index, losses: index, ties: 0, games: 12,
    pct: (12 - index) / 12, pointsFor: owner === 'H' ? 900 : owner === 'G' ? 800 : 100,
    differential: 0, rank: index + 1,
  }));
  const qualified = qualifyStandings(rows, season.playoff_rules);
  assert.deepEqual(qualified.filter(row => row.playoffSeed).sort((a, b) => a.playoffSeed - b.playoffSeed).map(row => row.owner), ['A', 'B', 'C', 'D', 'E', 'H']);
  assert.equal(qualified.find(row => row.owner === 'H').qualificationReason, 'points_for');
  assert.equal(qualified.find(row => row.owner === 'H').standingsRank, 8);
  assert.deepEqual([...new Set(qualified.map(row => row.placementSeed))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('PF ties use configured tiebreakers after points for, not standings win percentage', () => {
  const rows = teams.map((owner, index) => ({
    owner, wins: 12 - index, losses: index, ties: 0, games: 12,
    pct: (12 - index) / 12, pointsFor: index < 5 ? 200 : 100,
    differential: owner === 'G' ? 10 : owner === 'F' ? -10 : 0, rank: index + 1,
  }));
  const qualified = qualifyStandings(rows, season.playoff_rules);
  assert.equal(qualified.find(row => row.owner === 'G').playoffSeed, 6);
  assert.equal(qualified.find(row => row.owner === 'F').playoffSeed, null);
});

test('machine keeps winner picks provisional and uses complete scores for exact PF seeds', () => {
  const picks = Object.fromEntries(season.games.slice(4).map(source => [playoffMachineGameKey(source), { outcome: 'a' }]));
  const provisional = buildPlayoffMachine({ currentSeason: season, season: 2026, scenario: picks });
  assert.equal(provisional.exact, false);
  assert.equal(provisional.standings.find(row => row.owner === 'A').wins, 2);
  assert.equal(provisional.standings.find(row => row.owner === 'A').pointsFor, 110);
  assert.equal(provisional.standings.every(row => row.playoffSeed === null), true);
  assert.equal(provisional.candidates.length, 3);

  const scores = [
    ['A', 'C', '0.29', '0.28'], ['B', 'D', '0', '999.99'],
    ['E', 'G', '100', '90'], ['F', 'H', '250', '251'],
  ];
  const exactPicks = Object.fromEntries(season.games.slice(4).map(source => {
    const [teamA, teamB, scoreA, scoreB] = scores.find(item => item[0] === source.teamA && item[1] === source.teamB);
    return [playoffMachineGameKey(source), { scoreA, scoreB }];
  }));
  const exact = buildPlayoffMachine({ currentSeason: season, season: 2026, scenario: exactPicks });
  assert.equal(exact.exact, true);
  assert.equal(exact.qualifier.owner, 'F');
  assert.equal(exact.qualifier.playoffSeed, 6);
  assert.equal(exact.qualifier.owner, exact.standings.find(row => row.playoffSeed === 6).owner);
  assert.deepEqual(exact.candidates.map(row => row.owner).sort(), exact.standings.filter(row => row.standingsRank > 5).map(row => row.owner).sort());
  assert.equal(exact.normalSixth.owner, 'C');
  assert.equal(exact.standings.find(row => row.owner === 'A').pointsFor, 110.29);
  assert.equal(exact.standings.find(row => row.owner === 'D').pointsFor, 1099.99);
});

test('machine retains owners that have no completed or scored games', () => {
  const noFinals = { ...season, games: season.games.map(source => ({ ...source, scoreA: null, scoreB: null, status: 'scheduled' })) };
  const picks = { [playoffMachineGameKey(noFinals.games[0])]: { outcome: 'a' } };
  const machine = buildPlayoffMachine({ currentSeason: noFinals, season: 2026, scenario: picks });
  assert.equal(machine.standings.length, teams.length);
  assert.equal(machine.actualStandings.length, teams.length);
  assert.equal(machine.actualStandings.every(row => row.wins === 0 && row.losses === 0 && row.record === '0-0'), true);
  assert.equal(machine.standings.find(row => row.owner === 'A').wins, 1);
});

test('invalid and partial score pairs cannot produce exact qualification', () => {
  const entries = season.games.slice(4).map(source => [playoffMachineGameKey(source), { scoreA: '100', scoreB: '100' }]);
  entries.at(-1)[1].scoreA = '1000';
  const machine = buildPlayoffMachine({ currentSeason: season, season: 2026, scenario: Object.fromEntries(entries) });
  assert.equal(machine.exact, false);
  assert.match(machine.games.at(-1).scoreError, /0 to 999.99/);
});
