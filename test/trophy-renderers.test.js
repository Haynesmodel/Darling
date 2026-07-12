import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrophyCaseViewModel,
  computeLeagueRanks,
  computeOwnerIdentity,
  trophyAchievementListHtml,
  trophyCareerShapeHtml,
  trophyHardwareShelfHtml,
  trophyHeroHtml,
  trophyRankStripHtml,
  trophyScarListHtml,
  trophySeasonLedgerHtml,
} from '../js/trophy-renderers.js';

function makeProfile(owner, overrides = {}) {
  return {
    owner,
    counts: {
      championships: 0,
      regularTitles: 0,
      top2Seeds: 0,
      wildCards: 0,
      saundersTitles: 0,
      saundersByes: 0,
      weeklyCrowns: 0,
      lowScores: 0,
      highScores: 0,
      sub70Games: 0,
      bagels: 0,
      ...(overrides.counts || {}),
    },
    rates: {
      regularWinPct: null,
      playoffWinPct: null,
      saundersWinPct: null,
      averageFinish: null,
      finishStdDev: 0,
      ...(overrides.rates || {}),
    },
    totals: {
      regular: { wins: 0, losses: 0, ties: 0 },
      playoffs: { wins: 0, losses: 0, ties: 0 },
      saunders: { wins: 0, losses: 0, ties: 0 },
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      ...(overrides.totals || {}),
    },
    years: {
      champions: [],
      regularTitles: [],
      top2Seeds: [],
      wildCards: [],
      saundersTitles: [],
      saundersByes: [],
      ...(overrides.years || {}),
    },
    seasonRows: overrides.seasonRows || [],
    seasonLuckRows: overrides.seasonLuckRows || [],
    bestPFSeason: overrides.bestPFSeason || null,
    bestDiffSeason: overrides.bestDiffSeason || null,
    worstFinishSeason: overrides.worstFinishSeason || null,
    mostUnluckySeason: overrides.mostUnluckySeason || null,
    luckiestSeason: overrides.luckiestSeason || null,
    bestGame: overrides.bestGame || null,
    worstGame: overrides.worstGame || null,
    biggestWin: overrides.biggestWin || null,
    biggestLoss: overrides.biggestLoss || null,
    bestLuckGame: overrides.bestLuckGame || null,
    worstLuckGame: overrides.worstLuckGame || null,
    bestPlayoffWin: overrides.bestPlayoffWin || null,
    worstPlayoffLoss: overrides.worstPlayoffLoss || null,
    bestSaundersWin: overrides.bestSaundersWin || null,
    ownerGames: overrides.ownerGames || [],
    regularGames: overrides.regularGames || [],
    playoffGames: overrides.playoffGames || [],
    saundersGames: overrides.saundersGames || [],
  };
}

