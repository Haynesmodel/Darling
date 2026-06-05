import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLeagueFunFactsAllTeamsViewModel,
  buildTeamFunFactsViewModel,
  leagueSummaryTablesHtml,
  leagueFunFactsAllTeamsHtml,
  leagueFunListsAllTeamsHtml,
  teamFunFactsView,
} from '../js/league-renderers.js';

test('league renderer view models normalize all-teams fun fact text', () => {
  const vm = buildLeagueFunFactsAllTeamsViewModel({
    seasonAggregates: [
      { team: 'Joe', season: 2025, w: 10, l: 4, t: 0, n: 14, pct: 10 / 14, pf: 1400, pa: 1200, diff: 200 },
      { team: 'Shap', season: 2025, w: 3, l: 11, t: 0, n: 14, pct: 3 / 14, pf: 1050, pa: 1300, diff: -250 },
    ],
    winStreak: { team: 'Joe', len: 6, start: { date: '2025-09-07' }, end: { date: '2025-10-12' } },
    lossStreak: { team: 'Shap', len: 5, start: { date: '2025-09-14' }, end: { date: '2025-10-12' } },
    headToHeadPairs: [
      { team: 'Joe', opp: 'Shap', w: 7, l: 1, t: 0, g: 8, pct: 7 / 8 },
    ],
    topWeeklyScores: [
      { team: 'Joe', opp: 'Shap', pf: 180.25, date: '2025-09-07' },
    ],
  });

  assert.equal(vm.tiles[0].label, 'Best Single-Season Record');
  assert.equal(vm.tiles[0].value, '10-4');
  assert.match(vm.tiles[0].sub, /Joe • 2025 • 71\.4%/);
  assert.match(vm.tiles[4].sub, /Joe \(2025-09-07 → 2025-10-12\)/);
  assert.match(vm.tiles[5].sub, /Shap \(2025-09-14 → 2025-10-12\)/);
  assert.match(vm.tiles[6].sub, /Joe vs Shap/);
  assert.equal(vm.tiles[7].value, '180.25');
});

test('league renderer view models normalize team fun fact text', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 100, type: 'Regular', round: '', _weekByTeam: { Joe: 1, Shap: 1 } },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Nuss', scoreA: 75, scoreB: 82, type: 'Regular', round: '', _weekByTeam: { Joe: 2, Nuss: 2 } },
  ];
  const vm = buildTeamFunFactsViewModel('Joe', games, {
    seasonSummaries: [{ owner: 'Joe', season: 2025, bye: true }],
    seasonAggregates: [{ team: 'Joe', season: 2025, n: 2, ppg: 97.5, oppg: 91.0 }],
    winStreak: { len: 1, start: { date: '2025-09-07' }, end: { date: '2025-09-07' } },
    lossStreak: { len: 1, start: { date: '2025-09-14' }, end: { date: '2025-09-14' } },
    luckSummary: { act: 1, exp: 1.5, luck: -0.5 },
  });

  assert.equal(vm.facts[0].label, 'Highest Score');
  assert.equal(vm.facts[0].value, '120.00');
  assert.match(vm.facts[0].sub, /2025-09-07 vs Shap/);
  assert.match(vm.facts[3].sub, /2025-09-07 → 2025-09-07/);
  assert.match(vm.facts[8].value, /97\.50/);
  assert.equal(vm.highestGames[0].score, '120.00 – 100.00');
  assert.equal(vm.highestGames[0].opponent, 'Shap');
  assert.equal(vm.lowestGames[0].opponent, 'Nuss');
});

