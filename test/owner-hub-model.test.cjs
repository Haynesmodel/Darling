const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let temp;
let ownerHub;

test.before(async () => {
  const coverageBundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(coverageBundles, { recursive: true });
  temp = fs.mkdtempSync(path.join(coverageBundles, 'owner-hub-model-'));
  const outfile = path.join(temp, 'owner-hub-model.mjs');
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/features/owner-hub/owner-hub-model.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
  });
  ownerHub = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function row(owner, season, finish, overrides = {}) {
  return {
    owner, season, finish, wins: 8, losses: 6, ties: 0,
    points_for: 1000, points_against: 950, playoff_wins: 1, playoff_losses: 1,
    saunders_wins: 0, saunders_losses: 0, bagels_earned: 0, draft_pick: 4,
    bye: false, champion: false, saunders: false, saunders_bye: false, wild_card: true,
    ...overrides,
  };
}

function game(season, week, teamA, teamB, scoreA, scoreB, overrides = {}) {
  return { season, week, date: `${season}-09-${String(week).padStart(2, '0')}`, teamA, teamB, scoreA, scoreB, type: 'Regular', round: '', ...overrides };
}

function data(overrides = {}) {
  return {
    leagueGames: [
      game(2023, 1, 'A&B + C/Δ', 'Beta', 100, 90),
      game(2024, 1, 'Beta', 'A&B + C/Δ', 110, 95),
      game(2025, 1, 'A&B + C/Δ', 'Gamma', 100, 100),
    ],
    seasonSummaries: [
      row('A&B + C/Δ', 2023, 6, { draft_pick: 9 }),
      row('A&B + C/Δ', 2024, 4, { champion: true, draft_pick: 2 }),
      row('A&B + C/Δ', 2025, 2, { ties: 1, draft_pick: 5 }),
      row('Beta', 2025, 1),
    ],
    rivalries: [{ slug: 'pair', name: 'Ampersand Cup', type: 'pair', members: ['A&B + C/Δ', 'Beta'] }],
    currentSeason: null,
    derivedStats: null,
    ...overrides,
  };
}

test('builds deterministic historical cards and encoded explicit deep links', () => {
  const model = ownerHub.buildOwnerHubModel(data(), {
    owner: 'A&B + C/Δ',
    pathname: '/Darling/',
  });
  assert.equal(model.identity.completedSeasons, 3);
  assert.equal(model.legacy.championships, 1);
  assert.equal(model.legacy.record, '24-18-1');
  assert.equal(model.recentForm.games.length, 3);
  assert.equal(model.dynastyDirection.direction, 'improving');
  assert.equal(model.draftIdentity.samples, 3);
  assert.equal(model.draftIdentity.averagePick, 16 / 3);
  assert.equal(model.rivalries.mostPlayed.opponent, 'Beta');
  assert.equal(model.actions[0].label, 'Moves');
  assert.match(model.actions[0].href, /txOwner=A%26B\+%2B\+C%2F%CE%94/);
  assert.ok(model.actions.every(action => !action.href.includes('undefined')));
});

test('scheduled current matchup has no false 0-0 result and aliases stay owner-specific', () => {
  const currentSeason = {
    season: 2026,
    current_week: 1,
    regular_season_max_week: 14,
    playoff_rules: { regular_season_max_week: 14 },
    teams: [
      { owner: 'A&B + C/Δ', display_name: 'Display <img>', sleeper_team_name: 'Team & Co' },
      { owner: 'Beta', display_name: 'Beta', sleeper_team_name: 'Beta' },
    ],
    games: [game(2026, 1, 'A&B + C/Δ', 'Beta', null, null, { status: 'scheduled', matchup_id: 1 })],
  };
  const model = ownerHub.buildOwnerHubModel(data({ currentSeason }), {
    owner: 'A&B + C/Δ',
    pathname: '/Darling/',
  });
  assert.equal(model.identity.displayName, 'Display <img>');
  assert.equal(model.identity.teamName, 'Team & Co');
  assert.match(model.rightNow.detail, /score pending/i);
  assert.doesNotMatch(model.rightNow.detail, /0.*0/);
});

test('offseason data uses the latest completed season instead of a stale week card', () => {
  const currentSeason = {
    season: 2025,
    current_week: 17,
    regular_season_max_week: 14,
    playoff_rules: { regular_season_max_week: 14 },
    teams: [
      { owner: 'A&B + C/Δ', display_name: 'Display', sleeper_team_name: '' },
      { owner: 'Beta', display_name: 'Beta', sleeper_team_name: '' },
    ],
    games: [game(2025, 17, 'A&B + C/Δ', 'Beta', 101, 99, { status: 'final', matchup_id: 1, type: 'Playoff' })],
  };
  const model = ownerHub.buildOwnerHubModel(data({ currentSeason }), {
    owner: 'A&B + C/Δ',
    pathname: '/Darling/',
  });
  assert.equal(model.rightNow.heading, '2025 season');
  assert.match(model.rightNow.summary, /Finished No\. 2/);
});

