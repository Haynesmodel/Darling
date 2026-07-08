import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDraftSpotModel } from '../js/draft-spot-data.js';
import {
  draftOwnerRecommendationsHtml,
  draftPickBoardHtml,
  draftPickDetailHtml,
  draftRowsTableHtml,
  draftSpotHeroHtml,
  draftZoneComparisonHtml,
} from '../js/draft-spot-renderers.js';
import { draftSpotPath, readJson } from './test-helpers.js';

const asset = readJson(draftSpotPath);

test('draft spot renderers produce stable main sections', () => {
  const model = buildDraftSpotModel(asset, {
    state: {
      startSeason: 2017,
      endSeason: 2025,
      metric: 'playoffRate',
      minSample: 2,
      selectedPick: 10,
    },
  });

  assert.match(draftSpotHeroHtml(model), /Draft Spot Explorer/);
  assert.match(draftPickBoardHtml(model), /data-draft-pick="10"/);
  assert.match(draftPickBoardHtml(model), /low-sample/);
  assert.match(draftZoneComparisonHtml(model), /data-draft-zone="late"/);
  assert.match(draftOwnerRecommendationsHtml(model), /draft-owner-card/);
  assert.match(draftPickDetailHtml(model), /Pick 10/);
  assert.match(draftPickDetailHtml(model), /Champions:/);
  assert.match(draftRowsTableHtml(model), /id="draftRowsTable"/);
});

test('draft spot renderers escape data-driven owner text', () => {
  const unsafeAsset = {
    ...asset,
    rows: asset.rows.map((row, index) => index === 0 ? { ...row, owner: 'Bad <Owner>' } : row),
    owner_recommendations: [{
      owner: 'Bad <Owner>',
      target: 'Pick <script>',
      recommendation: 'Target & win',
      caution: 'Avoid "bad" html',
      confidence: 'small',
      best_pick: { label: 'Pick <1>', n: 1 },
      best_zone: { label: 'Late <8+>', n: 1 },
      history: [{ season: 2025, draft_pick: 1, finish: 1 }],
    }],
  };
  const model = buildDraftSpotModel(unsafeAsset, {
    state: {
      owner: 'Bad <Owner>',
      startSeason: 2017,
      endSeason: 2025,
    },
  });
  const ownerHtml = draftOwnerRecommendationsHtml(model);
  const rowsHtml = draftRowsTableHtml(model);

  assert.match(ownerHtml, /Bad &lt;Owner&gt;/);
  assert.match(ownerHtml, /Pick &lt;script&gt;/);
  assert.doesNotMatch(ownerHtml, /<script>/);
  assert.match(rowsHtml, /Bad &lt;Owner&gt;/);
  assert.doesNotMatch(rowsHtml, /Bad <Owner>/);
});