test('league renderer builds all-teams summary tables', () => {
  const seasonAggregates = [
    { team: 'Joe', w: 10, l: 4, t: 0, n: 14, pf: 1400, pa: 1260 },
    { team: 'Shap', w: 7, l: 7, t: 0, n: 14, pf: 1330, pa: 1320 },
    { team: 'Joe', w: 8, l: 6, t: 0, n: 14, pf: 1330, pa: 1290 },
  ];
  const summaries = [
    {
      owner: 'Joe',
      playoff_wins: 2,
      playoff_losses: 0,
      bye: true,
      champion: true,
      saunders_wins: 0,
      saunders_losses: 0,
      saunders: false,
      bagels_earned: 2,
      finish: 1,
    },
    {
      owner: 'Shap',
      playoff_wins: 0,
      playoff_losses: 1,
      bye: false,
      champion: false,
      saunders_wins: 1,
      saunders_losses: 0,
      saunders: true,
      bagels_earned: 1,
      finish: 3,
    },
  ];
  const games = [
    { teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 100, type: 'Playoff' },
    { teamA: 'Shap', teamB: 'Joe', scoreA: 90, scoreB: 80, type: 'Saunders' },
  ];

  const html = leagueSummaryTablesHtml({
    leagueGames: games,
    seasonSummaries: summaries,
    seasonAggregates,
  });

  assert.match(html, /Regular Season \(All-Time\)/);
  assert.match(html, /<td>Joe<\/td><td>18-10<\/td><td>64\.3%<\/td><td>97\.50<\/td><td>91\.07<\/td>/);
  assert.match(html, /Post Season \(All-Time\)/);
  assert.doesNotMatch(html, /<th scope="col">Bagels<\/th>/);
  assert.match(html, /<td>Joe<\/td><td>2-0<\/td><td>1<\/td><td>1<\/td>\s*<td>120\.00<\/td><td>100\.00<\/td>/);
  assert.match(html, /<td>Shap<\/td><td>0-1<\/td><td>0<\/td><td>0<\/td>\s*<td>100\.00<\/td><td>120\.00<\/td>/);
  assert.match(html, /<td>1-0<\/td><td>1<\/td>/);
  assert.match(html, /Average Finish \(All-Time\)/);
  assert.match(html, /<td>Joe<\/td><td>1\.00<\/td><td>1<\/td>/);
});

test('league renderer builds all-teams fun fact tiles', () => {
  const html = leagueFunFactsAllTeamsHtml({
    seasonAggregates: [
      { team: 'Joe', season: 2025, w: 10, l: 4, t: 0, n: 14, pct: 10 / 14, pf: 1400, pa: 1200, diff: 200 },
      { team: 'Shap', season: 2025, w: 3, l: 11, t: 0, n: 14, pct: 3 / 14, pf: 1050, pa: 1300, diff: -250 },
    ],
    winStreak: { team: 'Joe', len: 6, start: { date: '2025-09-07' }, end: { date: '2025-10-12' } },
    lossStreak: { team: 'Shap', len: 5, start: { date: '2025-09-14' }, end: { date: '2025-10-12' } },
    headToHeadPairs: [
      { team: 'Joe', opp: 'Shap', w: 7, l: 1, t: 0, g: 8, pct: 7 / 8 },
    ],
    topWeeklyScores: [
      { team: 'Joe', opp: 'Shap', pf: 180.25, date: '2025-09-07' },
    ],
  });

  assert.match(html, /Best Single-Season Record/);
  assert.match(html, /<div class="value">10-4<\/div>/);
  assert.match(html, /Joe • 2025 • 71\.4%/);
  assert.match(html, /Worst Season Point Diff/);
  assert.match(html, /-250/);
  assert.match(html, /Joe \(2025-09-07 → 2025-10-12\)/);
  assert.match(html, /Shap \(2025-09-14 → 2025-10-12\)/);
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.match(html, /87\.5%/);
  assert.match(html, /180\.25/);
});

