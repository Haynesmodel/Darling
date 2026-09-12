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
  date: '2024-01-01',
  teamA: 'Joe',
  teamB: 'Opp',
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
  assert.deepEqual(view.hardwareShelf.map(item => item.state), ['empty', 'earned', 'empty', 'earned', 'earned', 'empty', 'empty', 'empty']);
  assert.equal(view.hardwareShelf.find(item => item.label === 'Darlings')?.context, 'Still chasing the first one');
  assert.equal(view.hardwareShelf.find(item => item.label === 'Wild cards')?.context, 'Back-door playoff appearances');
});

test('Trophy season ledger includes only the selected owner games for that season in chronological order', () => {
  const view = buildTrophyCaseViewModel('Joe', {
    seasonSummaries: [season({ season: 2025 }), season({ season: 2024 })],
    leagueGames: [
      { season: 2025, date: '2025-12-14', teamA: 'Shap', teamB: 'Joe', scoreA: 80, scoreB: 90, week: 15, type: 'Playoff', round: 'Final' },
      { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, week: 1, type: 'Regular', round: null },
      { season: 2025, date: '2025-09-14', teamA: 'Joel', teamB: 'Shap', scoreA: 110, scoreB: 90, week: 2, type: 'Regular', round: null },
      { season: 2024, date: '2024-09-07', teamA: 'Joe', teamB: 'Joel', scoreA: 70, scoreB: 70, week: 1, type: 'Saunders', round: 'Saunders Final' },
    ],
  });
  assert.deepEqual(view.seasonLedger[0].games, [
    { date: '2025-09-07', week: '1', opponent: 'Shap', scoreline: '100.0 - 90.0', result: 'W', type: 'Regular', round: '—' },
    { date: '2025-12-14', week: '15', opponent: 'Shap', scoreline: '90.0 - 80.0', result: 'W', type: 'Playoff', round: 'Final' },
  ]);
  assert.deepEqual(view.seasonLedger[1].games, [
    { date: '2024-09-07', week: '1', opponent: 'Joel', scoreline: '70.0 - 70.0', result: 'T', type: 'Saunders', round: 'Saunders Final' },
  ]);
});

