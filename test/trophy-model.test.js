import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTrophyCaseViewModel, computeCareerShape } from '../src/features/trophy/trophy-model.ts';

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
});
