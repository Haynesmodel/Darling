import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildOwnerCareerProfile,
  buildTrophyCaseViewModel,
  computeAchievementAndScarLists,
  computeCareerShape,
  computeHardwareShelf,
  computeLeagueRanks,
  computeOwnerIdentity,
  computeOwnerMoments,
  computeSeasonLedger,
  computeSignatureSeasons,
  hardwareArt,
} from '../src/features/trophy/trophy-model.ts';

const season = (overrides = {}) => ({
  season: 2024,
  owner: 'Joe',
  wins: 8,
  losses: 4,
  ties: 0,
  finish: 3,
  points_for: 1200,
  points_against: 1100,
  playoff_wins: 1,
  playoff_losses: 1,
  saunders_wins: 0,
  saunders_losses: 0,
  bagels_earned: 0,
  bye: false,
  champion: false,
  saunders: false,
  saunders_bye: false,
  wild_card: true,
  ...overrides,
});

const game = (overrides = {}) => ({
  season: 2024,
  date: '2024-10-01',
  teamA: 'Joe',
  teamB: 'Shap',
  scoreA: 100,
  scoreB: 90,
  week: 1,
  round: null,
  type: 'Regular',
  ...overrides,
});

test('Trophy career model preserves chart tiers and cutoffs', () => {
  const view = computeCareerShape('Joe', [
    season({ season: 2021, finish: 1, champion: true }),
    season({ season: 2022, finish: 4 }),
    season({ season: 2023, finish: 9 }),
    season({ season: 2014, finish: 4 }),
  ]);
  assert.deepEqual(view.rows.map(row => row.tier), ['upper', 'champion', 'upper', 'pain']);
  assert.equal(view.rows.find(row => row.season === 2014)?.playoffCutoff, 4);
});

test('Trophy view model is pure and typed at the feature boundary', () => {
  const view = buildTrophyCaseViewModel('Joe', { seasonSummaries: [season()] });
  assert.equal(view.owner, 'Joe');
  assert.equal(view.careerShape.rows[0].season, 2024);
  assert.equal(view.seasonLedger[0].record, '8-4-0');
});

test('Trophy model exercises every canonical owner through typed profile, rank, moment, and list boundaries', () => {
  const seasonSummaries = JSON.parse(readFileSync(new URL('../assets/SeasonSummary.json', import.meta.url), 'utf8'));
  const leagueGames = JSON.parse(readFileSync(new URL('../assets/H2H.json', import.meta.url), 'utf8'));
  const derived = JSON.parse(readFileSync(new URL('../assets/DerivedStats.json', import.meta.url), 'utf8'));
  const options = {
    seasonSummaries,
    leagueGames,
    weeklyAwards: derived.weekly_awards,
    seasonAggregates: derived.season_aggregates,
    ownerCareers: derived.owner_careers,
  };
  const owners = [...new Set(seasonSummaries.map(row => row.owner))];
  const profiles = owners.map(owner => buildOwnerCareerProfile(owner, seasonSummaries, leagueGames, {
    ...options,
    weeklyAwards: derived.weekly_awards,
  }));
  const ranks = computeLeagueRanks(profiles);

  for (const profile of profiles) {
    const view = buildTrophyCaseViewModel(profile.owner, options);
    assert.equal(view.owner, profile.owner);
    assert.equal(view.careerShape.rows.length, profile.seasonRows.length);
    assert.equal(computeHardwareShelf(profile, ranks).length, 8);
    assert.ok(computeOwnerIdentity(profile, ranks).label.length > 0);
    assert.ok(computeSignatureSeasons(profile).length > 0);
    assert.ok(computeOwnerMoments(profile.owner, leagueGames).length > 0);
    assert.ok(computeAchievementAndScarLists(profile).achievements.length > 0);
    assert.equal(computeSeasonLedger(profile.owner, profile.seasonRows).length, profile.seasonRows.length);
  }
});

