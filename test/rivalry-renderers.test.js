import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRivalryViewModel,
  rivalryHeadlineHtml,
  rivalrySeasonTableHtml,
  rivalryGameTableHtml,
  rivalryTapeHtml,
  summarizeRivalry,
} from '../js/rivalry-renderers.js';

test('rivalry renderer summarizes games and tape from team A perspective', () => {
  const games = [
    {
      season: 2024,
      date: '2024-09-01',
      teamA: 'Joe',
      teamB: 'Joel',
      scoreA: 95,
      scoreB: 95,
      type: 'Saunders',
      round: 'Saunders Final',
      _weekByTeam: { Joe: 1, Joel: 1 },
    },
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Joel',
      scoreA: 100,
      scoreB: 90,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 1, Joel: 1 },
    },
    {
      season: 2025,
      date: '2025-09-14',
      teamA: 'Joel',
      teamB: 'Joe',
      scoreA: 110,
      scoreB: 100,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 2, Joel: 2 },
    },
    {
      season: 2025,
      date: '2025-12-14',
      teamA: 'Joel',
      teamB: 'Joe',
      scoreA: 80,
      scoreB: 70,
      type: 'Playoff',
      round: 'Final',
      _weekByTeam: { Joe: 15, Joel: 15 },
    },
  ];

  const vm = buildRivalryViewModel('Joe', 'Joel', games);
  assert.equal(vm.summary.overall.recordText, '1-2-1');
  assert.equal(vm.summary.overall.g, 4);
  assert.equal(vm.summary.regular.recordText, '1-1');
  assert.equal(vm.summary.playoffs.recordText, '0-1');
  assert.equal(vm.summary.saunders.recordText, '0-0-1');
  assert.equal(vm.summary.currentStreak.leader, 'Joel');
  assert.equal(vm.summary.currentStreak.len, 2);
  assert.equal(vm.summary.longestTeamAStreak.len, 1);
  assert.equal(vm.summary.longestTeamBStreak.len, 2);
  assert.equal(vm.summary.biggestBlowout.margin, 10);
  assert.equal(vm.summary.closestGame.margin, 0);
  assert.equal(vm.summary.lastMeeting.date, '2025-12-14');

  assert.equal(vm.seasonRows.length, 2);
  assert.equal(vm.seasonRows[0].season, 2025);
  assert.equal(vm.seasonRows[0].recordText, '1-2');
  assert.match(vm.seasonRows[0].notes.join(' • '), /Playoff meeting/);
  assert.match(vm.seasonRows[1].notes.join(' • '), /Saunders meeting/);

  assert.equal(vm.gameRows[0].date, '2025-12-14');
  assert.equal(vm.gameRows[0].winner, 'Joel');
  assert.equal(vm.gameRows[0].score, '70.00 - 80.00');
  assert.equal(vm.gameRows[3].result, 'T');

  const tape = rivalryTapeHtml(vm);
  assert.match(tape, /Series Record/);
  assert.match(tape, /1-2-1/);
  assert.match(tape, /Current Streak/);
  assert.match(tape, /Joel W2/);
  assert.match(tape, /Margin Avg \/ Median/);
  assert.match(tape, /7\.50 \/ 10\.00/);
  assert.match(tape, /30\+ Point Wins/);
  assert.match(tape, /Joe 0 \/ Joel 0/);
  assert.match(tape, /Biggest Blowout/);
  assert.match(tape, /Joel on 2025-12-14/);
  assert.match(tape, /Shootouts/);
  assert.match(tape, /Both teams 130\+/);

  const headline = rivalryHeadlineHtml(vm);
  assert.match(headline, /Joe vs Joel/);
  assert.match(headline, /Joel leads 2-1-1/);
  assert.match(headline, /Regular 1-1/);
  assert.match(headline, /Playoffs 0-1/);
  assert.match(headline, /Saunders 0-0-1/);

  const seasonHtml = rivalrySeasonTableHtml(vm);
  assert.match(seasonHtml, /2025/);
  assert.match(seasonHtml, /1-2/);
  assert.match(seasonHtml, /Playoff meeting/);
  assert.match(seasonHtml, /Postseason winner: Joel/);

  const gameHtml = rivalryGameTableHtml(vm);
  assert.match(gameHtml, /2025-12-14/);
  assert.match(gameHtml, /Joel/);
  assert.match(gameHtml, /70\.00 - 80\.00/);
});

test('rivalry season table marks sweeps with a broom emoji', () => {
  const games = [
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Joel',
      scoreA: 100,
      scoreB: 90,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 1, Joel: 1 },
    },
    {
      season: 2025,
      date: '2025-09-14',
      teamA: 'Joel',
      teamB: 'Joe',
      scoreA: 80,
      scoreB: 85,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 2, Joel: 2 },
    },
  ];

  const vm = buildRivalryViewModel('Joe', 'Joel', games);
  assert.match(rivalrySeasonTableHtml(vm), /🧹 Sweep/);
});

test('rivalry renderer escapes data and handles empty matchups', () => {
  const games = [
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe <Owner>',
      teamB: 'Joel & Co',
      scoreA: 100,
      scoreB: 90,
      type: 'Regular',
      round: '',
      _weekByTeam: { 'Joe <Owner>': 1, 'Joel & Co': 1 },
    },
  ];

  const vm = summarizeRivalry('Joe <Owner>', 'Joel & Co', games);
  const headline = rivalryHeadlineHtml({
    teamA: 'Joe <Owner>',
    teamB: 'Joel & Co',
    summary: vm,
  });
  assert.match(headline, /Joe &lt;Owner&gt; vs Joel &amp; Co/);
  assert.doesNotMatch(headline, /<Owner>/);

  const empty = buildRivalryViewModel('Joe', 'Joel', []);
  assert.match(rivalryHeadlineHtml(empty), /No recorded games between Joe and Joel/);
  assert.match(rivalrySeasonTableHtml(empty), /No recorded games between these teams/);
  assert.match(rivalryGameTableHtml(empty), /No recorded games between these teams/);
});
