import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTrophyCaseViewModel,
  trophyHeroHtml,
  trophyHardwareHtml,
  trophyRegularSeasonHtml,
  trophyPostseasonHtml,
  trophyWeeklyAwardsHtml,
  trophySeasonTableHtml,
} from '../js/trophy-renderers.js';

test('trophy renderer builds the resume, hardware, and signature season output', () => {
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
      champion: false,
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
      champion: true,
      saunders: false,
      bye: true,
      wild_card: false,
      saunders_bye: false,
      bagels_earned: null,
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
      bagels_earned: 1,
    },
    {
      season: 2023,
      owner: 'Shap',
      wins: 9,
      losses: 5,
      ties: 0,
      finish: 2,
      points_for: 1310.0,
      points_against: 1270.0,
      playoff_wins: 0,
      playoff_losses: 0,
      saunders_wins: 0,
      saunders_losses: 0,
      champion: false,
      saunders: false,
      bye: false,
      wild_card: false,
      saunders_bye: false,
      bagels_earned: null,
    },
    {
      season: 2025,
      owner: 'Shap',
      wins: 9,
      losses: 5,
      ties: 0,
      finish: 3,
      points_for: 1450.0,
      points_against: 1370.0,
      playoff_wins: 0,
      playoff_losses: 1,
      saunders_wins: 0,
      saunders_losses: 0,
      champion: false,
      saunders: false,
      bye: false,
      wild_card: true,
      saunders_bye: false,
      bagels_earned: null,
    },
    {
      season: 2024,
      owner: 'Shap',
      wins: 11,
      losses: 3,
      ties: 0,
      finish: 1,
      points_for: 1420.0,
      points_against: 1180.0,
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
    },
  ];

  const seasonAggregates = [
    { team: 'Joe', season: 2025, w: 11, l: 3, t: 0, n: 14, pf: 1500.0, pa: 1300.0, pct: 11 / 14, ppg: 107.1, oppg: 92.9, luck: 3.0, diff: 200.0 },
    { team: 'Joe', season: 2024, w: 10, l: 4, t: 0, n: 14, pf: 1400.0, pa: 1200.0, pct: 10 / 14, ppg: 100.0, oppg: 85.7, luck: 1.0, diff: 200.0 },
    { team: 'Joe', season: 2023, w: 8, l: 6, t: 0, n: 14, pf: 1300.0, pa: 1250.0, pct: 8 / 14, ppg: 92.9, oppg: 89.3, luck: -2.0, diff: 50.0 },
  ];

  const leagueGames = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 160, scoreB: 100, type: 'Regular', round: '', _weekByTeam: { Joe: 1, Shap: 1 } },
    { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Zook', scoreA: 65, scoreB: 70, type: 'Regular', round: '', _weekByTeam: { Joe: 2, Zook: 2 } },
    { season: 2025, date: '2025-09-21', teamA: 'Joe', teamB: 'Nuss', scoreA: 120, scoreB: 80, type: 'Regular', round: '', _weekByTeam: { Joe: 3, Nuss: 3 } },
    { season: 2024, date: '2024-12-14', teamA: 'Joe', teamB: 'Shap', scoreA: 110, scoreB: 90, type: 'Playoff', round: 'Final', _weekByTeam: { Joe: 15, Shap: 15 } },
    { season: 2023, date: '2023-11-12', teamA: 'Joe', teamB: 'Shap', scoreA: 82, scoreB: 96, type: 'Saunders', round: 'Saunders Final', _weekByTeam: { Joe: 10, Shap: 10 } },
  ];

  const vm = buildTrophyCaseViewModel('Joe', {
    seasonSummaries,
    seasonAggregates,
    leagueGames,
    weeklyAwards: {
      top: [{ team: 'Joe', count: 3 }],
      low: [{ team: 'Joe', count: 1 }],
      high150: [{ team: 'Joe', count: 2 }],
    },
    sub70: [{ team: 'Joe', count: 1 }],
  });

  assert.equal(vm.hero.title, 'Joe Trophy Case');
  assert.match(vm.hero.lines[0], /1 Darlings \| 1 Regular-Season Titles \| 2 Top-2 Seeds/);
  assert.match(vm.hero.lines[1], /Career regular season: 29-13 \(69\.0%\)/);
  assert.match(vm.hero.lines[2], /Best finish: 1st \| Average finish: 2\.7/);
  assert.match(vm.hero.lines[3], /Best postseason: Champion \(2024\)/);

  assert.equal(vm.hardware[0].value, '1');
  assert.deepEqual(vm.hardware[0].chips, [2024]);
  assert.equal(vm.hardware[2].value, '1');
  assert.deepEqual(vm.hardware[2].chips, [2025]);
  assert.equal(vm.hardware[6].value, '3');
  assert.match(trophyHardwareHtml(vm), /2024/);
  assert.match(trophyHardwareHtml(vm), /2025/);

  assert.match(vm.regularSeason[0].value, /29-13/);
  assert.match(vm.regularSeason[1].value, /69\.0%/);
  assert.match(vm.regularSeason[2].sub, /Avg 1400\.0 per season/);
  assert.match(vm.regularSeason[5].value, /1st/);
  assert.match(vm.regularSeason[6].value, /1500\.0/);
  assert.match(vm.regularSeason[8].value, /-2\.00/);
  assert.match(trophyRegularSeasonHtml(vm), /Record/);
  assert.match(trophyRegularSeasonHtml(vm), /Most Unlucky Season/);

  assert.match(vm.postseason[0].value, /3-1/);
  assert.match(vm.postseason[1].value, /1/);
  assert.match(vm.postseason[2].value, /1/);
  assert.match(vm.postseason[3].value, /Champion/);
  assert.match(vm.postseason[4].value, /1-1/);
  assert.match(vm.postseason[5].value, /1/);
  assert.match(vm.postseason[6].value, /1/);
  assert.match(vm.postseason[7].value, /2/);
  assert.match(vm.postseason[8].value, /0/);
  assert.match(vm.postseason[9].value, /1/);
  assert.match(trophyPostseasonHtml(vm), /Saunders Scars/);

  assert.match(vm.weeklyAwards[0].value, /3/);
  assert.match(vm.weeklyAwards[4].value, /160\.00/);
  assert.match(vm.weeklyAwards[5].value, /65\.00/);
  assert.match(vm.weeklyAwards[6].value, /\+60\.00/);
  assert.match(vm.weeklyAwards[7].value, /-14\.00/);
  assert.match(trophyWeeklyAwardsHtml(vm), /Highest Single-Game Score/);

  assert.equal(vm.signatureSeasons[0].season, 2025);
  assert.match(vm.signatureSeasons[0].notes.join(' • '), /Regular-season title/);
  assert.match(vm.signatureSeasons[0].notes.join(' • '), /Top-2 seed/);
  assert.match(vm.signatureSeasons[0].notes.join(' • '), /Best scoring season/);
  assert.match(vm.signatureSeasons[0].notes.join(' • '), /Best differential season/);
  assert.match(vm.signatureSeasons[0].notes.join(' • '), /Bagels earned 2/);
  assert.equal(vm.signatureSeasons[1].season, 2024);
  assert.match(vm.signatureSeasons[1].notes.join(' • '), /Champion/);
  assert.match(vm.signatureSeasons[1].notes.join(' • '), /Top-2 seed/);
  assert.equal(vm.signatureSeasons[2].season, 2023);
  assert.match(vm.signatureSeasons[2].notes.join(' • '), /Saunders/);
  assert.match(vm.signatureSeasons[2].notes.join(' • '), /Most unlucky season/);

  assert.match(trophySeasonTableHtml(vm), /Champion/);
  assert.match(trophySeasonTableHtml(vm), /Bagels earned 2/);
  assert.match(trophyHeroHtml(vm), /Joe Trophy Case/);
});

test('trophy renderer escapes owner names and renders empty states', () => {
  const vm = buildTrophyCaseViewModel('Joe <Owner>', {
    seasonSummaries: [],
    seasonAggregates: [],
    leagueGames: [],
    weeklyAwards: { top: [], low: [], high150: [] },
    sub70: [],
  });

  assert.match(trophyHeroHtml(vm), /Joe &lt;Owner&gt; Trophy Case/);
  assert.match(trophySeasonTableHtml(vm), /No seasons recorded for this owner/);
  assert.match(trophyHardwareHtml(vm), /No championships yet/);
  assert.match(trophyRegularSeasonHtml(vm), /No seasons recorded/);
  assert.match(trophyPostseasonHtml(vm), /No playoff games recorded/);
  assert.match(trophyWeeklyAwardsHtml(vm), /No weekly crowns/);

  const notesHtml = trophySeasonTableHtml({
    signatureSeasons: [
      {
        season: 2025,
        record: '10-4',
        finish: '1',
        outcome: 'Champion',
        pf: '1500.0',
        pa: '1300.0',
        diff: '+200.0',
        notes: ['Champion & Friends'],
      },
    ],
  });
  assert.match(notesHtml, /Champion &amp; Friends/);
});
