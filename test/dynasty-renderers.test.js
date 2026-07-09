import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOwnerSeasonProfiles,
  calculateDynastyScore,
  calculateDynastyScoresForPeriod,
  computeBestWindowsByOwner,
  computeRollingDynastyWindows,
  computeSlumpWindows,
  dynastyCalculatorHeroHtml,
  dynastyFormulaHtml,
  dynastyHeatmapHtml,
  dynastyPeriodLeaderboardHtml,
  dynastyScoreBreakdownHtml,
  rankDynastyScores,
  scoreOwnerSeason,
  buildDynastyViewModel,
  buildDynastyTrendChartModel,
  buildDynastyWindowKey,
  dynastyTrendChartHtml,
  dynastyWindowModalHtml,
  dynastySlumpsHtml,
} from '../js/dynasty-renderers.js';

function makeSeasonSummary(season, owner, overrides = {}) {
  return {
    season,
    owner,
    wins: 8,
    losses: 4,
    ties: 0,
    finish: 2,
    points_for: 1000,
    points_against: 950,
    playoff_wins: 1,
    playoff_losses: 1,
    saunders_wins: 0,
    saunders_losses: 0,
    champion: false,
    saunders: false,
    bye: false,
    wild_card: true,
    saunders_bye: false,
    bagels_earned: null,
    ...overrides,
  };
}

function makeAggregate(season, owner, summary) {
  return {
    team: owner,
    season,
    pf: summary.points_for,
    pa: summary.points_against,
    diff: summary.points_for - summary.points_against,
  };
}

const seasonSummaries = [
  makeSeasonSummary(2021, 'Joe', {
    wins: 8,
    finish: 2,
    points_for: 1000,
    points_against: 990,
    playoff_wins: 2,
    champion: true,
    wild_card: true,
  }),
  makeSeasonSummary(2021, 'Shap', {
    wins: 9,
    finish: 1,
    points_for: 1015,
    points_against: 985,
    bye: true,
    wild_card: false,
  }),
  makeSeasonSummary(2021, 'Nuss', {
    wins: 6,
    finish: 3,
    points_for: 900,
    points_against: 1005,
  }),
  makeSeasonSummary(2022, 'Joe', {
    wins: 9,
    finish: 1,
    points_for: 1035,
    points_against: 980,
    bye: true,
    wild_card: false,
  }),
  makeSeasonSummary(2022, 'Shap', {
    wins: 8,
    finish: 2,
    points_for: 1008,
    points_against: 985,
  }),
  makeSeasonSummary(2022, 'Nuss', {
    wins: 6,
    finish: 3,
    points_for: 910,
    points_against: 1012,
  }),
  makeSeasonSummary(2023, 'Joe', {
    wins: 8,
    finish: 2,
    points_for: 995,
    points_against: 980,
    playoff_wins: 2,
    champion: true,
    wild_card: true,
  }),
  makeSeasonSummary(2023, 'Shap', {
    wins: 9,
    finish: 1,
    points_for: 1025,
    points_against: 970,
    bye: true,
    wild_card: false,
  }),
  makeSeasonSummary(2023, 'Nuss', {
    wins: 6,
    finish: 3,
    points_for: 905,
    points_against: 1008,
  }),
  makeSeasonSummary(2024, 'Shap', {
    wins: 10,
    finish: 1,
    points_for: 1040,
    points_against: 970,
    champion: true,
    bye: true,
    wild_card: false,
  }),
  makeSeasonSummary(2024, 'Nuss', {
    wins: 7,
    finish: 2,
    points_for: 940,
    points_against: 1010,
  }),
];

const seasonAggregates = seasonSummaries.map(row => makeAggregate(row.season, row.owner, row));
const seasonProfiles = buildOwnerSeasonProfiles({
  seasonSummaries,
  seasonAggregates,
});