test('league ranks use competition ranking and identity labels are data driven', () => {
  const profiles = [
    makeProfile('Dyno', {
      counts: { championships: 2, regularTitles: 2, top2Seeds: 4, weeklyCrowns: 18, sub70Games: 2, saundersTitles: 0 },
      rates: { regularWinPct: 0.71, averageFinish: 2.0, finishStdDev: 1.2, playoffWinPct: 0.75 },
      totals: { regular: { wins: 28, losses: 10, ties: 0 }, playoffs: { wins: 6, losses: 2, ties: 0 } },
    }),
    makeProfile('Rail', {
      counts: { championships: 2, regularTitles: 1, top2Seeds: 2, weeklyCrowns: 11, sub70Games: 5, saundersTitles: 1 },
      rates: { regularWinPct: 0.64, averageFinish: 3.0, finishStdDev: 3.5, playoffWinPct: 0.5 },
      totals: { regular: { wins: 24, losses: 14, ties: 0 }, playoffs: { wins: 3, losses: 3, ties: 0 } },
    }),
    makeProfile('Shaky', {
      counts: { championships: 0, regularTitles: 0, top2Seeds: 0, weeklyCrowns: 2, sub70Games: 8, saundersTitles: 3 },
      rates: { regularWinPct: 0.43, averageFinish: 7.2, finishStdDev: 5.4, playoffWinPct: 0.1 },
      totals: { regular: { wins: 10, losses: 18, ties: 0 }, playoffs: { wins: 0, losses: 4, ties: 0 } },
    }),
  ];
  const ranks = computeLeagueRanks(profiles);

  assert.equal(ranks.byOwner.get('Dyno').championships.rank, 1);
  assert.equal(ranks.byOwner.get('Rail').championships.rank, 1);
  assert.equal(ranks.byOwner.get('Shaky').championships.rank, 3);
  assert.equal(ranks.byOwner.get('Dyno').sub70Games.rank, 1);
  assert.equal(ranks.byOwner.get('Shaky').sub70Games.rank, 3);

  const dynasty = computeOwnerIdentity(profiles[0], ranks);
  assert.equal(dynasty.label, 'Dynasty Threat');

  const merchant = computeOwnerIdentity(makeProfile('Merchant', {
    counts: { championships: 0, regularTitles: 3, weeklyCrowns: 4, top2Seeds: 2, saundersTitles: 0 },
    rates: { regularWinPct: 0.68, averageFinish: 2.4, finishStdDev: 1.3, playoffWinPct: 0.3 },
    totals: { regular: { wins: 30, losses: 10, ties: 0 }, playoffs: { wins: 1, losses: 2, ties: 0 } },
  }), computeLeagueRanks([
    makeProfile('Merchant', {
      counts: { championships: 0, regularTitles: 3, weeklyCrowns: 4, top2Seeds: 2, saundersTitles: 0 },
      rates: { regularWinPct: 0.68, averageFinish: 2.4, finishStdDev: 1.3, playoffWinPct: 0.3 },
      totals: { regular: { wins: 30, losses: 10, ties: 0 }, playoffs: { wins: 1, losses: 2, ties: 0 } },
    }),
    makeProfile('Other', {
      counts: { championships: 1, regularTitles: 1, weeklyCrowns: 5, top2Seeds: 3, saundersTitles: 1 },
      rates: { regularWinPct: 0.6, averageFinish: 3.2, finishStdDev: 2.2, playoffWinPct: 0.5 },
      totals: { regular: { wins: 20, losses: 14, ties: 0 }, playoffs: { wins: 3, losses: 3, ties: 0 } },
    }),
  ]));
  assert.equal(merchant.label, 'Regular Season Merchant');

  const snakebitten = computeOwnerIdentity(makeProfile('Snake', {
    counts: { championships: 0, regularTitles: 0, top2Seeds: 1, weeklyCrowns: 3, saundersTitles: 2 },
    rates: { regularWinPct: 0.47, averageFinish: 6.8, finishStdDev: 2.6, playoffWinPct: 0.25 },
    seasonLuckRows: [{ season: 2023, luck: -1.4, games: 5 }],
    totals: { regular: { wins: 11, losses: 13, ties: 0 }, playoffs: { wins: 1, losses: 2, ties: 0 } },
  }), computeLeagueRanks([
    makeProfile('Snake', {
      counts: { championships: 0, regularTitles: 0, top2Seeds: 1, weeklyCrowns: 3, saundersTitles: 2 },
      rates: { regularWinPct: 0.47, averageFinish: 6.8, finishStdDev: 2.6, playoffWinPct: 0.25 },
      seasonLuckRows: [{ season: 2023, luck: -1.4, games: 5 }],
      totals: { regular: { wins: 11, losses: 13, ties: 0 }, playoffs: { wins: 1, losses: 2, ties: 0 } },
    }),
    makeProfile('Plain', {
      counts: { championships: 1, regularTitles: 1, weeklyCrowns: 5, top2Seeds: 3, saundersTitles: 0 },
      rates: { regularWinPct: 0.63, averageFinish: 3.1, finishStdDev: 2.0, playoffWinPct: 0.6 },
      totals: { regular: { wins: 20, losses: 12, ties: 0 }, playoffs: { wins: 4, losses: 2, ties: 0 } },
    }),
  ]));
  assert.equal(snakebitten.label, 'Snakebitten');

  const boomBust = computeOwnerIdentity(makeProfile('Boom', {
    counts: { championships: 0, regularTitles: 0, top2Seeds: 0, weeklyCrowns: 1, saundersTitles: 0 },
    rates: { regularWinPct: 0.5, averageFinish: 5.0, finishStdDev: 6.2, playoffWinPct: 0.1 },
    totals: { regular: { wins: 14, losses: 14, ties: 0 }, playoffs: { wins: 0, losses: 1, ties: 0 } },
  }), computeLeagueRanks([
    makeProfile('Boom', {
      counts: { championships: 0, regularTitles: 0, top2Seeds: 0, weeklyCrowns: 1, saundersTitles: 0 },
      rates: { regularWinPct: 0.5, averageFinish: 5.0, finishStdDev: 6.2, playoffWinPct: 0.1 },
      totals: { regular: { wins: 14, losses: 14, ties: 0 }, playoffs: { wins: 0, losses: 1, ties: 0 } },
    }),
    makeProfile('Stable', {
      counts: { championships: 1, regularTitles: 1, weeklyCrowns: 4, top2Seeds: 2, saundersTitles: 0 },
      rates: { regularWinPct: 0.62, averageFinish: 3.0, finishStdDev: 1.2, playoffWinPct: 0.5 },
      totals: { regular: { wins: 19, losses: 11, ties: 0 }, playoffs: { wins: 2, losses: 2, ties: 0 } },
    }),
  ]));
  assert.equal(boomBust.label, 'Boom/Bust');
});

