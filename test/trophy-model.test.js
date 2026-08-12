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