test('buildOwnerSeasonProfiles computes ranks and hardware flags', () => {
  const joe2022 = seasonProfiles.find(row => row.owner === 'Joe' && row.season === 2022);
  const shap2021 = seasonProfiles.find(row => row.owner === 'Shap' && row.season === 2021);
  const nuss2021 = seasonProfiles.find(row => row.owner === 'Nuss' && row.season === 2021);

  assert.equal(joe2022.regularSeasonTitle, true);
  assert.equal(shap2021.regularSeasonTitle, true);
  assert.equal(joe2022.pointsForRank, 1);
  assert.equal(shap2021.pointsForRank, 1);
  assert.equal(joe2022.pointDiffRank, 1);
  assert.equal(shap2021.pointDiffRank, 1);
  assert.equal(seasonProfiles.find(row => row.owner === 'Joe' && row.season === 2021).pointDiffRank, 2);
  assert.equal(nuss2021.pointDiffRank, 3);

  const scored = scoreOwnerSeason({
    ...joe2022,
    playoffWins: 0,
  });
  assert.equal(scored.components.postseason, 0);
  assert.equal(scored.components.hardware, 23);
  assert.equal(scored.score, scored.components.regularSeason + scored.components.postseason + scored.components.hardware + scored.components.scoringDominance + scored.components.consistency + scored.components.penalties);
});

test('calculateDynastyScore scores a selected owner and preserves coverage metadata', () => {
  const score = calculateDynastyScore({
    owner: 'Joe',
    startSeason: 2019,
    endSeason: 2024,
    requestedStartSeason: 2019,
    requestedEndSeason: 2024,
    seasonProfiles,
    minSeasons: 1,
  });

  assert.equal(score.owner, 'Joe');
  assert.equal(score.requestedSeasonCount, 6);
  assert.equal(score.scoredSeasonCount, 3);
  assert.equal(score.coverageRatio, 0.5);
  assert.equal(score.label, 'Dynasty Run');
  assert.equal(score.championships, 2);
  assert.equal(score.regularSeasonTitles, 1);
  assert.equal(score.playoffWins, 5);
  assert.equal(Number.isFinite(score.rankInPeriod), true);
  assert.ok(score.score > 0);
  assert.equal(score.score, score.components.regularSeason + score.components.postseason + score.components.hardware + score.components.scoringDominance + score.components.consistency + score.components.penalties);
});

test('calculateDynastyScoresForPeriod ranks all owners deterministically', () => {
  const scores = calculateDynastyScoresForPeriod({
    startSeason: 2021,
    endSeason: 2023,
    seasonProfiles,
    minSeasons: 2,
  });

  assert.equal(scores[0].owner, 'Joe');
  assert.equal(scores[0].rankInPeriod, 1);
  assert.equal(scores.every(row => Number.isFinite(row.percentileInPeriod)), true);
});

test('rankDynastyScores uses tie-breakers after total score', () => {
  const ranked = rankDynastyScores([
    {
      owner: 'A',
      score: 100,
      championships: 1,
      regularSeasonTitles: 0,
      playoffWins: 1,
      winPct: 0.6,
      pointDiff: 40,
      averageFinish: 2,
      requestedStartSeason: 2021,
      requestedEndSeason: 2023,
      scoredSeasonCount: 3,
      coverageRatio: 1,
    },
    {
      owner: 'B',
      score: 100,
      championships: 2,
      regularSeasonTitles: 0,
      playoffWins: 1,
      winPct: 0.6,
      pointDiff: 40,
      averageFinish: 2,
      requestedStartSeason: 2021,
      requestedEndSeason: 2023,
      scoredSeasonCount: 3,
      coverageRatio: 1,
    },
    {
      owner: 'C',
      score: 100,
      championships: 2,
      regularSeasonTitles: 1,
      playoffWins: 1,
      winPct: 0.6,
      pointDiff: 40,
      averageFinish: 2,
      requestedStartSeason: 2021,
      requestedEndSeason: 2023,
      scoredSeasonCount: 3,
      coverageRatio: 1,
    },
  ]);

  assert.deepEqual(ranked.map(row => row.owner), ['C', 'B', 'A']);
  assert.deepEqual(ranked.map(row => row.rankInPeriod), [1, 2, 3]);
});

test('rolling windows respect minSeasons and best windows are unique per owner', () => {
  const rollingThree = computeRollingDynastyWindows({
    windowSize: 3,
    seasonProfiles,
    minSeasons: 3,
  });

  const joeWindows = rollingThree.filter(row => row.owner === 'Joe');
  assert.ok(joeWindows.some(row => row.windowLabel === '2021-2023'));
  assert.ok(joeWindows.every(row => row.windowLabel === '2021-2023'));

  const best = computeBestWindowsByOwner(rollingThree);
  assert.equal(new Set(best.map(row => row.owner)).size, best.length);
  assert.ok(best.length > 0);

  const slumps = computeSlumpWindows({
    rollingThreeWindows: rollingThree,
    seasonProfiles,
  });
  assert.ok(slumps.lowestScores.length > 0);
  assert.ok(slumps.lowestScores[0].score <= slumps.lowestScores[1].score);
  assert.ok(Array.isArray(slumps.biggestDrops));
});

