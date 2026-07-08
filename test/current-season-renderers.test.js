import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveWeeksInPlace } from '../js/core-helpers.js';
import {
  buildCurrentSeasonViewModel,
  currentLiveMovementHtml,
  currentMatchupsHtml,
  currentPlayoffPictureHtml,
  currentProjectedStandingsHtml,
  currentSeasonHeroHtml,
  currentStandingsHtml,
  currentTeamSnapshotsHtml,
  currentWeekNeedsHtml,
  formattedGeneratedAt,
  viewWeekLabel,
} from '../js/current-season-renderers.js';

const games = [
  { season: 2024, date: '2024-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 91, scoreB: 99, week: 1, type: 'Regular', round: '' },
  { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 110, scoreB: 100, week: 1, type: 'Regular', round: '' },
  { season: 2025, date: '2025-09-07', teamA: 'Nuss', teamB: 'Joel', scoreA: 90, scoreB: 95, week: 1, type: 'Regular', round: '' },
  { season: 2025, date: '2025-09-14', teamA: 'Joe', teamB: 'Nuss', scoreA: 80, scoreB: 85, week: 2, type: 'Regular', round: '' },
  { season: 2025, date: '2025-09-14', teamA: 'Shap', teamB: 'Joel', scoreA: 105, scoreB: 97, week: 2, type: 'Regular', round: '' },
];

deriveWeeksInPlace(games);

test('current-season renderer builds a dashboard view model', () => {
  const view = buildCurrentSeasonViewModel({ leagueGames: games, season: 2025, week: 1 });
  assert.equal(view.season, 2025);
  assert.equal(view.week, 1);
  assert.equal(view.matchups.length, 2);
  assert.equal(view.standings.length, 4);
  assert.equal(view.commandCenter.playoffPicture.length, 4);
  assert.equal(view.summary.highestScore.owner, 'Joe');
  assert.equal(view.summary.closestGame.margin, 5);
});

test('current-season renderer emits hero, matchup, standings, and snapshot html', () => {
  const view = buildCurrentSeasonViewModel({
    leagueGames: games,
    currentSeason: {
      season: 2025,
      generated_at: '2026-06-17T14:22:30Z',
      playoff_rules: {
        regular_season_max_week: 2,
        playoff_slots: 2,
        bye_slots: 1,
        standings_tiebreakers: ['win_pct', 'points_for', 'points_differential', 'owner'],
        saunders_slots: 2,
      },
      games,
    },
    season: 2025,
    week: 1,
  });

  const hero = currentSeasonHeroHtml(view);
  assert.match(hero, /Current Season/);
  assert.match(hero, /2025/);
  assert.match(hero, /High Score/);
  assert.match(hero, /Deterministic path model/);
  assert.match(hero, /Source: Sleeper/);
  assert.match(hero, /Last updated Jun 17, 2026, 2:22 PM UTC/);

  const playoff = currentPlayoffPictureHtml(view);
  assert.match(playoff, /Playoff Picture/);
  assert.match(playoff, /Playoff line/);

  const needs = currentWeekNeedsHtml(view);
  assert.match(needs, /This Week Needs/);
  assert.match(needs, /Joe/);

  const movement = currentLiveMovementHtml(view);
  assert.match(movement, /Live Movement/);

  const projection = currentProjectedStandingsHtml(view);
  assert.match(projection, /Projected Standings/);
  assert.match(projection, /If scores hold/);

  const matchups = currentMatchupsHtml(view);
  assert.match(matchups, /Week 1 Matchups/);
  assert.match(matchups, /Joe vs Shap/);
  assert.match(matchups, /Head to Head/);
  assert.match(matchups, /Swing/);
  assert.match(matchups, /All-Time H2H/);
  assert.match(matchups, /This Season H2H/);

  const standings = currentStandingsHtml(view);
  assert.match(standings, /Standings/);
  assert.match(standings, /Win %/);
  assert.match(standings, /Shap/);

  const snapshots = currentTeamSnapshotsHtml(view);
  assert.match(snapshots, /Team Snapshots/);
  assert.match(snapshots, /Scoring Rank/);
  assert.match(snapshots, /Best Win/);
});

test('current-season renderer escapes team names in matchup html', () => {
  const unsafeGames = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe <Owner>', teamB: 'Shap & Co', scoreA: 110, scoreB: 100, week: 1, type: 'Regular', round: '' },
  ];
  deriveWeeksInPlace(unsafeGames);
  const view = buildCurrentSeasonViewModel({ leagueGames: unsafeGames, season: 2025, week: 1 });
  const html = currentMatchupsHtml(view);
  assert.match(html, /Joe &lt;Owner&gt; vs Shap &amp; Co/);
  assert.doesNotMatch(html, /<Owner>/);
});

test('current-season renderer labels postseason weeks', () => {
  const postseasonGames = [
    { season: 2025, date: '2025-12-21', teamA: 'Joe', teamB: 'Shap', scoreA: 110, scoreB: 100, week: 16, type: 'Playoff', round: 'Semi Final', status: 'live' },
    { season: 2025, date: '2025-12-21', teamA: 'Nuss', teamB: 'Joel', scoreA: 90, scoreB: 95, week: 16, type: 'Saunders', round: 'Saunders Semi Final', status: 'live' },
  ];
  const view = buildCurrentSeasonViewModel({
    leagueGames: games,
    currentSeason: { season: 2025, generated_at: '2026-06-17T14:22:30Z', games: postseasonGames },
    season: 2025,
    week: 16,
  });

  assert.equal(viewWeekLabel(view), 'Postseason Week 16');
  const html = currentMatchupsHtml(view);
  assert.match(html, /Postseason Week 16 Matchups/);
  assert.match(html, /Playoff Week 16/);
  assert.match(html, /Saunders Week 16/);
  assert.match(html, /live/);
  assert.equal(formattedGeneratedAt('2026-06-17T14:22:30Z'), 'Jun 17, 2026, 2:22 PM UTC');
});
