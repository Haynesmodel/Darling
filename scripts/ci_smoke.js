/* Basic CI smoke tests (no unit tests in repo yet). */
const fs = require('fs');
const path = require('path');

function readJson(p){
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function assert(cond, msg){
  if(!cond){
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function isNum(x){
  return Number.isFinite(+x);
}

const root = process.cwd();
const assets = path.join(root, 'assets');

const h2hPath = path.join(assets, 'H2H.json');
const seasonPath = path.join(assets, 'SeasonSummary.json');
const rivalPath = path.join(assets, 'Rivalries.json');

const h2h = readJson(h2hPath);
const seasons = readJson(seasonPath);
const rivalries = readJson(rivalPath);

assert(Array.isArray(h2h), 'H2H.json must be an array');
assert(Array.isArray(seasons), 'SeasonSummary.json must be an array');
assert(Array.isArray(rivalries), 'Rivalries.json must be an array');

for(const [i,g] of h2h.entries()){
  assert(g && typeof g === 'object', `H2H entry ${i} must be an object`);
  assert(isNum(g.season), `H2H entry ${i} missing numeric season`);
  assert(typeof g.date === 'string' && g.date.length >= 8, `H2H entry ${i} missing date`);
  assert(typeof g.teamA === 'string' && g.teamA, `H2H entry ${i} missing teamA`);
  assert(typeof g.teamB === 'string' && g.teamB, `H2H entry ${i} missing teamB`);
  assert(isNum(g.scoreA), `H2H entry ${i} missing scoreA`);
  assert(isNum(g.scoreB), `H2H entry ${i} missing scoreB`);
  assert(isNum(g.week) || g.week === null || g.week === '', `H2H entry ${i} missing week`);
  assert(typeof g.type === 'string' && g.type, `H2H entry ${i} missing type`);
}

for(const [i,r] of seasons.entries()){
  assert(r && typeof r === 'object', `SeasonSummary entry ${i} must be an object`);
  assert(isNum(r.season), `SeasonSummary entry ${i} missing season`);
  assert(typeof r.owner === 'string' && r.owner, `SeasonSummary entry ${i} missing owner`);
  assert(isNum(r.wins), `SeasonSummary entry ${i} missing wins`);
  assert(isNum(r.losses), `SeasonSummary entry ${i} missing losses`);
  assert(isNum(r.ties), `SeasonSummary entry ${i} missing ties`);
  if(r.finish !== null && r.finish !== undefined){
    assert(isNum(r.finish), `SeasonSummary entry ${i} finish must be number or null`);
  }
  assert(isNum(r.playoff_wins), `SeasonSummary entry ${i} missing playoff_wins`);
  assert(isNum(r.playoff_losses), `SeasonSummary entry ${i} missing playoff_losses`);
  assert(isNum(r.saunders_wins), `SeasonSummary entry ${i} missing saunders_wins`);
  assert(isNum(r.saunders_losses), `SeasonSummary entry ${i} missing saunders_losses`);
}

console.log('Smoke tests passed.');