test('biggest drops only compare windows with at most one year of overlap', () => {
  const slumps = computeSlumpWindows({
    rollingWindows: [
      {
        owner: 'Joe',
        score: 100,
        windowStartSeason: 2014,
        windowEndSeason: 2016,
      },
      {
        owner: 'Joe',
        score: 70,
        windowStartSeason: 2015,
        windowEndSeason: 2017,
      },
      {
        owner: 'Joe',
        score: 20,
        windowStartSeason: 2016,
        windowEndSeason: 2018,
      },
      {
        owner: 'Joe',
        score: -5,
        windowStartSeason: 2021,
        windowEndSeason: 2023,
      },
    ],
    seasonProfiles,
  });

  assert.equal(slumps.biggestDrops.length, 1);
  assert.equal(slumps.biggestDrops[0].previousWindow.windowStartSeason, 2014);
  assert.equal(slumps.biggestDrops[0].currentWindow.windowStartSeason, 2016);
  assert.equal(slumps.biggestDrops[0].delta, -80);
  assert.ok(slumps.biggestDrops.every(row => row.currentWindow.windowStartSeason - row.previousWindow.windowStartSeason === 2));
});

test('rolling windows stay within the selected bounds', () => {
  const boundedProfiles = [2020, 2021, 2022, 2023, 2024].map(season => ({
    owner: 'A',
    season,
    wins: 10,
    losses: 0,
    ties: 0,
    games: 10,
    winPct: 1,
    finish: 1,
    pointsFor: 100 + season,
    pointsAgainst: 50,
    pointDiff: 50,
    playoffWins: 1,
    playoffLosses: 0,
    saundersWins: 0,
    saundersLosses: 0,
    champion: false,
    saunders: false,
    bye: false,
    wildCard: true,
    saundersBye: false,
    leagueSize: 10,
    regularSeasonTitle: true,
    pointsForRank: 1,
    pointDiffRank: 1,
    seasonScore: 0,
    seasonComponents: { regularSeason: 0, postseason: 0, hardware: 0, scoringDominance: 0, consistency: 0, penalties: 0 },
  }));

  const windows = computeRollingDynastyWindows({
    windowSize: 3,
    seasonProfiles: boundedProfiles,
    startSeason: 2021,
    endSeason: 2023,
    minSeasons: 1,
  });

  assert.deepEqual(windows.map(row => row.windowLabel), ['2021-2023']);
});

test('selected-range hero shows the top owner for the period, not the selected owner', () => {
  const vm = buildDynastyViewModel({
    seasonSummaries,
    seasonAggregates,
    mode: 'selected-range',
    owner: 'Nuss',
    startSeason: 2021,
    endSeason: 2023,
    minSeasons: 2,
  });

  assert.equal(vm.selectedScore.owner, vm.periodScores[0].owner);
  assert.equal(vm.selectedScore.rankInPeriod, 1);
});

