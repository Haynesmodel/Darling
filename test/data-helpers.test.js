import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../js/core-helpers.js';
import * as stats from '../js/stats-helpers.js';
import * as render from '../js/render-helpers.js';
import * as historyRenderers from '../js/history-renderers.js';
import * as leagueRenderers from '../js/league-renderers.js';

const {
  canonicalGameKey,
  dedupeGames,
  deriveWeeksInPlace,
  computeRegularSeasonChampYears,
  sum,
  unique,
  byDateAsc,
  byDateDesc,
  fmtPct,
  csvEscape,
  normType,
  normRound,
  sidesForTeam,
  isSaundersGame,
  isRegularGame,
  isPlayoffGame,
  roundOrder,
  isRestrictive,
} = core;
const {
  computeSubThresholdGamesPerTeam,
  collectStreakRunsForTeam,
  bestStreakForTeam,
  computeLongestTeamStreaks,
  expectedWinScoreIndex,
  computeExpectedWinForGame,
  computeSeasonAggregatesAllTeams,
  computeHeadToHeadPairs,
  computeWeeklyAwards,
  computeTeamsFromLeagueGames,
  computeLeagueRowsSingleWeeks,
  computeTopNWeeklyScoresAllTeams,
  computeBottomNWeeklyScoresAllTeams,
  computeLongestStreaksGlobal,
  computeLuckSummary,
} = stats;
const {
  nfmt,
  fmtTrimmed,
  escapeHtml,
  headerBannerHtml,
  facetControlHtml,
} = render;

test('shared helpers behave consistently', () => {
  assert.equal(sum([1, 2, 3, 4]), 10);
  assert.deepEqual(
    [{ date: '2025-10-12' }, { date: '2025-09-07' }].sort(byDateAsc),
    [{ date: '2025-09-07' }, { date: '2025-10-12' }]
  );
  assert.deepEqual(
    [{ date: '2025-09-07' }, { date: '2025-10-12' }].sort(byDateDesc),
    [{ date: '2025-10-12' }, { date: '2025-09-07' }]
  );
  assert.equal(fmtPct(7, 2, 1), '75.0%');
  assert.equal(csvEscape('Joe "The Boss"'), 'Joe ""The Boss""');
  assert.equal(normType(''), 'Regular');
  assert.equal(normRound(null), '');
  assert.equal(roundOrder('Saunders Final'), 2);
  assert.deepEqual(unique(['Joe', 'Shap', 'Joe', 'Nuss', 'Shap']), ['Joe', 'Shap', 'Nuss']);
  assert.deepEqual(computeRegularSeasonChampYears('Joe', [
    { season: 2024, owner: 'Joe', wins: 9 },
    { season: 2024, owner: 'Shap', wins: 8 },
    { season: 2025, owner: 'Joe', wins: 7 },
    { season: 2025, owner: 'Shap', wins: 7 },
    { season: 2025, owner: 'Nuss', wins: 5 },
  ]), [2024, 2025]);
});

test('isRestrictive only flags partial selections', () => {
  assert.equal(isRestrictive(new Set(), ['A', 'B']), false);
  assert.equal(isRestrictive(new Set(['A', 'B']), ['A', 'B']), false);
  assert.equal(isRestrictive(new Set(['A']), ['A', 'B']), true);
  assert.equal(isRestrictive(new Set(['A']), []), false);
});

test('game helpers classify and orient matchups consistently', () => {
  const game = {
    teamA: 'Joe',
    teamB: 'Shap',
    scoreA: 101,
    scoreB: 97,
    type: 'Regular',
    round: '',
  };

  assert.deepEqual(sidesForTeam(game, 'Joe'), { pf: 101, pa: 97, opp: 'Shap', result: 'W' });
  assert.deepEqual(sidesForTeam(game, 'Shap'), { pf: 97, pa: 101, opp: 'Joe', result: 'L' });
  assert.equal(sidesForTeam(game, 'Nuss'), null);
  assert.equal(isRegularGame(game), true);
  assert.equal(isPlayoffGame(game), false);
  assert.equal(isSaundersGame({ ...game, type: 'Saunders' }), true);
  assert.equal(isPlayoffGame({ ...game, type: 'Playoff' }), true);
});