test('league renderer builds all-teams fun list tables', () => {
  const seasonAggregates = [
    { team: 'Joe', season: 2025, w: 10, l: 4, t: 0, n: 14, pct: 10 / 14, ppg: 100, oppg: 85, luck: 1.25 },
    { team: 'Shap', season: 2025, w: 4, l: 10, t: 0, n: 14, pct: 4 / 14, ppg: 80, oppg: 105, luck: -1.5 },
  ];
  const leagueGames = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Shap', scoreA: 75, scoreB: 82, type: 'Regular', round: '' },
    { season: 2025, date: '2025-12-14', teamA: 'Joe', teamB: 'Shap', scoreA: 130, scoreB: 100, type: 'Playoff', round: 'Final' },
  ];
  const html = leagueFunListsAllTeamsHtml({
    leagueGames,
    seasonSummaries: [{ owner: 'Joe', season: 2025, champion: true }],
    seasonAggregates,
    highs: [{ team: 'Joe', opp: 'Shap', pf: 120, pa: 90, date: '2025-09-07' }],
    lows: [{ team: 'Joe', opp: 'Shap', pf: 75, pa: 82, date: '2025-09-14' }],
    streaks: [{ team: 'Joe', len: 3, start: '2025-09-07', end: '2025-09-21' }],
    streaksLoss: [{ team: 'Shap', len: 2, start: '2025-09-07', end: '2025-09-14' }],
    weeklyAwards: {
      top: [{ team: 'Joe', count: 2 }],
      low: [{ team: 'Shap', count: 2 }],
      high150: [{ team: 'Joe', count: 1 }],
    },
    sub70: [{ team: 'Shap', count: 1 }],
    headToHeadPairs: [{ team: 'Joe', opp: 'Shap', w: 2, l: 1, t: 0, g: 3, pct: 2 / 3 }],
    limit: 10,
  });

  assert.match(html, /Best Regular Seasons/);
  assert.match(html, /<td>Joe<\/td><td>2025<\/td><td>10-4<\/td>/);
  assert.match(html, /Most Dominant Playoff Runs/);
  assert.match(html, /<td>Joe<\/td><td>2025<\/td><td>30\.00<\/td><td>1<\/td>/);
  assert.match(html, /Highest Scoring Performances/);
  assert.match(html, /120\.–90\./);
  assert.match(html, /Most Dominant Rivalries/);
  assert.match(html, /66\.7%/);
  assert.match(html, /Lowest Scoring Wins/);
  assert.match(html, /82\.–75\./);
  assert.match(html, /Most Consecutive Weeks Not Lowest/);
  assert.match(html, /Most Rival Wins/);
});

test('league renderer builds team-specific fun fact view', () => {
  const games = [
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 160,
      scoreB: 100,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 1, Shap: 1 },
    },
    {
      season: 2025,
      date: '2025-09-14',
      teamA: 'Joe',
      teamB: 'Nuss',
      scoreA: 80,
      scoreB: 100,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 2, Nuss: 2 },
    },
    {
      season: 2025,
      date: '2025-09-21',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 120,
      scoreB: 118,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 3, Shap: 3 },
    },
  ];
  const view = teamFunFactsView('Joe', games, {
    leagueGames: games,
    seasonSummaries: [
      { owner: 'Joe', season: 2025, bye: true, saunders_bye: true },
    ],
    seasonAggregates: [
      { team: 'Joe', season: 2025, n: 14, ppg: 100, oppg: 90 },
      { team: 'Joe', season: 2014, n: 14, ppg: 120, oppg: 80 },
    ],
    winStreak: { len: 2, start: games[0], end: games[2] },
    lossStreak: { len: 1, start: games[1], end: games[1] },
    luckSummary: { exp: 1.5, act: 2, luck: 0.5 },
    blowoutMargin: 29,
    highScoreThreshold: 150,
    closeGameMargin: 5,
  });

  assert.match(view.factsHtml, /Highest Score/);
  assert.match(view.factsHtml, /160\.00/);
  assert.match(view.factsHtml, /Biggest Blowout/);
  assert.match(view.factsHtml, /\+60\.00/);
  assert.match(view.factsHtml, /Biggest Loss/);
  assert.match(view.factsHtml, /-20\.00/);
  assert.match(view.factsHtml, /Wk 1 2025 → Wk 3 2025/);
  assert.match(view.factsHtml, /Top-Week Crowns/);
  assert.match(view.factsHtml, /Bottom-Week Turds/);
  assert.match(view.factsHtml, /Close Games Record \(&lt;5\)|Close Games Record \(<5\)/);
  assert.match(view.factsHtml, /Most PPG Season/);
  assert.match(view.factsHtml, /2025/);
  assert.match(view.factsHtml, /Luck \(Actual − Expected\)/);
  assert.match(view.factsHtml, /\+0\.50/);
  assert.match(view.factsHtml, /Years: 2025/);
  assert.match(view.listsHtml, /Top 5 Highest Scoring Games/);
  assert.match(view.listsHtml, /160\.00 – 100\.00/);
  assert.match(view.listsHtml, /Bottom 5 Lowest Scoring Games/);
  assert.match(view.listsHtml, /80\.00 – 100\.00/);
});