test('renderer html includes the selected owner, breakdown, leaderboard, heatmap, and formula', () => {
  const vm = buildDynastyViewModel({
    seasonSummaries,
    seasonAggregates,
    owner: 'Joe',
    startSeason: 2021,
    endSeason: 2023,
    minSeasons: 2,
  });

  const heroHtml = dynastyCalculatorHeroHtml(vm.selectedScore);
  assert.match(heroHtml, /Joe Dynasty Score/);
  assert.match(heroHtml, /2021-2023/);
  assert.match(heroHtml, /#1 of 3/);
  assert.match(heroHtml, /Darlings/);

  const breakdownHtml = dynastyScoreBreakdownHtml(vm.selectedScore);
  assert.match(breakdownHtml, /regularSeason/);
  assert.match(breakdownHtml, /postseason/);
  assert.match(breakdownHtml, /hardware/);
  assert.match(breakdownHtml, /scoringDominance/);
  assert.match(breakdownHtml, /consistency/);
  assert.match(breakdownHtml, /penalties/);

  const leaderboardHtml = dynastyPeriodLeaderboardHtml(vm.periodScores);
  assert.match(leaderboardHtml, /#1/);
  assert.match(leaderboardHtml, /Joe/);
  assert.match(leaderboardHtml, /Shap/);

  const escapedLeaderboard = dynastyPeriodLeaderboardHtml([
    { owner: 'A&B', rankInPeriod: 1, score: 10, wins: 1, losses: 0, ties: 0, championships: 1, regularSeasonTitles: 1, pointDiff: 10, label: 'Dynasty Run' },
  ]);
  assert.match(escapedLeaderboard, /A&amp;B/);

  const heatmapHtml = dynastyHeatmapHtml(vm.heatmap);
  assert.match(heatmapHtml, /dynasty-heatmap-row/);
  assert.match(heatmapHtml, /2021/);
  assert.match(heatmapHtml, /Joe/);
  assert.match(heatmapHtml, /Shap/);
  assert.match(heatmapHtml, /-?\d+\.\d/);
  assert.ok(!heatmapHtml.includes('>+'));

  const trendHtml = dynastyTrendChartHtml(vm.trendChart);
  assert.match(trendHtml, /All-Time Dynasty Trend/);
  assert.match(trendHtml, /dynastyTrendPlot/);
  assert.match(trendHtml, /dynasty-trend-fallback/);
  assert.match(trendHtml, /data-dynasty-trend-toggle/);

  const slumpsHtml = dynastySlumpsHtml(vm.slumps);
  assert.match(slumpsHtml, /dynasty-slump-item/);
  assert.match(slumpsHtml, /data-window-kind="saunders"/);
  assert.match(slumpsHtml, /-?\d+\.\d/);

  const windowKey = buildDynastyWindowKey(vm.bestWindows.topOverall[0]);
  const modalHtml = dynastyWindowModalHtml(vm.bestWindows.topOverall[0]);
  assert.ok(windowKey.includes('|'));
  assert.match(modalHtml, /Total Record/);
  assert.match(modalHtml, /Playoff Appearances/);
  assert.match(modalHtml, /Final Result/);

  const detailedModalHtml = dynastyWindowModalHtml({
    owner: 'Zubs',
    windowStartSeason: 2021,
    windowEndSeason: 2021,
    windowSize: 1,
    label: 'Dynasty Run',
    wins: 10,
    losses: 4,
    ties: 0,
    championships: 0,
    regularSeasonTitles: 0,
    saundersWins: 1,
    saundersLosses: 1,
    winPct: 0.714,
    seasons: [
      {
        season: 2021,
        wins: 10,
        losses: 4,
        ties: 0,
        finish: 2,
        saundersWins: 1,
        saundersLosses: 1,
        bye: true,
        wildCard: false,
        champion: false,
        saunders: true,
        saundersBye: false,
        leagueSize: 10,
      },
    ],
  }, {
    allGames: [
      {
        season: 2021,
        date: '2021-12-12',
        teamA: 'Zubs',
        teamB: 'Joe',
        scoreA: 94,
        scoreB: 101,
        type: 'Saunders',
        round: 'Championship',
      },
    ],
    kind: 'saunders',
  });
  assert.match(detailedModalHtml, /Saunders Bowl Appearances/);
  assert.match(detailedModalHtml, /Saunders Record/);
  assert.match(detailedModalHtml, /BYE \| Saunders Bowl \| Lost to Joe in Saunders Championship/);

  const formulaHtml = dynastyFormulaHtml();
  assert.match(formulaHtml, /regularSeasonWin/);
  assert.match(formulaHtml, /Dynasty Run/);
});

test('dynasty trend model builds cumulative owner series and honors hidden facets', () => {
  const chart = buildDynastyTrendChartModel([
    { owner: 'Joe', season: 2021, seasonScore: 10 },
    { owner: 'Shap', season: 2021, seasonScore: 5 },
    { owner: 'Joe', season: 2022, seasonScore: 7 },
    { owner: 'Shap', season: 2022, seasonScore: 11 },
  ], ['Shap']);

  assert.equal(chart.series.length > 0, true);
  assert.equal(chart.series.find(row => row.owner === 'Shap')?.hidden, true);
  assert.equal(chart.series.find(row => row.owner === 'Joe')?.points.at(-1)?.cumulativeScore, 17);
  assert.equal(chart.series.find(row => row.owner === 'Shap')?.points.at(-1)?.cumulativeScore, 16);
});