test('buildTrophyCaseViewModel renders the visual profile sections', () => {
  const seasonSummaries = [
    {
      season: 2025,
      owner: 'Joe',
      wins: 11,
      losses: 3,
      ties: 0,
      finish: 1,
      points_for: 1500.0,
      points_against: 1300.0,
      playoff_wins: 1,
      playoff_losses: 1,
      saunders_wins: 0,
      saunders_losses: 0,
      champion: true,
      saunders: false,
      bye: true,
      wild_card: false,
      saunders_bye: false,
      bagels_earned: 2,
    },
    {
      season: 2024,
      owner: 'Joe',
      wins: 10,
      losses: 4,
      ties: 0,
      finish: 2,
      points_for: 1400.0,
      points_against: 1200.0,
      playoff_wins: 2,
      playoff_losses: 0,
      saunders_wins: 0,
      saunders_losses: 0,
      champion: false,
      saunders: false,
      bye: true,
      wild_card: false,
      saunders_bye: false,
      bagels_earned: 1,
    },
    {
      season: 2023,
      owner: 'Joe',
      wins: 8,
      losses: 6,
      ties: 0,
      finish: 5,
      points_for: 1300.0,
      points_against: 1250.0,
      playoff_wins: 0,
      playoff_losses: 0,
      saunders_wins: 1,
      saunders_losses: 1,
      champion: false,
      saunders: true,
      bye: false,
      wild_card: false,
      saunders_bye: true,
      bagels_earned: 0,
    },
    {
      season: 2025,
      owner: 'Joel',
      wins: 11,
      losses: 3,
      ties: 0,
      finish: 1,
      points_for: 1490.0,
      points_against: 1310.0,
      playoff_wins: 2,
      playoff_losses: 0,
      saunders_wins: 0,
      saunders_losses: 0,
      champion: false,
      saunders: false,
      bye: true,
      wild_card: false,
      saunders_bye: false,
      bagels_earned: 0,
    },
    {
      season: 2024,
      owner: 'Joel',
      wins: 10,
      losses: 4,
      ties: 0,
      finish: 2,
      points_for: 1420.0,
      points_against: 1180.0,
      playoff_wins: 1,
      playoff_losses: 1,
      saunders_wins: 0,
      saunders_losses: 0,
      champion: true,
      saunders: false,
      bye: true,
      wild_card: false,
      saunders_bye: false,
      bagels_earned: 0,
    },
  ];

  const leagueGames = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Joel', scoreA: 160, scoreB: 100, type: 'Regular', round: '', _weekByTeam: { Joe: 1, Joel: 1 } },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Shap', scoreA: 65, scoreB: 70, type: 'Regular', round: '', _weekByTeam: { Joe: 2, Shap: 2 } },
    { season: 2024, date: '2024-09-07', teamA: 'Joe', teamB: 'Joel', scoreA: 130, scoreB: 120, type: 'Regular', round: '', _weekByTeam: { Joe: 1, Joel: 1 } },
    { season: 2024, date: '2024-11-30', teamA: 'Joe', teamB: 'Joel', scoreA: 110, scoreB: 90, type: 'Playoff', round: 'Final', _weekByTeam: { Joe: 15, Joel: 15 } },
    { season: 2023, date: '2023-10-01', teamA: 'Joe', teamB: 'Shap', scoreA: 82, scoreB: 96, type: 'Saunders', round: 'Saunders Final', _weekByTeam: { Joe: 10, Shap: 10 } },
  ];

  const vm = buildTrophyCaseViewModel('Joe', {
    seasonSummaries,
    leagueGames,
    champNoteFn: () => null,
    saundersNoteFn: () => null,
  });

  assert.equal(vm.hero.title, 'Joe');
  assert.equal(vm.hero.identityLabel, vm.identity.label);
  assert.match(trophyHeroHtml(vm), /Joe/);
  assert.match(trophyHeroHtml(vm), /Contender|Dynasty|Merchant|Snakebitten|Boom\/Bust|Playoff Riser/);
  assert.match(trophyHeroHtml(vm), /Darlings/);
  assert.match(trophyHardwareShelfHtml(vm), /Darlings/);
  assert.match(trophyHardwareShelfHtml(vm), /Byes/);
  assert.match(trophyHardwareShelfHtml(vm), /#1|#2|#3/);
  assert.doesNotMatch(trophyRankStripHtml(vm), /Actual:/);
  assert.equal(vm.careerShape.rows.length, 3);
  assert.match(trophyCareerShapeHtml(vm), /Season finish trend/);
  assert.match(trophyCareerShapeHtml(vm), /Playoff cutoff is 6th/);
  assert.match(trophyCareerShapeHtml(vm), /Champion/);
  assert.match(trophyCareerShapeHtml(vm), /Saunders/);
  assert.match(trophyCareerShapeHtml(vm), /trophyCareerPlot/);
  assert.equal((trophyCareerShapeHtml(vm).match(/<li>/g) || []).length, 3);
  assert.match(trophyAchievementListHtml(vm), /Best regular season|Highest weekly score|Best win margin/);
  assert.match(trophyScarListHtml(vm), /Most unlucky season|Worst weekly score|Biggest loss|Record 11-3-0|Luck \+0\.00/);
  assert.equal(vm.seasonLedger.length, 3);
  const ledgerHtml = trophySeasonLedgerHtml(vm);
  assert.match(ledgerHtml, /2025/);
  assert.match(ledgerHtml, /Champion/);
  assert.match(ledgerHtml, /Regular-season title/);
  assert.match(ledgerHtml, /Postseason 1-1/);
  assert.match(ledgerHtml, /Bye/);
  assert.match(ledgerHtml, /Bagels 2/);
  assert.match(ledgerHtml, /class="table-note-chip"/);
  assert.doesNotMatch(ledgerHtml, /class="trophy-chip"/);
});

test('trophy renderers escape owner names and support empty states', () => {
  const vm = buildTrophyCaseViewModel('Joe <Owner>', {
    seasonSummaries: [],
    leagueGames: [],
  });

  assert.match(trophyHeroHtml(vm), /Joe &lt;Owner&gt;/);
  assert.equal((trophyHardwareShelfHtml(vm).match(/trophy-hardware-card/g) || []).length, 8);
  assert.match(trophyHardwareShelfHtml(vm), /0/);
  assert.match(trophyAchievementListHtml(vm), /No highlights yet/i);
  assert.match(trophyScarListHtml(vm), /No low points yet/i);
  assert.match(trophySeasonLedgerHtml(vm), /No seasons recorded/i);
  assert.match(trophyRankStripHtml(vm), /#|—/);

  const escapedLedger = trophySeasonLedgerHtml({
    seasonLedger: [
      {
      season: 2025,
      record: '10-4',
      finish: '1',
      pf: '1500.0',
      pa: '1300.0',
      diff: '+200.0',
      notes: ['Champion & Friends'],
      },
    ],
  });
  assert.match(escapedLedger, /Champion &amp; Friends/);
});
