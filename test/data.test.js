const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const assets = path.join(root, 'assets');
const h2hPath = path.join(assets, 'H2H.json');
const seasonPath = path.join(assets, 'SeasonSummary.json');
const rivalPath = path.join(assets, 'Rivalries.json');

function readJson(p){
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function isNum(x){
  return Number.isFinite(+x);
}

function isThirdPlace(g){
  return String(g.round || '').toLowerCase().includes('third place');
}

function isSaunders(g){
  const t = String(g.type || '').toLowerCase();
  const r = String(g.round || '').toLowerCase();
  return t === 'saunders' || r.includes('saunders');
}

function isPlayoff(g){
  const t = String(g.type || '').toLowerCase();
  return t && t !== 'regular' && !isSaunders(g);
}

function isRegular(g){
  return String(g.type || '').toLowerCase() === 'regular';
}

function canonicalGameKey(g){
  const t1 = g.teamA;
  const t2 = g.teamB;
  const s1 = +g.scoreA;
  const s2 = +g.scoreB;
  const type = String(g.type || '').trim().toLowerCase();
  const round = String(g.round || '').trim().toLowerCase();
  if (t1 < t2) return `${g.season}|${g.date}|${type}|${round}|${t1}|${s1.toFixed(3)}|${t2}|${s2.toFixed(3)}`;
  return `${g.season}|${g.date}|${type}|${round}|${t2}|${s2.toFixed(3)}|${t1}|${s1.toFixed(3)}`;
}

test('assets JSON loads', () => {
  assert.ok(fs.existsSync(h2hPath));
  assert.ok(fs.existsSync(seasonPath));
  assert.ok(fs.existsSync(rivalPath));

  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const rivals = readJson(rivalPath);

  assert.ok(Array.isArray(h2h));
  assert.ok(Array.isArray(seasons));
  assert.ok(Array.isArray(rivals));
});

test('H2H rows have required shape', () => {
  const h2h = readJson(h2hPath);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const [i, g] of h2h.entries()){
    assert.ok(g && typeof g === 'object');
    assert.ok(isNum(g.season), `row ${i} missing season`);
    assert.ok(typeof g.date === 'string' && dateRe.test(g.date), `row ${i} invalid date`);
    assert.ok(typeof g.teamA === 'string' && g.teamA, `row ${i} missing teamA`);
    assert.ok(typeof g.teamB === 'string' && g.teamB, `row ${i} missing teamB`);
    assert.ok(isNum(g.scoreA), `row ${i} missing scoreA`);
    assert.ok(isNum(g.scoreB), `row ${i} missing scoreB`);
    assert.ok(isNum(g.week) || g.week === null || g.week === '', `row ${i} missing week`);
    assert.ok(typeof g.type === 'string' && g.type, `row ${i} missing type`);
    assert.ok(g.scoreA >= 0 && g.scoreB >= 0, `row ${i} negative score`);
  }
});

test('SeasonSummary rows have required shape', () => {
  const seasons = readJson(seasonPath);
  for (const [i, r] of seasons.entries()){
    assert.ok(r && typeof r === 'object');
    assert.ok(isNum(r.season), `row ${i} missing season`);
    assert.ok(typeof r.owner === 'string' && r.owner, `row ${i} missing owner`);
    assert.ok(isNum(r.wins), `row ${i} missing wins`);
    assert.ok(isNum(r.losses), `row ${i} missing losses`);
    assert.ok(isNum(r.ties), `row ${i} missing ties`);
    if (r.finish !== null && r.finish !== undefined){
      assert.ok(isNum(r.finish), `row ${i} finish must be number or null`);
    }
    assert.ok(isNum(r.playoff_wins), `row ${i} missing playoff_wins`);
    assert.ok(isNum(r.playoff_losses), `row ${i} missing playoff_losses`);
    assert.ok(isNum(r.saunders_wins), `row ${i} missing saunders_wins`);
    assert.ok(isNum(r.saunders_losses), `row ${i} missing saunders_losses`);
  }
});

test('H2H has no duplicate games (canonical key)', () => {
  const h2h = readJson(h2hPath);
  const seen = new Set();
  for (const g of h2h){
    const key = canonicalGameKey(g);
    assert.ok(!seen.has(key), `duplicate game: ${key}`);
    seen.add(key);
  }
});