test('current-only and history-only inputs degrade cards independently', () => {
  const currentSeason = {
    season: 2026,
    current_week: 1,
    regular_season_max_week: 14,
    playoff_rules: { regular_season_max_week: 14 },
    teams: [{ owner: 'Expansion', display_name: 'Expansion', sleeper_team_name: '' }, { owner: 'Beta', display_name: 'Beta', sleeper_team_name: '' }],
    games: [game(2026, 1, 'Expansion', 'Beta', null, null, { status: 'scheduled', matchup_id: 1 })],
  };
  const model = ownerHub.buildOwnerHubModel(data({
    leagueGames: [],
    seasonSummaries: [],
    rivalries: [],
    currentSeason,
  }), { owner: 'Expansion', pathname: '/' });
  assert.equal(model.legacy, null);
  assert.equal(model.availability.legacy, 'no-history');
  assert.ok(model.rightNow);
  assert.equal(model.draftIdentity, null);
  assert.equal(model.curses, null);
});

test('live and final current matchups expose score, standings, and opponent fallbacks', () => {
  const currentSeason = {
    season: 2026,
    current_week: 2,
    regular_season_max_week: 14,
    playoff_rules: { regular_season_max_week: 14 },
    teams: [
      { owner: 'A&B + C/Δ', display_name: 'A&B + C/Δ', sleeper_team_name: 'A&B + C/Δ' },
      { owner: 'Beta', display_name: 'Beta', sleeper_team_name: '' },
    ],
    games: [
      game(2026, 1, 'A&B + C/Δ', 'Beta', 120, 90, { status: 'final', matchup_id: 2 }),
      game(2026, 2, 'Beta', 'A&B + C/Δ', 80, 81, { status: 'live', matchup_id: 1 }),
    ],
  };
  const model = ownerHub.buildOwnerHubModel(data({ currentSeason }), {
    owner: 'A&B + C/Δ',
    pathname: '/',
  });
  assert.equal(model.identity.displayName, null);
  assert.equal(model.identity.teamName, null);
  assert.equal(model.rightNow.heading, 'Week 2');
  assert.match(model.rightNow.summary, /vs Beta/);
  assert.match(model.rightNow.detail, /81\.00–80\.00 · Live/);
  assert.match(model.rightNow.detail, /1-0-0 · seed/);
});

test('empty and sparse history reports independent availability and direction states', () => {
  const empty = ownerHub.buildOwnerHubModel(data({
    leagueGames: [],
    seasonSummaries: [],
    rivalries: [],
    currentSeason: null,
  }), { owner: 'Nobody', pathname: '/' });
  assert.equal(empty.rightNow, null);
  assert.equal(empty.recentForm, null);
  assert.equal(empty.rivalries, null);
  assert.equal(empty.dynastyDirection.direction, 'insufficient history');
  assert.deepEqual(empty.availability, {
    rightNow: 'no-current-season',
    recentForm: 'no-history',
    draftIdentity: 'no-draft-history',
    rivalries: 'no-rivalry',
    curses: 'no-curse',
    legacy: 'no-history',
  });
  assert.equal(empty.actions.length, 6);

  const sparse = ownerHub.buildOwnerHubModel(data({
    leagueGames: [],
    seasonSummaries: [
      row('Sparse', 2024, Number.NaN, {
        wins: 0, losses: 0, ties: 0, draft_pick: null,
        playoff_wins: 0, playoff_losses: 0,
      }),
    ],
    rivalries: [{ slug: 'sparse', name: 'Sparse Cup', type: 'pair', members: ['Sparse', 'Other'] }],
  }), { owner: 'Sparse', pathname: '/' });
  assert.equal(sparse.legacy.winPct, null);
  assert.equal(sparse.legacy.bestFinish, null);
  assert.equal(sparse.legacy.averageFinish, null);
  assert.equal(sparse.draftIdentity, null);
  assert.equal(sparse.rivalries.mostPlayed, null);
  assert.equal(sparse.actions.at(-1).label, 'Rivalry vs Other');
});

test('recent form streaks and dynasty direction cover mixed and declining histories', () => {
  const histories = [
    row('Trend', 2022, 2),
    row('Trend', 2023, 4),
    row('Trend', 2024, 3),
  ];
  const mixed = ownerHub.buildOwnerHubModel(data({
    leagueGames: [
      game(2024, 1, 'Trend', 'Beta', 100, 90),
      game(2024, 2, 'Trend', 'Gamma', 80, 90),
      game(2024, 3, 'Trend', 'Beta', 75, 75),
    ],
    seasonSummaries: histories,
    rivalries: [],
  }), { owner: 'Trend', pathname: '/' });
  assert.equal(mixed.dynastyDirection.direction, 'mixed');
  assert.equal(mixed.recentForm.streak, 'T1');

  const declining = ownerHub.buildOwnerHubModel(data({
    leagueGames: [game(2024, 1, 'Decline', 'Beta', 80, 90)],
    seasonSummaries: [
      row('Decline', 2022, 1),
      row('Decline', 2023, 2),
      row('Decline', 2024, 3),
    ],
    rivalries: [],
  }), { owner: 'Decline', pathname: '/' });
  assert.equal(declining.dynastyDirection.direction, 'declining');
  assert.equal(declining.recentForm.streak, 'L1');
});