test('Trophy highlights and low points select ordered, owner-relative, distinct facts', () => {
  const seasonSummaries = [
    season({ season: 2020, wins: 5, losses: 7, finish: 6, points_for: 1000, points_against: 1100 }),
    season({ season: 2021, wins: 9, losses: 3, finish: 1, points_for: 1300, points_against: 1200, champion: true, saunders: true, saunders_bye: true }),
    season({ season: 2022, wins: 10, losses: 2, finish: 2, points_for: 1250, points_against: 750, bye: true }),
    season({ season: 2023, wins: 3, losses: 9, finish: 8, points_for: 900, points_against: 1100 }),
    season({ season: 2024, wins: 8, losses: 4, finish: 3, points_for: 1500, points_against: 1000 }),
    season({ season: 2025, wins: 7, losses: 4, ties: 1, finish: 4, points_for: 1500, points_against: 1300 }),
  ];
  seasonSummaries.push(...seasonSummaries.map(row => ({
    ...row,
    owner: 'Shap',
    wins: row.season === 2021 ? row.wins - 1 : row.wins + 1,
  })));
  const duplicateWin = game({ season: 2023, date: '2023-10-08', scoreA: 180, scoreB: 90, week: 2 });
  const options = {
    seasonSummaries,
    leagueGames: [
      game({ season: 2020, date: '2020-10-01', scoreA: 80, scoreB: 90 }),
      game({ season: 2021, date: '2021-10-02', scoreA: 40, scoreB: 100 }),
      game({ season: 2022, date: '2022-10-02', scoreA: 120, scoreB: 110 }),
      game({ season: 2023, date: '2023-10-07', scoreA: 50, scoreB: 160 }),
      duplicateWin,
      { ...duplicateWin },
      game({ season: 2024, date: '2024-10-01', scoreA: 200, scoreB: 100 }),
      game({ season: 2025, date: '2025-10-01', scoreA: 110, scoreB: 110 }),
    ],
    weeklyAwards: { top: [], low: [], high150: [] },
    seasonAggregates: [
      { team: 'Joe', season: 2020, expWins: 7, luck: -2 },
      { team: 'Joe', season: 2021, expWins: 8, luck: 1 },
      { team: 'Joe', season: 2022, expWins: 8, luck: 2 },
      { team: 'Joe', season: 2023, expWins: 4, luck: -1 },
      { team: 'Joe', season: 2024, expWins: 7, luck: 1 },
      { team: 'Joe', season: 2025, expWins: 6, luck: 1 },
    ],
  };
  const profile = buildOwnerCareerProfile('Joe', seasonSummaries, options.leagueGames, options);
  const lists = computeAchievementAndScarLists(profile);

  assert.deepEqual(lists.achievements.map(item => item.label), [
    'Best regular season',
    'Highest weekly score',
    'Best point differential season',
    'Luckiest season',
    'Championship',
  ]);
  assert.deepEqual(lists.achievements.map(item => item.value), ['2025', '200.0', '2024', '2022', '2021']);
  assert.deepEqual(lists.scars.map(item => item.label), [
    'Most unlucky season',
    'Worst weekly score',
    'Biggest loss',
    'Worst finish',
    'Saunders title',
  ]);
  assert.deepEqual(lists.scars.map(item => item.value), ['2020', '40.0', '-110.0', '2023', '2021']);
  assert.equal(new Set(lists.achievements.map(item => item.key)).size, lists.achievements.length);
  assert.equal(new Set(lists.scars.map(item => item.key)).size, lists.scars.length);
  assert.equal(lists.bestAchievement, lists.achievements[0]);
  assert.equal(lists.worstScar, lists.scars[0]);
  assert.equal(lists.achievements.length, 5);
  assert.equal(lists.scars.length, 5);
  assert.deepEqual(computeAchievementAndScarLists(profile), lists);
});

test('Trophy list selection keeps sparse and empty owners explicit without filler', () => {
  const sparseProfile = buildOwnerCareerProfile('Joe', [season({ season: 2025 })], [game({ season: 2025, scoreA: 101, scoreB: 90 })], {
    weeklyAwards: { top: [], low: [], high150: [] },
  });
  const sparse = computeAchievementAndScarLists(sparseProfile);
  assert.deepEqual(sparse.achievements.map(item => item.label), ['Best regular season', 'Highest weekly score']);
  assert.deepEqual(sparse.scars.map(item => item.label), ['Most unlucky season', 'Worst weekly score']);
  assert.ok(sparse.achievements.every(item => item.detail.length > 0));
  assert.ok(sparse.scars.every(item => item.detail.length > 0));

  const empty = computeAchievementAndScarLists(buildOwnerCareerProfile('Nobody'));
  assert.deepEqual(empty.achievements, []);
  assert.deepEqual(empty.scars, []);
  assert.equal(empty.bestAchievement, null);
  assert.equal(empty.worstScar, null);
});

