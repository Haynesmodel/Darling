import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveWeeksInPlace } from '../js/core-helpers.js';
import {
  attachCurrentSeasonOdds,
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
  renderCurrentCommandCenter,
  renderCurrentStandings,
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
      source: 'sleeper',
      update_context: {
        mode: 'manual',
        cutoff_date: '2026-06-17',
        contains_live_scores: false,
        contains_projected_scores: false,
      },
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
  assert.match(playoff, /Saunders danger line/);
  assert.match(playoff, /bottom 2 seeds/);

  const needs = currentWeekNeedsHtml(view);
  assert.match(needs, /This Week Needs/);
  assert.match(needs, /Joe/);
  assert.match(needs, /Goal:/);

  const movement = currentLiveMovementHtml(view);
  assert.match(movement, /Live Movement/);

  const projection = currentProjectedStandingsHtml(view);
  assert.match(projection, /Projected Standings/);
  assert.match(projection, /If scores hold/);
  assert.match(projection, /Generated Jun 17, 2026, 2:22 PM UTC/);
  assert.match(projection, /Live scores no/);
  assert.match(projection, /Projected scores no/);
  assert.match(projection, /currentProjectedTableRoot/);

  const matchups = currentMatchupsHtml(view);
  assert.match(matchups, /Week 1 Matchups/);
  assert.match(matchups, /Joe vs Shap/);
  assert.match(matchups, /Head to Head/);
  assert.match(matchups, /Swing/);
  assert.match(matchups, /All-Time H2H/);
  assert.match(matchups, /This Season H2H/);

  const standings = currentStandingsHtml(view);
  assert.match(standings, /Standings/);
  assert.match(standings, /currentStandingsTableRoot/);
  assert.ok(view.standings.some(row => row.owner === 'Shap'));

  const snapshots = currentTeamSnapshotsHtml(view);
  assert.match(snapshots, /Team Snapshots/);
  assert.match(snapshots, /Scoring Rank/);
  assert.match(snapshots, /Best Win/);
});

test('current-season view standings use configured tiebreakers and projection mode', () => {
  const customTiebreakerSeason = {
    season: 2026,
    current_week: 1,
    playoff_rules: {
      regular_season_max_week: 1,
      playoff_slots: 2,
      bye_slots: 1,
      standings_tiebreakers: ['win_pct', 'points_against', 'owner'],
      saunders_slots: 2,
    },
    games: [
      { season: 2026, date: '2026-09-06', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, week: 1, type: 'Regular', round: '', status: 'final' },
      { season: 2026, date: '2026-09-06', teamA: 'Nuss', teamB: 'Joel', scoreA: 80, scoreB: 70, week: 1, type: 'Regular', round: '', status: 'final' },
    ],
  };
  const view = buildCurrentSeasonViewModel({
    currentSeason: customTiebreakerSeason,
    season: 2026,
    week: 1,
    projectionMode: 'current',
  });

  assert.equal(view.standings[0].owner, 'Nuss');
  assert.equal(view.commandCenter.selectedProjectionMode, 'current');
  assert.match(currentProjectedStandingsHtml(view), /Completed games only/);
  assert.match(currentLiveMovementHtml(view), /Completed games only/);
  assert.doesNotMatch(currentLiveMovementHtml(view), /If scores hold/);
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

test('current-season renderers hide containers when view mode filters sections', () => {
  const elements = new Map([
    ['currentPlayoffPicture', { innerHTML: '', hidden: false }],
    ['currentWeekNeeds', { innerHTML: '', hidden: false }],
    ['currentLiveMovement', { innerHTML: '', hidden: false }],
    ['currentProjectedStandings', { innerHTML: '', hidden: false }],
    ['currentStandings', { innerHTML: '', hidden: false }],
  ]);
  const doc = { getElementById(id) { return elements.get(id) || null; } };
  const ownersView = buildCurrentSeasonViewModel({ leagueGames: games, season: 2025, week: 1, selectedView: 'owners' });

  renderCurrentCommandCenter(ownersView, { doc });
  renderCurrentStandings(ownersView, { doc });
  assert.equal(elements.get('currentPlayoffPicture').hidden, true);
  assert.equal(elements.get('currentWeekNeeds').hidden, false);
  assert.equal(elements.get('currentLiveMovement').hidden, true);
  assert.equal(elements.get('currentProjectedStandings').hidden, true);
  assert.equal(elements.get('currentStandings').hidden, true);

  const commandView = buildCurrentSeasonViewModel({ leagueGames: games, season: 2025, week: 1, selectedView: 'command' });
  renderCurrentCommandCenter(commandView, { doc });
  renderCurrentStandings(commandView, { doc });
  assert.equal(elements.get('currentPlayoffPicture').hidden, false);
  assert.equal(elements.get('currentProjectedStandings').hidden, false);
  assert.equal(elements.get('currentStandings').hidden, false);
});

test('current-season probability estimates attach without replacing deterministic statuses', () => {
  const view = buildCurrentSeasonViewModel({ leagueGames: games, season: 2025, week: 1 });
  const statusBefore = view.commandCenter.playoffPicture[0].status;
  attachCurrentSeasonOdds(view, {
    status: 'ready',
    modelLabel: 'Deterministic team-score Monte Carlo',
    modelVersion: 'test-v1',
    simulations: 10000,
    liveMode: 'Pregame',
    methodology: 'Test method',
    rows: view.commandCenter.playoffPicture.map((row, index) => ({
      owner: row.owner,
      playoffOdds: index < 2 ? 1 : 0,
      byeOdds: index === 0 ? 1 : 0,
      saundersOdds: index >= 2 ? 1 : 0,
      seedProbabilities: { [`${index + 1}`]: 1 },
    })),
    movement: [],
  });
  assert.equal(view.commandCenter.playoffPicture[0].status, statusBefore);
  assert.match(currentPlayoffPictureHtml(view), /Playoffs 100%/);
  assert.match(currentPlayoffPictureHtml(view), /Seed odds/);
});
