import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlayoffMachine, currentPlayoffMachineHtml, drawPlayoffMachine, machineBracketHtml, playoffMachineGameKey } from '../js/current-season-machine.js';
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

test('equal-PF wildcard candidates remain tied without an official fallback tiebreak', () => {
  const rows = teams.map((owner, index) => ({
    owner, wins: 12 - index, losses: index, ties: 0, games: 12,
    pct: (12 - index) / 12, pointsFor: index < 5 ? 200 : 100,
    differential: owner === 'G' ? 10 : owner === 'F' ? -10 : 0, rank: index + 1,
  }));
  const qualified = qualifyStandings(rows, season.playoff_rules);
  assert.deepEqual(qualified.filter(row => row.qualificationReason === 'points_for_tie').map(row => row.owner).sort(), ['F', 'G', 'H']);
  assert.equal(qualified.filter(row => row.playoffSeed).length, 5);
  assert.equal(qualified.find(row => row.owner === 'G').playoffSeed, null);
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
  const explanationHtml = currentPlayoffMachineHtml(exact, null, { getElementById: () => ({ innerHTML: '__MACHINE_EXPLANATION__' }) });
  assert.match(explanationHtml, /All remaining games have scores; these seeds are exact for this scenario/);
  assert.equal(exact.qualifier.owner, 'F');
  assert.equal(exact.qualifier.playoffSeed, 6);
  assert.equal(exact.qualifier.owner, exact.standings.find(row => row.playoffSeed === 6).owner);
  assert.deepEqual(exact.candidates.map(row => row.owner).sort(), exact.standings.filter(row => row.standingsRank > 5).map(row => row.owner).sort());
  assert.equal(exact.normalSixth.owner, 'C');
  assert.equal(exact.standings.find(row => row.owner === 'A').pointsFor, 110.29);
  assert.equal(exact.standings.find(row => row.owner === 'D').pointsFor, 1099.99);
  const bracket = machineBracketHtml(exact);
  assert.match(bracket, /Exact six-seed bracket/);
  assert.match(bracket, /Opening round/);
  assert.match(bracket, /Winner TBD/);
  assert.match(bracket, /Final/);
  assert.match(bracket, /winner of 4\/5/);
  assert.match(bracket, /winner of 3\/6/);
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
  assert.match(machineBracketHtml(machine), /3 of 4 remaining games have complete scenario scores/);
  assert.doesNotMatch(machineBracketHtml(machine), /Seed 6|Opening round/);
});

test('malformed valid-key edits are warned and ignored for standings and exactness', () => {
  const key = playoffMachineGameKey(season.games[4]);
  for (const malformed of [{ outcome: 'bogus', scoreA: '100', scoreB: '90' }, { scoreA: '100', scoreB: '90', extra: true }]) {
    const edits = Object.fromEntries(season.games.slice(4).map(source => [playoffMachineGameKey(source), { scoreA: '100', scoreB: '90' }]));
    edits[key] = malformed;
    const machine = buildPlayoffMachine({ currentSeason: season, season: 2026, scenario: edits });
    const row = machine.games.find(gameRow => gameRow.key === key);
    assert.match(row.editError, /saved pick is invalid/);
    assert.equal(row.edit, null);
    assert.match(machine.issues.join(' '), /invalid and were ignored/);
    assert.equal(machine.exact, false);
    assert.equal(machine.standings.find(team => team.owner === 'A').pointsFor, 110);
  }
});

test('completed schedule renders completion copy without undefined week or navigation', () => {
  const completeSeason = { ...season, games: season.games.map(source => ({ ...source, status: 'final', scoreA: 100, scoreB: 90 })) };
  const machine = buildPlayoffMachine({ currentSeason: completeSeason, season: 2026 });
  assert.deepEqual(machine.weeks, []);
  const root = { getElementById: id => id === 'currentPlayoffMachineTemplate'
    ? { innerHTML: '__WEEK_NAV__ __MACHINE_ACTIONS__ __MACHINE_GAMES__' }
    : { innerHTML: '' } };
  const html = currentPlayoffMachineHtml(machine, null, root);
  assert.match(html, /regular season is complete/i);
  assert.doesNotMatch(html, /Week undefined|data-machine-action="week-(?:prev|next)"/);
  assert.doesNotMatch(html, /data-machine-action="clear-week"/);
});

