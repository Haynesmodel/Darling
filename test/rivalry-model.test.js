import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRivalryViewModel,
  formatLeaderText,
  rivalryGameRows,
  rivalrySeasonBreakdown,
  summarizeRivalry,
} from '../src/features/rivalry/rivalry-model.ts';
import {
  buildPairOptions,
  resolveRivalryState,
} from '../src/features/rivalry/rivalry-state.ts';

const games = [
  { season: 2024, date: '2024-09-01', teamA: 'Joe', teamB: 'Joel', scoreA: 95, scoreB: 95, week: 1, type: 'Saunders', round: 'Saunders Final', _weekByTeam: { Joe: 1, Joel: 1 } },
  { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Joel', scoreA: 100, scoreB: 90, week: 1, type: 'Regular', round: '', _weekByTeam: { Joe: 1, Joel: 1 } },
  { season: 2025, date: '2025-09-14', teamA: 'Joel', teamB: 'Joe', scoreA: 110, scoreB: 100, week: 2, type: 'Regular', round: '', _weekByTeam: { Joe: 2, Joel: 2 } },
  { season: 2025, date: '2025-12-14', teamA: 'Joel', teamB: 'Joe', scoreA: 80, scoreB: 70, week: 15, type: 'Playoff', round: 'Final', _weekByTeam: { Joe: 15, Joel: 15 } },
];

test('typed rivalry model preserves records, runs, tables, and chart facts', () => {
  const model = buildRivalryViewModel('Joe', 'Joel', games, { scope: 'allTime', currentSeason: 2025 });
  assert.equal(model.summary.overall.recordText, '1-2-1');
  assert.equal(model.summary.regular.recordText, '1-1');
  assert.equal(model.summary.playoffs.recordText, '0-1');
  assert.equal(model.summary.saunders.recordText, '0-0-1');
  assert.equal(model.summary.currentStreak?.leader, 'Joel');
  assert.equal(model.summary.currentStreak?.len, 2);
  assert.equal(model.summary.biggestBlowout?.margin, 10);
  assert.equal(model.summary.closestGame?.margin, 0);
  assert.equal(model.seasonRows[0].recordText, '1-2');
  assert.match(model.seasonRows[0].notes.join(' • '), /Playoff meeting \(Championship\) winner: Joel/);
  assert.match(model.seasonRows[1].notes.join(' • '), /Saunders meeting \(Saunders Final\)/);
  assert.equal(model.gameRows[0].score, '70.00 - 80.00');
  assert.equal(model.tape.find(item => item.label === 'Margin Avg / Median')?.value, '7.50 / 10.00');
  assert.equal(model.highlights.map(item => item.label).join('|'), 'Biggest Blowout|Highest Combined|Longest Run|Shootouts|Stinkers');
  assert.equal(model.highlights.find(item => item.label === 'Stinkers')?.value, '0');
  assert.equal(model.leadPoints.length, 4);
  assert.match(model.leadPoints.at(-1)?.title || '', /Series spread: Joel \+ 1/);
  assert.equal(formatLeaderText('Joe', 'Joel', 'L', 2), 'Joel W2');
});

test('typed rivalry state and model preserve scopes, sweeps, and literal owner strings', () => {
  const state = resolveRivalryState(['Joe', 'Joel', 'Zook'], [{ value: 'pair', label: 'Pair', members: ['Joe', 'Joel'] }], { teamA: 'Joe', scope: 'historic' });
  assert.deepEqual(state, { teamA: 'Joe', teamB: 'Joel', scope: 'historic' });
  assert.equal(buildPairOptions([{ slug: 'pair', name: 'Pair', type: 'pair', members: ['Joe', 'Joel'], note: 'Classic' }])[0].label, 'Pair - Classic');

  const current = buildRivalryViewModel('Joe', 'Joel', games, { scope: 'currentSeason', currentSeason: 2025 });
  assert.equal(current.summary.overall.recordText, '1-2');
  const historic = buildRivalryViewModel('Joe', 'Joel', games, { scope: 'historic', currentSeason: 2025 });
  assert.equal(historic.summary.overall.recordText, '0-0-1');

  const sweepGames = games.slice(1, 2).concat([{ ...games[2], scoreA: 80, scoreB: 85 }]);
  assert.match(rivalrySeasonBreakdown('Joe', 'Joel', sweepGames)[0].notes.join(' '), /🧹 Sweep/);
  assert.equal(rivalryGameRows('Joe', 'Joel', [games[0]])[0].result, 'T');

  const unsafeOwner = 'Joe <img onerror=alert(1)>';
  const literal = summarizeRivalry(unsafeOwner, 'Joel & Co', [{ ...games[1], teamA: unsafeOwner, teamB: 'Joel & Co' }]);
  assert.equal(literal.teamA, unsafeOwner);
  assert.equal(literal.teamB, 'Joel & Co');
  assert.equal(buildRivalryViewModel('Nobody', 'Else', [], { scope: 'allTime', currentSeason: 2025 }).gameRows.length, 0);
});

test('rivalry Stinkers count requires both scores to be strictly below 70', () => {
  const boundaryGames = [
    { season: 2022, date: '2022-09-01', teamA: 'Joe', teamB: 'Joel', scoreA: 69.99, scoreB: 69.99, type: 'Regular', round: '' },
    { season: 2023, date: '2023-09-01', teamA: 'Joel', teamB: 'Joe', scoreA: 70, scoreB: 69.99, type: 'Playoff', round: 'Final' },
    { season: 2024, date: '2024-09-01', teamA: 'Joe', teamB: 'Joel', scoreA: 69.99, scoreB: 70, type: 'Saunders', round: 'Saunders Final' },
    { season: 2025, date: '2025-09-01', teamA: 'Joel', teamB: 'Joe', scoreA: 69.98, scoreB: 69.97, type: 'Regular', round: '' },
  ];
  const model = buildRivalryViewModel('Joe', 'Joel', boundaryGames, { scope: 'allTime', currentSeason: 2025 });
  const stinker = model.highlights.find(item => item.label === 'Stinkers');

  assert.deepEqual(stinker, {
    icon: '💩',
    label: 'Stinkers',
    value: '2',
    sub: 'Both teams below 70',
    tone: 'stinker',
  });
});