test('stats helpers compute expected wins and season aggregates', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-07', teamA: 'Nuss', teamB: 'Singer', scoreA: 80, scoreB: 100, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Shap', scoreA: 70, scoreB: 75, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-21', teamA: 'Joe', teamB: 'Nuss', scoreA: 65, scoreB: 80, type: 'Regular', round: '' },
  ];
  const summaries = [
    { season: 2025, owner: 'Joe' },
    { season: 2025, owner: 'Shap' },
  ];

  assert.equal(computeExpectedWinForGame(games, 'Joe', games[0]), 2.5 / 3);
  assert.equal(computeExpectedWinForGame(games, 'Nuss', games[1]), 0);
  assert.equal(expectedWinScoreIndex(games), expectedWinScoreIndex(games));
  assert.equal(expectedWinScoreIndex(games).get('2025|2025-09-07').length, 4);

  const rows = computeSeasonAggregatesAllTeams(games, summaries);
  const joe = rows.find(r => r.team === 'Joe' && r.season === 2025);
  assert.equal(joe.w, 1);
  assert.equal(joe.l, 2);
  assert.equal(joe.n, 3);
  assert.equal(joe.pf, 235);
  assert.equal(joe.pa, 245);
  assert.equal(joe.ppg, 235 / 3);
  assert.equal(joe.pct, 1 / 3);

  const luck = computeLuckSummary(games, 'Joe', games);
  assert.equal(luck.act, 1);
  assert.equal(luck.exp, 2.5 / 3);
  assert.equal(luck.luck, 1 - (2.5 / 3));
});

test('stats helpers cover edge-case expected win and luck calculations', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Alpha', teamB: 'Beta', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-07', teamA: 'Gamma', teamB: 'Delta', scoreA: 90, scoreB: 80, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Alpha', teamB: 'Gamma', scoreA: 50, scoreB: 60, type: 'Regular', round: '' },
    { season: 2024, date: '2024-09-07', teamA: 'Alpha', teamB: 'Beta', scoreA: 200, scoreB: 10, type: 'Regular', round: '' },
  ];

  assert.equal(computeExpectedWinForGame(games, 'Alpha', games[0]), 1.0);
  assert.equal(computeExpectedWinForGame(games, 'Delta', games[1]), 0.0);
  assert.equal(computeExpectedWinForGame(games, 'Gamma', games[1]), 0.5);
  assert.equal(computeExpectedWinForGame(games, 'Alpha', games[2]), 0.0);
  assert.equal(computeExpectedWinForGame(games, 'Alpha', games[3]), 1.0);

  const positiveLuck = computeLuckSummary(games, 'Gamma', games);
  const negativeLuck = computeLuckSummary(games, 'Beta', games);

  assert.ok(positiveLuck.luck > 0);
  assert.ok(negativeLuck.luck < 0);
});

test('stats helpers compute league lists and streaks', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-07', teamA: 'Nuss', teamB: 'Singer', scoreA: 80, scoreB: 100, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Shap', scoreA: 70, scoreB: 75, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-21', teamA: 'Joe', teamB: 'Nuss', scoreA: 65, scoreB: 80, type: 'Regular', round: '' },
    { season: 2014, date: '2014-12-21', teamA: 'Joe', teamB: 'Shap', scoreA: 200, scoreB: 180, type: 'Playoff', round: 'Final' },
  ];

  assert.deepEqual(computeTeamsFromLeagueGames(games), ['Joe', 'Nuss', 'Shap', 'Singer']);
  assert.deepEqual(computeSubThresholdGamesPerTeam(games, 70), [{ team: 'Joe', count: 1 }]);
  assert.equal(computeLeagueRowsSingleWeeks(games).length, 8);
  assert.equal(computeTopNWeeklyScoresAllTeams(games, 1)[0].team, 'Joe');
  assert.equal(computeBottomNWeeklyScoresAllTeams(games, 1)[0].team, 'Joe');

  const h2h = computeHeadToHeadPairs(games, 1).find(r => r.team === 'Joe' && r.opp === 'Shap');
  assert.equal(h2h.g, 3);
  assert.equal(h2h.w, 2);
  assert.equal(h2h.l, 1);
  assert.equal(h2h.pct, 2 / 3);

  const awards = computeWeeklyAwards(games, 100);
  assert.deepEqual(awards.high150.sort((a, b) => a.team.localeCompare(b.team)), [
    { team: 'Joe', count: 1 },
    { team: 'Singer', count: 1 },
  ]);

  const joeLosses = collectStreakRunsForTeam(games, 'Joe', 'L');
  assert.equal(joeLosses[0].len, 2);
  assert.equal(bestStreakForTeam(games, 'Joe', 'L').len, 2);
  assert.equal(computeLongestTeamStreaks(games, ['Joe', 'Shap'], 'L', 1)[0].team, 'Joe');
  assert.equal(computeLongestStreaksGlobal(games, ['Joe', 'Shap'], 'L', 1)[0].team, 'Joe');
});