test('Trophy season ledger records an explicit no-game state', () => {
  const view = buildTrophyCaseViewModel('Joe', { seasonSummaries: [season({ season: 2025 })], leagueGames: [] });
  assert.deepEqual(view.seasonLedger[0].games, []);
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
    for (const item of computeHardwareShelf(profile, ranks)) {
      assert.ok(item.context.length > 0);
      assert.equal(item.state, item.count > 0 ? 'earned' : 'empty');
    }
    assert.ok(computeOwnerIdentity(profile, ranks).label.length > 0);
    assert.ok(computeSignatureSeasons(profile).length > 0);
    assert.ok(computeOwnerMoments(profile.owner, leagueGames).length > 0);
    assert.ok(computeAchievementAndScarLists(profile).achievements.length > 0);
    assert.equal(computeSeasonLedger(profile.owner, profile.seasonRows).length, profile.seasonRows.length);
  }
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

test('Trophy highlights and low points select five ordered, owner-relative facts without duplicate sources', () => {
  const seasonSummaries = [
    season({ season: 2025, finish: 1, points_for: 2000, points_against: 1800 }),
    season({ season: 2024, finish: 2, points_for: 1500, points_against: 1000 }),
    season({ season: 2023, finish: 3, points_for: 1300, points_against: 1200 }),
    season({ season: 2022, finish: 4, points_for: 1000, points_against: 1200 }),
    season({ season: 2021, finish: 5, points_for: 1100, points_against: 1300 }),
    season({ season: 2020, finish: 6, points_for: 900, points_against: 1000 }),
    season({ season: 2019, finish: 12, points_for: 950, points_against: 1100, saunders: true }),
    season({ season: 2018, finish: 7, points_for: 1000, points_against: 1000 }),
  ];
  const leagueGames = [
    game({ season: 2025, date: '2025-01-01', scoreA: 180, scoreB: 190 }),
    game({ season: 2024, date: '2024-02-01', scoreA: 140, scoreB: 60 }),
    game({ season: 2023, date: '2023-03-01', scoreA: 130, scoreB: 50 }),
    game({ season: 2022, date: '2022-04-01', scoreA: 30, scoreB: 100 }),
    game({ season: 2021, date: '2021-04-01', scoreA: 110, scoreB: 120 }),
    game({ season: 2020, date: '2020-05-01', scoreA: 40, scoreB: 140 }),
    game({ season: 2019, date: '2019-06-01', scoreA: 90, scoreB: 100, type: 'Saunders' }),
  ];
  const profile = buildOwnerCareerProfile('Joe', seasonSummaries, leagueGames, {
    seasonAggregates: seasonSummaries.map((row, index) => ({
      team: 'Joe',
      season: row.season,
      expWins: index === 2 ? 1 : 4,
      luck: index === 2 ? 2 : index === 4 ? -2 : 0,
    })),
  });
  const lists = computeAchievementAndScarLists(profile);

  assert.equal(lists.achievements.length, 5);
  assert.equal(lists.scars.length, 5);
  assert.deepEqual(lists.achievements.map(item => item.label), [
    'Best regular season',
    'Highest weekly score',
    'Best win margin',
    'Best point differential season',
    'Luckiest season',
  ]);
  assert.deepEqual(lists.scars.map(item => item.label), [
    'Most unlucky season',
    'Worst weekly score',
    'Biggest loss',
    'Worst finish',
    'Negative-differential season',
  ]);
  const highlightSources = new Set(lists.achievements.map(item => item.sourceKey));
  assert.equal(lists.scars.some(item => highlightSources.has(item.sourceKey)), false);
  assert.equal(new Set(lists.achievements.map(item => item.key)).size, lists.achievements.length);
  assert.equal(new Set(lists.scars.map(item => item.key)).size, lists.scars.length);
  assert.equal(lists.bestAchievement?.key, lists.achievements[0].key);
  assert.equal(lists.worstScar?.key, lists.scars[0].key);
  assert.match(lists.achievements[1].detail, /2025-01-01 vs Opp/);
  assert.match(lists.scars[0].detail, /Expected/);
});

test('Trophy candidate ranking is deterministic for ties and sparse data returns only available facts', () => {
  const tiedRows = [
    season({ season: 2024, points_for: 1200, points_against: 1000 }),
    season({ season: 2023, points_for: 1200, points_against: 1000 }),
  ];
  const tiedProfile = buildOwnerCareerProfile('Joe', tiedRows, [
    game({ season: 2024, date: '2024-01-01', scoreA: 100, scoreB: 90 }),
    game({ season: 2024, date: '2024-01-02', scoreA: 100, scoreB: 90 }),
  ]);
  const tiedLists = computeAchievementAndScarLists(tiedProfile);
  assert.equal(tiedLists.achievements[0].value, '2024');

  const tiedGames = [
    game({ season: 2024, date: '2024-01-01', teamB: 'Zulu', scoreA: 150, scoreB: 90 }),
    game({ season: 2024, date: '2024-01-01', teamB: 'Alpha', scoreA: 150, scoreB: 90 }),
  ];
  const forward = computeAchievementAndScarLists(buildOwnerCareerProfile('Joe', tiedRows, tiedGames));
  const reversed = computeAchievementAndScarLists(buildOwnerCareerProfile('Joe', tiedRows, tiedGames.slice().reverse()));
  assert.equal(forward.achievements.find(item => item.label === 'Highest weekly score')?.detail, '2024-01-01 vs Alpha');
  assert.equal(reversed.achievements.find(item => item.label === 'Highest weekly score')?.detail, '2024-01-01 vs Alpha');

  const duplicate = game({ season: 2024, date: '2024-02-01', scoreA: 180, scoreB: 90 });
  const duplicateProfile = buildOwnerCareerProfile('Joe', [season({ season: 2024 })], [duplicate, duplicate]);
  const duplicateLists = computeAchievementAndScarLists(duplicateProfile);
  assert.equal(duplicateLists.achievements.filter(item => item.label === 'Highest weekly score').length, 1);

  const sparseProfile = buildOwnerCareerProfile('Joe', [season({ season: 2024, points_for: null, points_against: null, finish: null })], [
    game({ season: 2024, date: '2024-01-01', scoreA: 100, scoreB: 90 }),
  ]);
  const sparseLists = computeAchievementAndScarLists(sparseProfile);
  assert.ok(sparseLists.achievements.length <= 5);
  assert.ok(sparseLists.scars.length <= 5);
  assert.equal(new Set(sparseLists.achievements.map(item => item.key)).size, sparseLists.achievements.length);
  assert.equal(new Set(sparseLists.scars.map(item => item.key)).size, sparseLists.scars.length);
  assert.ok(sparseLists.achievements.every(item => item.detail.length > 0));
});

test('Trophy luckiest season chooses the newest season when luck is tied', () => {
  const tiedRows = [
    season({ season: 2024 }),
    season({ season: 2023 }),
    season({ season: 2022 }),
  ];
  const tiedGames = tiedRows.map(row => game({ season: row.season, date: `${row.season}-01-01` }));
  const profile = buildOwnerCareerProfile('Joe', tiedRows, tiedGames, {
    seasonAggregates: tiedRows.map(row => ({ team: 'Joe', season: row.season, expWins: 4, luck: 1.25 })),
  });

  assert.equal(profile.luckiestSeason?.season, 2024);
});

test('Trophy cross-list arbitration skips a colliding low point and keeps a lower-priority candidate', () => {
  const rows = [
    season({ season: 2024, points_for: 1500, points_against: 1000 }),
    season({ season: 2023, points_for: 1000, points_against: 1000 }),
  ];
  const profile = buildOwnerCareerProfile('Joe', rows, [
    game({ season: 2024, date: '2024-01-01', scoreA: 120, scoreB: 100 }),
    game({ season: 2023, date: '2023-01-01', scoreA: 80, scoreB: 100 }),
  ], {
    seasonAggregates: [
      { team: 'Joe', season: 2024, expWins: 5, luck: -2 },
      { team: 'Joe', season: 2023, expWins: 4, luck: 0 },
    ],
  });
  const lists = computeAchievementAndScarLists(profile);
  const highlightSources = new Set(lists.achievements.map(item => item.sourceKey));

  assert.ok(lists.achievements.some(item => item.sourceKey === 'season:2024'));
  assert.equal(lists.scars.some(item => item.label === 'Most unlucky season'), false);
  assert.ok(lists.scars.some(item => item.label === 'Worst weekly score'));
  assert.equal(lists.scars.some(item => highlightSources.has(item.sourceKey)), false);
});

test('Trophy cross-list arbitration does not reserve an undisplayed overflow highlight', () => {
  const rows = [
    season({ season: 2025, points_for: 1600, points_against: 1500, finish: 2 }),
    season({ season: 2024, points_for: 1400, points_against: 1300, finish: 3 }),
    season({ season: 2023, points_for: 1300, points_against: 1200, finish: 4 }),
    season({ season: 2022, points_for: 1500, points_against: 500, finish: 5 }),
    season({ season: 2021, points_for: 1200, points_against: 1100, finish: 6 }),
    season({ season: 2020, points_for: 1000, points_against: 1400, finish: 1, champion: true }),
  ];
  const games = [
    game({ season: 2025, date: '2025-01-01', scoreA: 100, scoreB: 90 }),
    game({ season: 2024, date: '2024-01-01', scoreA: 180, scoreB: 170 }),
    game({ season: 2023, date: '2023-01-01', scoreA: 170, scoreB: 80 }),
    game({ season: 2022, date: '2022-01-01', scoreA: 120, scoreB: 100 }),
    game({ season: 2021, date: '2021-01-01', scoreA: 110, scoreB: 100 }),
    game({ season: 2020, date: '2020-01-01', scoreA: 90, scoreB: 100 }),
  ];
  const profile = buildOwnerCareerProfile('Joe', rows, games, {
    seasonAggregates: [
      { team: 'Joe', season: 2025, expWins: 4, luck: 0 },
      { team: 'Joe', season: 2024, expWins: 4, luck: 0 },
      { team: 'Joe', season: 2023, expWins: 4, luck: 0 },
      { team: 'Joe', season: 2022, expWins: 4, luck: 0 },
      { team: 'Joe', season: 2021, expWins: 4, luck: 2 },
      { team: 'Joe', season: 2020, expWins: 4, luck: -2 },
    ],
  });
  const lists = computeAchievementAndScarLists(profile);

  assert.deepEqual(lists.achievements.map(item => item.label), [
    'Best regular season',
    'Highest weekly score',
    'Best win margin',
    'Best point differential season',
    'Luckiest season',
  ]);
  assert.equal(lists.achievements.some(item => item.label === 'Championship season'), false);
  assert.ok(lists.scars.some(item => item.label === 'Most unlucky season' && item.sourceKey === 'season:2020'));
  const highlightSources = new Set(lists.achievements.map(item => item.sourceKey));
  assert.equal(lists.scars.some(item => highlightSources.has(item.sourceKey)), false);
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