test('equal-PF wildcard leaders remain unseeded and are announced as unresolved', () => {
  const completedSeason = { ...season, games: season.games.map((source, index) => ({
    ...source, status: 'final', scoreA: index === 7 ? 130 : 100, scoreB: index === 7 ? 70 : 100,
  })) };
  const machine = buildPlayoffMachine({ currentSeason: completedSeason, season: 2026 });
  assert.equal(machine.exact, true);
  assert.equal(machine.wildcardTie, true);
  assert.equal(machine.qualifier, null);
  assert.equal(machine.standings.filter(row => row.playoffSeed).length, 5);
  assert.deepEqual(machine.candidates.filter(row => row.qualificationReason === 'points_for_tie').map(row => row.owner).sort(), ['E', 'G']);
  assert.deepEqual(machine.candidates.map(row => row.owner), ['E', 'G', 'H']);
  assert.equal(machine.candidates.find(row => row.owner === 'H').gap, 30);

  let html = '';
  const notice = { textContent: '' };
  const root = { getElementById: id => id === 'currentPlayoffMachine'
    ? { set innerHTML(value) { html = value; } }
    : id === 'currentMachineAnnouncement' ? notice
      : id === 'currentPlayoffMachineTemplate'
        ? { innerHTML: '__MACHINE_STATUS__ __MACHINE_EXPLANATION__ __SEED_BOARD__ __CANDIDATES__ __RACE_NOTE__' }
        : { innerHTML: '' } };
  drawPlayoffMachine({ currentSeason: completedSeason, season: 2026, doc: root });
  assert.match(html, /Scores complete · sixth spot unresolved/);
  assert.match(html, /Scores are complete, but equal total points leave seed 6 unresolved/);
  assert.match(html, /no official seed 6 is chosen/);
  assert.doesNotMatch(html, /Seed 6/);
  assert.match(notice.textContent, /sixth spot remains unresolved/);
  assert.match(machineBracketHtml(machine), /no official points-for tiebreak has been set/i);
  assert.doesNotMatch(machineBracketHtml(machine), /Opening round|Seed 6/);
});

test('provisional equal-PF leaders are not described as a completed tie', () => {
  const partialSeason = { ...season, games: season.games.map((source, index) => index < 4
    ? { ...source, scoreA: 100, scoreB: 100 }
    : source) };
  const machine = buildPlayoffMachine({ currentSeason: partialSeason, season: 2026 });
  assert.equal(machine.exact, false);
  assert.equal(machine.wildcardTie, true);
  assert.deepEqual(machine.candidates.filter(row => row.qualificationReason === 'points_for_tie').map(row => row.owner), ['F', 'G', 'H']);

  let html = '';
  const notice = { textContent: '' };
  const root = { getElementById: id => id === 'currentPlayoffMachine'
    ? { set innerHTML(value) { html = value; } }
    : id === 'currentMachineAnnouncement' ? notice
      : id === 'currentPlayoffMachineTemplate'
        ? { innerHTML: '__MACHINE_EXPLANATION__ __RACE_NOTE__' }
        : { innerHTML: '' } };
  drawPlayoffMachine({ currentSeason: partialSeason, season: 2026, doc: root });
  assert.match(html, /Current PF leaders are tied; unscored games may change the seed-6 race/);
  assert.match(html, /Current PF leaders F and G and H are tied; unscored games can change the seed-6 race/);
  assert.doesNotMatch(html, /Scores are complete|no official seed 6 is chosen/);
  assert.match(notice.textContent, /unscored games may change the seed-6 race/);
  assert.doesNotMatch(notice.textContent, /Scores are complete/);
});