test('Trophy low-score moments exclude the outlier while retaining canonical game history', () => {
  const seasonSummaries = JSON.parse(readFileSync(new URL('../assets/SeasonSummary.json', import.meta.url), 'utf8'));
  const leagueGames = JSON.parse(readFileSync(new URL('../assets/H2H.json', import.meta.url), 'utf8'));
  const derived = JSON.parse(readFileSync(new URL('../assets/DerivedStats.json', import.meta.url), 'utf8'));
  const target = leagueGames.find(game => game.season === 2022 && game.date === '2022-12-24' && game.teamA === 'Joel' && game.teamB === 'Plot');
  for (const owner of ['Joel', 'Plot']) {
    const profile = buildOwnerCareerProfile(owner, seasonSummaries, leagueGames, {
      weeklyAwards: derived.weekly_awards,
      seasonAggregates: derived.season_aggregates,
      ownerCareers: derived.owner_careers,
    });
    assert.ok(profile.ownerGames.some(game => game === target));
    assert.notEqual(profile.worstGame?.game, target);
    assert.notEqual(computeOwnerMoments(owner, leagueGames).find(moment => moment.label === 'Lowest score')?.date, target.date);
  }
});

test('Trophy hardware shelf preserves the semantic tone mapping for each card family', () => {
  const profile = buildOwnerCareerProfile('Joe', [
    season({ champion: true, bye: true, saunders: true, bagels_earned: 1 }),
  ]);
  const ranks = computeLeagueRanks([profile]);
  const shelf = computeHardwareShelf(profile, ranks);

  assert.deepEqual(
    shelf.map(({ label, tone }) => [label, tone]),
    [
      ['Darlings', 'gold'],
      ['Regular-season titles', 'gold'],
      ['Byes', 'neutral'],
      ['Wild cards', 'neutral'],
      ['Playoff wins', 'neutral'],
      ['Saunders titles', 'scar'],
      ['Saunders byes', 'scar'],
      ['Bagels', 'scar'],
    ],
  );
});

test('Trophy model narrows malformed selector data and covers empty and outcome edge cases', () => {
  const rows = [
    season({ season: 2025, finish: 1, champion: true, bye: true, bagels_earned: 2, playoff_wins: 1 }),
    season({ season: 2024, finish: 2, bye: true, champion: false }),
    season({ season: 2023, finish: 5, wild_card: false }),
    season({ season: 2022, finish: 7, saunders: true, saunders_wins: 1 }),
  ];
  const shape = computeCareerShape('Joe', rows);
  assert.deepEqual(shape.rows.map(row => row.tier), ['saunders', 'mid', 'contender', 'champion']);

  const view = buildTrophyCaseViewModel('Joe', {
    seasonSummaries: rows,
    weeklyAwards: { top: [{ team: 'Joe', count: 'bad' }], low: [], high150: [] },
    seasonAggregates: [{ team: 'Joe', season: 'bad', expWins: 1, luck: 1 }, null],
    ownerCareers: [{ owner: 'Joe', wins: 'bad' }],
  });
  assert.equal(view.owner, 'Joe');
  assert.match(view.seasonLedger[0].notes.join(' '), /Champion|Postseason|Bagels/);

  const empty = buildTrophyCaseViewModel('Nobody', {
    weeklyAwards: 'invalid',
    seasonAggregates: [null],
    ownerCareers: [null],
  });
  assert.equal(empty.careerShape.summary, 'No seasons recorded');
  assert.deepEqual(empty.achievements, []);
  assert.deepEqual(empty.scars, []);
  assert.equal(computeOwnerMoments('Nobody').length, 0);
  assert.equal(hardwareArt('trophy'), 'assets/trophy/trophy.svg');
  assert.equal(hardwareArt('unknown'), '');
});
