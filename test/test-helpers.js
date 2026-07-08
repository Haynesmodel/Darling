import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const assets = path.join(root, 'assets');
const h2hPath = path.join(assets, 'H2H.json');
const seasonPath = path.join(assets, 'SeasonSummary.json');
const rivalPath = path.join(assets, 'Rivalries.json');
const draftSpotPath = path.join(assets, 'DraftSpot.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function isNum(x) {
  return Number.isFinite(+x);
}

function isThirdPlace(g) {
  return String(g.round || '').toLowerCase().includes('third place');
}

function isSaunders(g) {
  const t = String(g.type || '').toLowerCase();
  const r = String(g.round || '').toLowerCase();
  return t === 'saunders' || r.includes('saunders');
}

function isPlayoff(g) {
  const t = String(g.type || '').toLowerCase();
  return t && t !== 'regular' && !isSaunders(g);
}

function isRegular(g) {
  return String(g.type || '').toLowerCase() === 'regular';
}

function mockJsonResponse(body, opts = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status || 200,
    async json() {
      if (opts.rejectJson) throw new Error('bad json');
      return body;
    },
  };
}

function validSeasonRow(overrides = {}) {
  return {
    season: 2025,
    owner: 'Joe',
    wins: 10,
    losses: 4,
    ties: 0,
    finish: 1,
    playoff_wins: 2,
    playoff_losses: 0,
    saunders_wins: 0,
    saunders_losses: 0,
    ...overrides,
  };
}

export {
  assets,
  draftSpotPath,
  h2hPath,
  isNum,
  isPlayoff,
  isRegular,
  isSaunders,
  isThirdPlace,
  mockJsonResponse,
  readJson,
  rivalPath,
  seasonPath,
  validSeasonRow,
};