test('dedupeGames preserves distinct same-date games and deriveWeeksInPlace resets by season', () => {
  const sameDateGames = [
    { season: 2025, date: '2025-09-07', type: 'Regular', round: '', teamA: 'Joe', teamB: 'Shap', scoreA: 101.2, scoreB: 99.8 },
    { season: 2025, date: '2025-09-07', type: 'Regular', round: '', teamA: 'Joe', teamB: 'Nuss', scoreA: 88.4, scoreB: 77.1 },
    { season: 2025, date: '2025-09-07', type: 'Regular', round: '', teamA: 'Joe', teamB: 'Shap', scoreA: 101.2, scoreB: 99.8 },
  ];

  const deduped = dedupeGames(sameDateGames);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0], sameDateGames[0]);
  assert.equal(deduped[1], sameDateGames[1]);

  const crossSeasonGames = [
    { season: 2024, date: '2024-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90 },
    { season: 2024, date: '2024-09-14', teamA: 'Joe', teamB: 'Nuss', scoreA: 110, scoreB: 80 },
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 100 },
  ];

  const weeks = deriveWeeksInPlace(crossSeasonGames);
  assert.deepEqual([...weeks].sort((a, b) => a - b), [1, 2]);
  assert.equal(crossSeasonGames[0]._weekByTeam.Joe, 1);
  assert.equal(crossSeasonGames[1]._weekByTeam.Joe, 2);
  assert.equal(crossSeasonGames[2]._weekByTeam.Joe, 1);
});

test('render helpers format text and build stable markup', () => {
  assert.equal(nfmt(12.345, 1), '12.3');
  assert.equal(nfmt(undefined, 1), '—');
  assert.equal(fmtTrimmed(12), '12.');
  assert.equal(fmtTrimmed(12.3), '12.3');
  assert.equal(escapeHtml('Joe & <Shap> "Nuss"'), 'Joe &amp; &lt;Shap&gt; &quot;Nuss&quot;');

  const banners = headerBannerHtml('Joe', [
    { owner: 'Joe', season: 2024, champion: true, wins: 10 },
    { owner: 'Joe', season: 2025, champion: false, wins: 11 },
    { owner: 'Shap', season: 2025, champion: false, wins: 9 },
  ]);
  assert.match(banners, /banner champ/);
  assert.match(banners, /&#x1f3c6; 2024/);
  assert.match(banners, /&#x1f947; 2025/);

  const facet = facetControlHtml(['A&B', 'Semi Final'], { prefix: 'round' });
  assert.match(facet, /class="round-all"/);
  assert.match(facet, /id="round-all-option"/);
  assert.match(facet, /for="round-option-0"/);
  assert.match(facet, /class="round-cb"/);
  assert.match(facet, /data-value="A%26B"/);
  assert.match(facet, /Semi Final/);
});

test('renderers escape data-driven text before building html', () => {
  const team = 'Joe <Owner>';
  const opp = 'Shap & "Co"';
  const game = {
    season: 2025,
    date: '2025-09-07',
    teamA: team,
    teamB: opp,
    scoreA: 100,
    scoreB: 90,
    type: 'Regular <bad>',
    round: 'Semi & Final',
    _weekByTeam: { [team]: 1, [opp]: 1 },
  };

  const historyHtml = historyRenderers.historyGamesTableRowHtml(game, team);
  assert.match(historyHtml, /Shap &amp; &quot;Co&quot;/);
  assert.match(historyHtml, /Regular &lt;bad&gt;/);
  assert.doesNotMatch(historyHtml, /<bad>/);

  const callout = historyRenderers.seasonCalloutView(team, {
    seasonSummaries: [{ season: 2025, owner: team, wins: 10, losses: 4, ties: 0, finish: 1, playoff_wins: 2, playoff_losses: 0 }],
    selectedSeasons: new Set([2025]),
    allTeams: '__ALL__',
    champNoteFn: () => '<unsafe note>',
    saundersNoteFn: () => null,
  }).html;
  assert.match(callout, /Joe &lt;Owner&gt;/);
  assert.match(callout, /&lt;unsafe note&gt;/);
  assert.doesNotMatch(callout, /<unsafe note>/);

  const leagueHtml = leagueRenderers.leagueSummaryTablesHtml({
    leagueGames: [game],
    seasonSummaries: [{ season: 2025, owner: team, wins: 10, losses: 4, ties: 0, finish: 1, playoff_wins: 2, playoff_losses: 0 }],
    seasonAggregates: [{ team, w: 1, l: 0, t: 0, n: 1, pf: 100, pa: 90 }],
  });
  assert.match(leagueHtml, /Joe &lt;Owner&gt;/);
  assert.doesNotMatch(leagueHtml, /<Owner>/);
});