test('Playoff wins per season are within bracket limits', () => {
  const h2h = readJson(h2hPath);
  const rec = new Map();
  for (const g of h2h){
    if (isThirdPlace(g)) continue;
    if (!isPlayoff(g)) continue;
    const season = +g.season;
    const upd = (team, win) => {
      const key = `${team}|${season}`;
      const r = rec.get(key) || { team, season, w: 0, l: 0 };
      if (win) r.w++; else r.l++;
      rec.set(key, r);
    };
    if (g.scoreA > g.scoreB){
      upd(g.teamA, true); upd(g.teamB, false);
    } else if (g.scoreB > g.scoreA){
      upd(g.teamA, false); upd(g.teamB, true);
    }
  }

  for (const r of rec.values()){
    const maxWins = r.season === 2014 ? 2 : 3;
    assert.ok(r.w <= maxWins, `${r.team} ${r.season} has ${r.w} playoff wins`);
  }
});

test('SeasonSummary playoff/saunders totals match H2H', () => {
  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const po = new Map();
  const sau = new Map();

  for (const g of h2h){
    if (isThirdPlace(g)) continue;
    const season = +g.season;
    if (isPlayoff(g)){
      const aKey = `${g.teamA}|${season}`;
      const bKey = `${g.teamB}|${season}`;
      const ra = po.get(aKey) || { w:0, l:0 };
      const rb = po.get(bKey) || { w:0, l:0 };
      if (g.scoreA > g.scoreB){ ra.w++; rb.l++; }
      else if (g.scoreB > g.scoreA){ ra.l++; rb.w++; }
      po.set(aKey, ra); po.set(bKey, rb);
    } else if (isSaunders(g)){
      const aKey = `${g.teamA}|${season}`;
      const bKey = `${g.teamB}|${season}`;
      const ra = sau.get(aKey) || { w:0, l:0 };
      const rb = sau.get(bKey) || { w:0, l:0 };
      if (g.scoreA > g.scoreB){ ra.w++; rb.l++; }
      else if (g.scoreB > g.scoreA){ ra.l++; rb.w++; }
      sau.set(aKey, ra); sau.set(bKey, rb);
    }
  }

  for (const r of seasons){
    const key = `${r.owner}|${r.season}`;
    const pr = po.get(key) || { w:0, l:0 };
    const sr = sau.get(key) || { w:0, l:0 };
    assert.equal(r.playoff_wins, pr.w, `${key} playoff_wins mismatch`);
    assert.equal(r.playoff_losses, pr.l, `${key} playoff_losses mismatch`);
    assert.equal(r.saunders_wins, sr.w, `${key} saunders_wins mismatch`);
    assert.equal(r.saunders_losses, sr.l, `${key} saunders_losses mismatch`);
  }
});

test('SeasonSummary owners exist in H2H teams', () => {
  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const teams = new Set();
  for (const g of h2h){ teams.add(g.teamA); teams.add(g.teamB); }
  for (const r of seasons){ assert.ok(teams.has(r.owner), `unknown owner in SeasonSummary: ${r.owner}`); }
});

test('Regular-season games have empty playoff round', () => {
  const h2h = readJson(h2hPath);
  for (const g of h2h){
    if (isRegular(g)){
      const r = String(g.round || '').trim();
      assert.ok(r === '' || r.toLowerCase() === 'regular', `regular game with round: ${g.round}`);
    }
  }
});

test('Saunders is loser of Saunders Final (when present)', () => {
  const h2h = readJson(h2hPath);
  const seasons = readJson(seasonPath);
  const saundersLoser = new Map();
  for (const g of h2h){
    if (isThirdPlace(g)) continue;
    if (!isSaunders(g)) continue;
    const r = String(g.round || '').toLowerCase();
    if (!r.includes('final')) continue;
    if (g.scoreA === g.scoreB) continue;
    const loser = g.scoreA > g.scoreB ? g.teamB : g.teamA;
    saundersLoser.set(+g.season, loser);
  }
  for (const r of seasons){
    const loser = saundersLoser.get(+r.season);
    if (!loser) continue;
    assert.equal(r.saunders, r.owner === loser, `${r.owner}|${r.season} saunders flag mismatch`);
  }
});

test('Each season has a single champion', () => {
  const seasons = readJson(seasonPath);
  const bySeason = new Map();
  for (const r of seasons){
    const s = +r.season;
    bySeason.set(s, (bySeason.get(s) || 0) + (r.champion ? 1 : 0));
  }
  for (const [season, count] of bySeason.entries()){
    assert.equal(count, 1, `season ${season} has ${count} champions`);
  }
});
