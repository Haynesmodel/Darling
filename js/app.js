/* =========================================================
   The Darling — history filters, highlights, dedupe & weeks
   + Asterisks, Rivalries (easter eggs)
   + Fun Facts, Crown Rain, Saunders Fog
   + Top 5 High/Low (skip 2014 playoffs), streak ranges
   + 👑 crowns + 💩 turds per week; Luck (Expected Wins)
========================================================= */

/* ---------- Global State ---------- */

const startersTotal = 9;
const DEFAULT_TEAM_FOR_RIVALRY = "Joe";

let leagueGames = [];      // assets/H2H.json
let seasonSummaries = [];  // assets/SeasonSummary.json
let rivalries = [];        // assets/Rivalries.json

const ALL_TEAMS = "__ALL__";
let selectedTeam = "Joe";

let selectedSeasons = new Set();
let selectedWeeks   = new Set();
let selectedOpponents = new Set();
let selectedTypes = new Set();
let selectedRounds = new Set();

let universe = { seasons: [], weeks: [], opponents: [], types: [], rounds: [] };

/* Derived weeks set */
let derivedWeeksSet = new Set();

/* Effects — avoid replaying repeatedly */
let lastEffectKey = null;

/* ---------- Special season notes (asterisks) ---------- */
const SPECIAL_TITLE_NOTES = {
  Joel: { champs: { 2014: "Singer not in league", 2020: "COVID season" } },
  Joe:  { saunders: { 2015: "Saunders Bowl matchups incorrect" } }
};
const champNote    = (owner, season) => SPECIAL_TITLE_NOTES[owner]?.champs?.[season] || null;
const saundersNote = (owner, season) => SPECIAL_TITLE_NOTES[owner]?.saunders?.[season] || null;

/* ---------- Utils ---------- */

// Safe number formatter: returns "—" if not finite
function nfmt(x, d=2){
  return Number.isFinite(+x) ? (+x).toFixed(d) : "—";
}

function avgFinishForTeam(team){
  const rows = seasonSummaries.filter(r=>r.owner===team && Number.isFinite(+r.finish));
  if (!rows.length) return null;
  const sum = rows.reduce((a,b)=> a + (+b.finish), 0);
  return sum / rows.length;
}

let isApplyingUrlState = false;

function parseUrlState(){
  const params = new URLSearchParams(window.location.search);
  const parseList = (key)=> {
    const v = params.get(key);
    if(!v) return null;
    return v.split(',').map(s=>decodeURIComponent(s)).filter(Boolean);
  };
  const seasons = parseList('seasons')?.map(n=>+n).filter(n=>Number.isFinite(n));
  const weeks = parseList('weeks')?.map(n=>+n).filter(n=>Number.isFinite(n));
  const opps = parseList('opps');
  const types = parseList('types');
  const rounds = parseList('rounds');
  const team = params.get('team') || null;
  const hasAny = !!(team || (seasons&&seasons.length) || (weeks&&weeks.length) || (opps&&opps.length) || (types&&types.length) || (rounds&&rounds.length));
  return {
    team,
    seasons: seasons ? new Set(seasons) : null,
    weeks: weeks ? new Set(weeks) : null,
    opps: opps ? new Set(opps) : null,
    types: types ? new Set(types) : null,
    rounds: rounds ? new Set(rounds) : null,
    hasAny
  };
}

function setFacetSelections(containerId, prefix, valuesSet){
  const container = document.getElementById(containerId); if(!container) return;
  const all = container.querySelector(`.${prefix}-all`);
  const cbs = [...container.querySelectorAll(`.${prefix}-cb`)];
  if(!valuesSet || valuesSet.size===0){
    if(all) all.checked = true;
    cbs.forEach(cb=>cb.checked=false);
    return;
  }
  let any=false;
  cbs.forEach(cb=>{
    const raw = decodeURIComponent(cb.dataset.value);
    const val = (prefix==='season' || prefix==='week') ? +raw : raw;
    if(valuesSet.has(val)){
      cb.checked = true; any=true;
    }else{
      cb.checked = false;
    }
  });
  if(all) all.checked = !any;
}

function updateUrlFromState(){
  if(isApplyingUrlState) return;
  const params = new URLSearchParams();
  if(selectedTeam && selectedTeam!==ALL_TEAMS) params.set('team', selectedTeam);
  const setIf = (key, set, uni)=>{ if(isRestrictive(set, uni)) params.set(key, [...set].join(',')); };
  setIf('seasons', selectedSeasons, universe.seasons);
  setIf('weeks', selectedWeeks, universe.weeks);
  setIf('opps', selectedOpponents, universe.opponents);
  setIf('types', selectedTypes, universe.types);
  setIf('rounds', selectedRounds, universe.rounds);
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  window.history.replaceState(null, '', next);
}

/* ---------- League-wide computed helpers (added) ---------- */

// Count sub-65 point games per team (regular season only)
function sub65GamesPerTeam(threshold=65){
  const count = new Map();
  for (const g of leagueGames){
    if (!isRegularGame(g)) continue;
    if (+g.scoreA < threshold) count.set(g.teamA, (count.get(g.teamA)||0)+1);
    if (+g.scoreB < threshold) count.set(g.teamB, (count.get(g.teamB)||0)+1);
  }
  return Array.from(count.entries()).map(([team, cnt])=>({team, count: cnt}));
}

// Longest losing streaks across all teams
function longestLosingStreaksAllTeams(n=10){
  const results = [];
  for (const team of teamsFromLeagueGames()) {
    const tg = leagueGames
      .map(g => ({ g, s: sidesForTeam(g, team) }))
      .filter(x => x.s)
      .sort((a,b)=> new Date(a.g.date) - new Date(b.g.date));

    let cur=0, best=0, start=null, bestStart=null, bestEnd=null;
    for (const {g,s} of tg) {
      if (s.result === 'L') {
        if (cur === 0) start = g.date;
        cur++;
        if (cur > best) { best = cur; bestStart = start; bestEnd = g.date; }
      } else {
        // ties & wins break the losing streak
        cur = 0; start = null;
      }
    }
    if (best > 0) results.push({ team, len: best, start: bestStart, end: bestEnd });
  }
  return results
    .sort((a,b)=> b.len - a.len || a.team.localeCompare(b.team))
    .slice(0, n);
}


// Season aggregates (regular season only) - unified & fixed
function seasonAggregatesAllTeams(){
  const map = new Map();

  if (Array.isArray(seasonSummaries)) {
    for (const r of seasonSummaries) {
      const key = `${r.owner}|${r.season}`;
      if (!map.has(key)) {
        map.set(key, {
          team: r.owner, season: +r.season,
          w:0,l:0,t:0,n:0,pf:0,pa:0, actWins:0, expWins:0
        });
      }
    }
  }

  for (const g of leagueGames) {
    if (!isRegularGame(g)) continue;
    const season = +g.season;
    { // A side
      const key = `${g.teamA}|${season}`;
      if (!map.has(key)) map.set(key, { team:g.teamA, season, w:0,l:0,t:0,n:0,pf:0,pa:0, actWins:0, expWins:0 });
      const r = map.get(key);
      r.n += 1; r.pf += +g.scoreA; r.pa += +g.scoreB;
      if (g.scoreA > g.scoreB) { r.w += 1; r.actWins += 1; }
      else if (g.scoreA < g.scoreB) { r.l += 1; }
      else { r.t += 1; r.actWins += 0.5; }
      const xw = expectedWinForGame(g.teamA, g); if (xw!==null) r.expWins += xw;
    }
    { // B side
      const key = `${g.teamB}|${season}`;
      if (!map.has(key)) map.set(key, { team:g.teamB, season, w:0,l:0,t:0,n:0,pf:0,pa:0, actWins:0, expWins:0 });
      const r = map.get(key);
      r.n += 1; r.pf += +g.scoreB; r.pa += +g.scoreA;
      if (g.scoreB > g.scoreA) { r.w += 1; r.actWins += 1; }
      else if (g.scoreB < g.scoreA) { r.l += 1; }
      else { r.t += 1; r.actWins += 0.5; }
      const xw = expectedWinForGame(g.teamB, g); if (xw!==null) r.expWins += xw;
    }
  }

  const out = [];
  for (const r of map.values()) {
    const games = (r.w + r.l + r.t);
    const pct = games ? (r.w + 0.5*r.t) / games : 0;
    const ppg = r.n ? (r.pf / r.n) : 0;
    const oppg = r.n ? (r.pa / r.n) : 0;
    const luck = r.actWins - r.expWins;
    const diff = r.pf - r.pa;
    out.push({ ...r, pct, ppg, oppg, luck, diff });
  }
  return out;
}



// Build head-to-head records per pair
function headToHeadPairs(minGames=5){
  // key: team|opp
  const map = new Map();
  for (const g of leagueGames) {
    const keyA = `${g.teamA}|${g.teamB}`;
    const keyB = `${g.teamB}|${g.teamA}`;
    if (!map.has(keyA)) map.set(keyA, { team:g.teamA, opp:g.teamB, w:0,l:0,t:0,g:0 });
    if (!map.has(keyB)) map.set(keyB, { team:g.teamB, opp:g.teamA, w:0,l:0,t:0,g:0 });
    // A side
    const a = map.get(keyA); a.g += 1;
    if (g.scoreA > g.scoreB) a.w += 1;
    else if (g.scoreA < g.scoreB) a.l += 1;
    else a.t += 1;
    // B side
    const b = map.get(keyB); b.g += 1;
    if (g.scoreB > g.scoreA) b.w += 1;
    else if (g.scoreB < g.scoreA) b.l += 1;
    else b.t += 1;
  }
  const rows = [];
  for (const r of map.values()) {
    if (r.g >= minGames) {
      const pct = (r.w + 0.5*r.t) / r.g;
      rows.push({ ...r, pct });
    }
  }
  return rows;
}

// Weekly awards: top and bottom scorer each regular-season date
function weeklyAwards(){
  const byDate = new Map();
  for (const g of leagueGames) {
    if (!isRegularGame(g)) continue;
    const d = g.date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push({ team:g.teamA, score: g.scoreA });
    byDate.get(d).push({ team:g.teamB, score: g.scoreB });
  }
  const topCount = new Map(), lowCount = new Map(), high150 = new Map();
  for (const [d, arr] of byDate.entries()) {
    if (!arr.length) continue;
    arr.sort((a,b)=> b.score - a.score);
    const top = arr[0];
    const low = arr[arr.length-1];
    topCount.set(top.team, (topCount.get(top.team)||0)+1);
    lowCount.set(low.team, (lowCount.get(low.team)||0)+1);
    for (const {team, score} of arr) {
      if (score >= 150) high150.set(team, (high150.get(team)||0)+1);
    }
  }
  const toRows = (m) => Array.from(m.entries()).map(([team, count])=>({team, count}));
  return { top: toRows(topCount), low: toRows(lowCount), high150: toRows(high150) };
}

// Playoff wins per team (excluding Saunders)
function playoffWinsPerTeam(){
  const wins = new Map();
  for (const g of leagueGames) {
    const t = (g.type||'').toLowerCase();
    if (!t || t==='regular') continue;
    if (t.includes('saunders')) continue;
    // award win
    if (g.scoreA > g.scoreB) wins.set(g.teamA, (wins.get(g.teamA)||0)+1);
    else if (g.scoreB > g.scoreA) wins.set(g.teamB, (wins.get(g.teamB)||0)+1);
  }
  return Array.from(wins.entries()).map(([team, wins])=>({team, wins}));
}
function assignIds(){ players.forEach((p,idx)=> p._id = (crypto.randomUUID?crypto.randomUUID():("id_"+Date.now()+"_"+idx))); }
function cheer(){ try{ document.getElementById("cheer").play(); }catch(e){} }
function trombone(){ try{ document.getElementById("trombone").play(); }catch(e){} }
function sum(a){return a.reduce((x,y)=>x+y,0);}
function unique(a){return [...new Set(a)];}
function byDateAsc(a,b){return new Date(a.date)-new Date(b.date);}
function byDateDesc(a,b){return new Date(b.date)-new Date(a.date);}
function fmtPct(w,l,t){const g=w+l+t; return g?(((w+0.5*t)/g)*100).toFixed(1)+'%':'0.0%';}
function csvEscape(s){return (''+s).replace(/"/g,'""');}

function normType(t){ return (t && t.trim()) ? t : "Regular"; }
function normRound(r){ return r || ""; }

function sidesForTeam(g, team){
  let pf, pa, opp;
  if (g.teamA===team){ pf=g.scoreA; pa=g.scoreB; opp=g.teamB; }
  else if (g.teamB===team){ pf=g.scoreB; pa=g.scoreA; opp=g.teamA; }
  else return null;
  let result='T'; if(pf>pa) result='W'; else if(pf<pa) result='L';
  return { pf, pa, opp, result };
}
function isSaundersGame(g){
  const t = normType(g.type).toLowerCase();
  const r = normRound(g.round).toLowerCase();
  return t==="saunders" || r.includes("saunders");
}
function isRegularGame(g){ return normType(g.type)==="Regular"; }
function isPlayoffGame(g){ return !isRegularGame(g) && !isSaundersGame(g); }

const roundOrder = (roundStr="")=>{
  const r=(roundStr||"").toLowerCase().trim();
  const sau = r.includes("saunders");
  const ply = !sau && (r.includes("wild")||r.includes("quarter")||r.includes("semi")||r.includes("final")||r.includes("champ"));
  if(ply){ if(r.includes("wild"))return 1; if(r.includes("quarter"))return 2; if(r.includes("semi"))return 3; if(r.includes("champ")||r==="final"||r.endsWith("final"))return 4; return 90; }
  if(sau){ if(r.includes("round 1"))return 1; if(r.includes("final"))return 2; return 95; }
  if(r.includes("third"))return 80; return 99;
};

/* ---------- Data preprocessing ---------- */
function canonicalGameKey(g){
  const t1 = g.teamA, t2 = g.teamB;
  const s1 = +g.scoreA, s2 = +g.scoreB;
  const type = (g.type||"").trim().toLowerCase();
  const round = (g.round||"").trim().toLowerCase();
  if (t1 < t2) return `${g.season}|${g.date}|${type}|${round}|${t1}|${s1.toFixed(3)}|${t2}|${s2.toFixed(3)}`;
  return `${g.season}|${g.date}|${type}|${round}|${t2}|${s2.toFixed(3)}|${t1}|${s1.toFixed(3)}`;
}
function dedupeGames(games){
  const seen=new Set(); const out=[];
  for(const g of games){
    const key=canonicalGameKey(g);
    if(seen.has(key)) continue;
    seen.add(key); out.push(g);
  }
  return out;
}
function deriveWeeksInPlace(games){
  const weeksSeen = new Set();
  games.forEach(g=> g._weekByTeam = {});
  const seasons = unique(games.map(g=>g.season));
  for(const season of seasons){
    const teams = unique(games.filter(g=>g.season===season).flatMap(g=>[g.teamA,g.teamB]));
    for(const team of teams){
      const teamGames = games.filter(g=>g.season===season && (g.teamA===team||g.teamB===team)).sort(byDateAsc);
      const seenDates=new Set(); let idx=0;
      for(const g of teamGames){
        if(seenDates.has(g.date)){ g._weekByTeam[team] = g._weekByTeam[team] ?? idx; continue; }
        idx+=1; g._weekByTeam[team]=idx; seenDates.add(g.date); weeksSeen.add(idx);
      }
    }
  }
  return weeksSeen;
}
function computeRegularSeasonChampYears(owner, summaries){
  const bySeason = new Map();
  for(const r of summaries){ const arr=bySeason.get(r.season)||[]; arr.push(r); bySeason.set(r.season,arr); }
  const out=[];
  for(const [season, rows] of bySeason.entries()){
    const maxW = Math.max(...rows.map(r=>r.wins||0));
    const winners = rows.filter(r=>r.wins===maxW).map(r=>r.owner);
    if(winners.includes(owner)) out.push(+season);
  }
  return out.sort((a,b)=>a-b);
}

/* ---------- Loaders & Tabs ---------- */
async function loadLeagueJSON(){
  try{
    const [h2hRes, seasonRes, rivRes] = await Promise.all([
      fetch("assets/H2H.json"),
      fetch("assets/SeasonSummary.json"),
      fetch("assets/Rivalries.json")
    ]);

    let rawGames = await h2hRes.json();
    leagueGames = dedupeGames(rawGames);
    derivedWeeksSet = deriveWeeksInPlace(leagueGames);
    seasonSummaries = await seasonRes.json();

    try{
      rivalries = await rivRes.json();
      if (!Array.isArray(rivalries) || rivalries.length === 0) {
        console.warn("[Darling] Rivalries.json missing or empty — rivalry callouts disabled.");
        rivalries = [];
      }
    }catch{
      console.warn("[Darling] Rivalries.json not found/parse error — rivalry callouts disabled.");
      rivalries = [];
    }

    renderHeaderBannersForOwner("Joe");
  }catch(e){ console.error("Failed to load league JSON", e); }
}
function showPage(id){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('visible'));
  const histBtn = document.getElementById('tabHistoryBtn');
  const histPage = document.getElementById('page-history');
  if(histBtn) histBtn.classList.add('active');
  if(histPage) histPage.classList.add('visible');
}

/* ---------- Header banners row ---------- */
function renderHeaderBannersForOwner(owner){
  const el=document.getElementById('headerBanners'); if(!el) return;
  const rows = seasonSummaries.filter(r=>r.owner===owner);
  const champYears = rows.filter(r=>r.champion).map(r=>r.season).sort((a,b)=>a-b);
  const regYears = computeRegularSeasonChampYears(owner, seasonSummaries);
  const chips = [
    ...champYears.map(y=>`<div class="banner champ">🏆 ${y}</div>`),
    ...regYears.map(y=>`<div class="banner reg">🥇 ${y}</div>`)
  ];
  el.innerHTML = chips.join("");
}

// Update header (team name + accomplishment chips)
function updateHeaderForTeam(team){
  try {
    const h2 = document.querySelector('header h2');
    if (h2) h2.textContent = team;
    renderHeaderBannersForOwner(team);
    document.title = team + ' — League History';
  } catch (_) {}
}

/* ---------- Init ---------- */
window.addEventListener('DOMContentLoaded', async ()=>{
  await loadLeagueJSON();

  // Tabs (History only)
  const histTab = document.getElementById('tabHistoryBtn');
  if (histTab) {
    histTab.addEventListener('click', ()=>{
      showPage('history');
      const teamSel = document.getElementById('teamSelect');
      if (teamSel && !teamSel.dataset.ready) {
        buildHistoryControls();
        teamSel.dataset.ready = '1';
      }
      renderHistory();
    });
  }

  // Dropdown toggling
  document.addEventListener('click', (e)=>{
    document.querySelectorAll('.dropdown').forEach((dd)=>{
      const btn = dd.querySelector('.dropdown-toggle');
      if (btn && btn.contains(e.target)) dd.classList.toggle('open');
      else if (!dd.contains(e.target)) dd.classList.remove('open');
    });
  });

  // Clear / Export
  const _cf = document.getElementById('clearFilters');
  if (_cf) _cf.addEventListener('click', resetAllFacetsToAll);
  const _ex = document.getElementById('exportCsv');
  if (_ex) _ex.addEventListener('click', exportHistoryCsv);

  // Auto-init: trigger History once after data loads
  if (histTab) {
    histTab.click();
  } else {
    const teamSel = document.getElementById('teamSelect');
    if (teamSel && !teamSel.dataset.ready) {
      buildHistoryControls();
      teamSel.dataset.ready = '1';
    }
    renderHistory();
  }
});


  /* ---------- Rivalry UI ---------- */

/* ---------- Rivalry Sidebar: Rivalry + Postseason chips ---------- */
function renderRivalrySidebar(){
  if(!leagueGames.length) return;
  const me=DEFAULT_TEAM_FOR_RIVALRY, vs={};
  for(const g of leagueGames){
    const s=sidesForTeam(g,me); if(!s) continue;
    const key=s.opp; vs[key]=vs[key]||{w:0,l:0,t:0,pf:0,pa:0};
    if(s.result==='W') vs[key].w++;
    else if(s.result==='L') vs[key].l++;
    else vs[key].t++;
    vs[key].pf+=s.pf; vs[key].pa+=s.pa;
  }
  const rows=Object.entries(vs).map(([opp,r])=>({opp,...r,pct:(r.w+0.5*r.t)/Math.max(1,(r.w+r.l+r.t))}))
    .sort((a,b)=> b.pct-a.pct || b.w-a.w || a.l-b.l);
  const top=rows.slice(0,6);
  const html=`<table class="rivalry-table">
    <thead><tr><th>Opponent</th><th>W-L-T</th><th>Win %</th><th>PF / PA</th></tr></thead>
    <tbody>${top.map(r=>`<tr><td>${r.opp}</td><td>${r.w}-${r.l}-${r.t}</td><td>${fmtPct(r.w,r.l,r.t)}</td><td>${r.pf.toFixed(1)} / ${r.pa.toFixed(1)}</td></tr>`).join("")}</tbody>
  </table>`;
  const _riv = document.getElementById("rivalry");
  if (!_riv) return;
  _riv.innerHTML = html;
  
  if (rows.length) {
    const _tt = document.getElementById("trashTalk");
    if (_tt) {
      _tt.textContent = `Most-owned: ${rows[0].opp} (${rows[0].w}-${rows[0].l}-${rows[0].t}).`;
    }
  }
  
}
function renderSidebarPostseason(team){
  const wrap=document.getElementById('postKpis'); if(!wrap) return;
  const champs = seasonSummaries.filter(r=>r.owner===team && r.champion).map(x=>x.season).sort((a,b)=>b-a);
  const byes = seasonSummaries.filter(r=>r.owner===team && r.bye).map(x=>x.season).sort((a,b)=>b-a);
  const sauYears = seasonSummaries.filter(r=>r.owner===team && r.saunders===true).map(x=>x.season).sort((a,b)=>b-a);
  wrap.innerHTML = `
    <div class="pill">🏆 Champs: ${champs.length}${champs.length?` (${champs.join(", ")})`:""}</div>
    <div class="pill">🔥 Byes: ${byes.length}${byes.length?` (${byes.join(", ")})`:""}</div>
    <div class="pill">🪦 Saunders: ${sauYears.length}${sauYears.length?` (${sauYears.join(", ")})`:""}</div>
  `;
}

/* ---------- Facet Options ---------- */
function teamOptions(){
  const ts=unique(seasonSummaries.map(r=>r.owner));
  const tg=unique(leagueGames.flatMap(g=>[g.teamA,g.teamB]));
  const teams=unique([...ts,...tg]).sort();
  return [{value:ALL_TEAMS,label:"All Teams (League)"}, ...teams.map(t=>({value:t,label:t}))];
}
function seasonOptions(){ return unique(leagueGames.map(g=>g.season)).sort((a,b)=>b-a); }
function weekOptions(){
  const arr = Array.from(derivedWeeksSet).filter(n=>Number.isFinite(n)).sort((a,b)=>a-b);
  return arr.length ? arr : [1];
}
function opponentOptions(team){
  const allTeams=unique(leagueGames.flatMap(g=>[g.teamA,g.teamB])).sort();
  if(team===ALL_TEAMS) return allTeams;
  return allTeams.filter(o=>o!==team);
}
function typeOptions(){ return unique(leagueGames.map(g=>normType(g.type))).sort(); }
function roundOptionsOrdered(){
  const rounds=unique(leagueGames.map(g=>normRound(g.round)).filter(Boolean));
  return rounds.sort((a,b)=>{ const da=roundOrder(a), db=roundOrder(b); if(da!==db) return da-db; return a.localeCompare(b); });
}

/* ---------- Build History Controls ---------- */
function buildHistoryControls(){
  const urlState = parseUrlState();

  // Team select (with All Teams)
  const teamSelect=document.getElementById('teamSelect');
  const teams=teamOptions();
  teamSelect.innerHTML=teams.map(t=>`<option value="${t.value}">${t.label}</option>`).join("");
  const defaultTeam = teams.find(t=>t.value==="Joe") ? "Joe" : teams[0].value;
  const urlTeam = (urlState.team && teams.some(t=>t.value===urlState.team)) ? urlState.team : null;
  teamSelect.value = urlTeam || defaultTeam;
  selectedTeam = teamSelect.value;
  updateHeaderForTeam(selectedTeam);
  teamSelect.addEventListener('change', ()=>{
    selectedTeam = teamSelect.value;
    updateHeaderForTeam(selectedTeam);
  updateHeaderForTeam(selectedTeam);
    buildFacet('oppFilters', opponentOptions(selectedTeam), {prefix:'opp'});
    readFacetSelections(); updateFacetCountTexts(); renderHistory();
    updateUrlFromState();
  });

  // Facets
  buildFacet('seasonFilters', seasonOptions(), {prefix:'season'});
  buildFacet('weekFilters', weekOptions(),   {prefix:'week'});
  buildFacet('oppFilters', opponentOptions(selectedTeam), {prefix:'opp'});
  buildFacet('typeFilters', typeOptions(), {prefix:'type'});
  buildFacet('roundFilters', roundOptionsOrdered(), {prefix:'round'});

  // Universe + defaults
  universe.seasons = seasonOptions();
  universe.weeks   = weekOptions();
  universe.opponents = opponentOptions(selectedTeam);
  universe.types = typeOptions();
  universe.rounds = roundOptionsOrdered();

  if(urlState.hasAny){
    isApplyingUrlState = true;
    setFacetSelections('seasonFilters','season', urlState.seasons);
    setFacetSelections('weekFilters','week', urlState.weeks);
    setFacetSelections('oppFilters','opp', urlState.opps);
    setFacetSelections('typeFilters','type', urlState.types);
    setFacetSelections('roundFilters','round', urlState.rounds);
    readFacetSelections(); updateFacetCountTexts(); renderHistory();
    isApplyingUrlState = false;
  } else {
    resetAllFacetsToAll(); // All by default
    updateFacetCountTexts();
  }
}

/* ---------- Generic Facet Builder ---------- */
function buildFacet(containerId, values, opts={}){
  const container=document.getElementById(containerId); if(!container) return;
  const { prefix='f' } = opts;

  container.innerHTML = `
    <div class="all-row">
      <label>
        <input type="checkbox" class="${prefix}-all" checked />
        <span>All</span>
      </label>
    </div>
    <div class="grid">
      ${values.map(v=>`
        <label>
          <input type="checkbox" class="${prefix}-cb" data-value="${encodeURIComponent(v)}" />
          <span>${v}</span>
        </label>
      `).join("")}
    </div>
  `;

  container.addEventListener('change',(e)=>{
    if(e.target && e.target.matches(`input.${prefix}-all`)){
      const allChecked = e.target.checked;
      const cbs = container.querySelectorAll(`input.${prefix}-cb`);
      if(allChecked){ cbs.forEach(cb=>cb.checked=false); }
      readFacetSelections(); updateFacetCountTexts(); renderHistory();
      updateUrlFromState();
      return;
    }
    if(e.target && e.target.matches(`input.${prefix}-cb`)){
      const all = container.querySelector(`input.${prefix}-all`);
      const anySpecificChecked = [...container.querySelectorAll(`input.${prefix}-cb`)].some(cb=>cb.checked);
      all.checked = !anySpecificChecked; // none selected -> All
      readFacetSelections(); updateFacetCountTexts(); renderHistory();
      updateUrlFromState();
    }
  });
}

function resetAllFacetsToAll(){
  ['seasonFilters','weekFilters','oppFilters','typeFilters','roundFilters'].forEach(id=>{
    const pref = id.startsWith('season')?'season'
              : id.startsWith('week')  ?'week'
              : id.startsWith('opp')   ?'opp'
              : id.startsWith('type')  ?'type'
              : 'round';
    const all = document.querySelector(`#${id} .${pref}-all`);
    const cbs = document.querySelectorAll(`#${id} .${pref}-cb`);
    if(all) all.checked = true;
    cbs.forEach(cb=>cb.checked=false);
  });
  readFacetSelections(); updateFacetCountTexts(); renderHistory();
  updateUrlFromState();
}

/* Read selections from DOM into sets */
function readFacetSelections(){
  selectedSeasons = (document.querySelector('#seasonFilters .season-all')?.checked)
    ? new Set()
    : new Set([...document.querySelectorAll('#seasonFilters .season-cb')].filter(cb=>cb.checked).map(cb=>+decodeURIComponent(cb.dataset.value)));

  selectedWeeks = (document.querySelector('#weekFilters .week-all')?.checked)
    ? new Set()
    : new Set([...document.querySelectorAll('#weekFilters .week-cb')].filter(cb=>cb.checked).map(cb=>+decodeURIComponent(cb.dataset.value)));

  selectedOpponents = (document.querySelector('#oppFilters .opp-all')?.checked)
    ? new Set()
    : new Set([...document.querySelectorAll('#oppFilters .opp-cb')].filter(cb=>cb.checked).map(cb=>decodeURIComponent(cb.dataset.value)));

  selectedTypes = (document.querySelector('#typeFilters .type-all')?.checked)
    ? new Set()
    : new Set([...document.querySelectorAll('#typeFilters .type-cb')].filter(cb=>cb.checked).map(cb=>decodeURIComponent(cb.dataset.value)));

  selectedRounds = (document.querySelector('#roundFilters .round-all')?.checked)
    ? new Set()
    : new Set([...document.querySelectorAll('#roundFilters .round-cb')].filter(cb=>cb.checked).map(cb=>decodeURIComponent(cb.dataset.value)));

  universe.seasons = seasonOptions();
  universe.weeks   = weekOptions();
  universe.opponents = opponentOptions(selectedTeam);
  universe.types = typeOptions();
  universe.rounds = roundOptionsOrdered();
}

/* Is a facet restrictive? (“All” => not restrictive) */
function isRestrictive(selSet, uniArr){
  if(!uniArr.length) return false;
  if(selSet.size===0) return false;
  if(selSet.size===uniArr.length) return false;
  return true;
}

/* Button texts */
function updateFacetCountTexts(){
  const setText = (id, selSet, uniArr)=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(selSet.size===0 || selSet.size===uniArr.length) el.textContent="All";
    else el.textContent=`${selSet.size} selected`;
  };
  setText('seasonCountText', selectedSeasons, universe.seasons);
  setText('weekCountText', selectedWeeks, universe.weeks);
  setText('oppCountText', selectedOpponents, universe.opponents);
  setText('typeCountText', selectedTypes, universe.types);
  setText('roundCountText', selectedRounds, universe.rounds);
}

/* ---------- HISTORY: Filter + Render ---------- */
function applyFacetFilters(allGames){
  return allGames.filter(g=>{
    if(selectedTeam!==ALL_TEAMS && !(g.teamA===selectedTeam || g.teamB===selectedTeam)) return false;

    const t=normType(g.type);
    const r=normRound(g.round);
    const season=+g.season;

    if(isRestrictive(selectedSeasons, universe.seasons) && !selectedSeasons.has(season)) return false;

    if(selectedTeam!==ALL_TEAMS){
      if(isRestrictive(selectedWeeks, universe.weeks)){
        const w = (g._weekByTeam && g._weekByTeam[selectedTeam]) || null;
        if(!w || !selectedWeeks.has(w)) return false;
      }
      const opp=sidesForTeam(g, selectedTeam)?.opp;
      if(isRestrictive(selectedOpponents, universe.opponents)){ if(!opp || !selectedOpponents.has(opp)) return false; }
    }

    if(isRestrictive(selectedTypes, universe.types) && !selectedTypes.has(t)) return false;
    if(isRestrictive(selectedRounds, universe.rounds)){ if(!r || !selectedRounds.has(r)) return false; }

    return true;
  });
}

function renderHistory(){
  const teamSel=document.getElementById('teamSelect');
  if(teamSel && selectedTeam!==teamSel.value) selectedTeam=teamSel.value;

  renderTopHighlights(selectedTeam);

  const filtered = applyFacetFilters(leagueGames);
  // removed: Stats Overview
  renderFunFacts(selectedTeam, filtered);
  renderOppBreakdown(selectedTeam, filtered);
  renderSeasonRecap(selectedTeam);
  renderWeekByWeek(selectedTeam, filtered);
  renderGamesTable(selectedTeam, filtered);
}

/* ---------- Top Highlights (with asterisks) ---------- */
function renderTopHighlights(team){
  const grid = document.getElementById('teamOverviewGrid');
  if(!grid) return;

  if(team===ALL_TEAMS){
    grid.innerHTML = `
      <div class="overview-chip">
        <h4>League view</h4>
        <div class="big">Select a team to see Darlings & Saunders</div>
        <div class="sub">Filters still work (e.g., Week 1). See Team Breakdown below.</div>
      </div>`;
    return;
  }

  const rows = seasonSummaries.filter(r => r.owner === team);
  const champYears = rows.filter(r => r.champion).map(r => r.season).sort((a,b)=>b-a);
  const sauYears   = rows.filter(r => r.saunders===true).map(r => r.season).sort((a,b)=>b-a);
  const regYears   = computeRegularSeasonChampYears(team, seasonSummaries).sort((a,b)=>b-a);
  const avgFinish = avgFinishForTeam(team);
  const avgFinishSeasons = rows.filter(r=>Number.isFinite(+r.finish)).length;

  const champsDisplay = champYears.map(y => champNote(team, y) ? `${y}*` : `${y}`);
  const sauDisplay    = sauYears.map(y => saundersNote(team, y) ? `${y}*` : `${y}`);

  const notes = [];
  champYears.forEach(y => { const n=champNote(team,y); if(n) notes.push(`${y} — ${n}`); });
  sauYears.forEach(y => { const n=saundersNote(team,y); if(n) notes.push(`${y} — ${n}`); });

  const chip = (title, main, sub="", extraClass="") => `
    <div class="overview-chip ${extraClass}">
      <h4>${title}</h4>
      <div class="big">${main}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ""}
    </div>
  `;

  grid.innerHTML = [
    chip("Darlings", `${champYears.length}`, champYears.length ? `Years: ${champsDisplay.join(", ")}` : "—", "champs"),
    chip("Saunders", `${sauYears.length}`, sauYears.length ? `Years: ${sauDisplay.join(", ")}` : "—", "sau"),
    chip("Regular-Season Titles", `${regYears.length}`, regYears.length ? `Years: ${regYears.join(", ")}` : "—", "regs"),
    chip("Avg Finish", nfmt(avgFinish, 2), avgFinishSeasons ? `Seasons: ${avgFinishSeasons}` : "—", "avg-finish"),
    notes.length ? `<div class="overview-chip"><h4>Notes</h4><div class="sub">* ${notes.join(" • ")}</div></div>` : ""
  ].join("");
}

/* ---- Stats Overview ---- */
function renderAggStats(team, games){
  const grid=document.getElementById('aggStats'); if(!grid) return;

  if(team===ALL_TEAMS){
    grid.innerHTML = `
      <div class="stat"><div class="label">League View</div><div class="value">Use Team Breakdown below</div></div>
      <div class="stat"><div class="label">Games (filtered)</div><div class="value">${games.length}</div></div>
    `;
    document.getElementById('seasonCallout').innerHTML="";
    return;
  }

  const reg=[], ply=[], sau=[];
  for(const g of games){
    const s=sidesForTeam(g,team); if(!s) continue;
    if(isRegularGame(g)) reg.push(s);
    else if(isSaundersGame(g)) sau.push(s);
    else ply.push(s);
  }
  const count=(arr,res)=>arr.filter(s=>s.result===res).length;
  const rec=(arr)=>`${count(arr,'W')}-${count(arr,'L')}-${count(arr,'T')}`;
  const pct=(arr)=>fmtPct(count(arr,'W'),count(arr,'L'),count(arr,'T'));

  const all=[...reg,...ply,...sau];
  const pf=sum(all.map(s=>s.pf)), pa=sum(all.map(s=>s.pa)), n=all.length;
  const ppg = n? (pf/n):0, oppg = n? (pa/n):0;

  const ordered=[...games].sort(byDateDesc);
  let stType=null, stLen=0;
  for(const g of ordered){
    const r=sidesForTeam(g, team)?.result; if(!r) continue;
    if(stType===null){ stType=r; stLen=1; }
    else if(r===stType){ stLen++; }
    else break;
  }
  const streak = stType ? `${stType}${stLen>1?stLen:""}` : "—";

  const stat=(label,val)=>`<div class="stat"><div class="label">${label}</div><div class="value">${val}</div></div>`;
  grid.innerHTML = [
    stat('Reg Record', rec(reg)),
    stat('Reg Win %', pct(reg)),
    stat('Playoff Record', rec(ply)),
    stat('Playoff Win %', pct(ply)),
    stat('Saunders Record', rec(sau)),
    stat('Saunders Win %', pct(sau)),
    stat('PPG', ppg.toFixed(2)),
    stat('OPPG', oppg.toFixed(2)),
    stat('Games', n),
    stat('Streak', streak),
    stat('Avg. Margin', (ppg-oppg).toFixed(2)),
  ].join("");

  renderSeasonCallout(team);
}

/* ---- Season Callout + FX ---- */
function seasonSummaryLookup(team, season){ return seasonSummaries.find(r=>r.owner===team && +r.season===+season); }
function renderSeasonCallout(team){
  const callout=document.getElementById('seasonCallout'); if(!callout) return; callout.innerHTML="";
  if(team===ALL_TEAMS) return;
  if(selectedSeasons.size===1){
    const [onlySeason]=[...selectedSeasons];
    const rec=seasonSummaryLookup(team, onlySeason); if(!rec) return;

    // Trigger FX once per (team,season,outcome)
    const key = `${team}|${onlySeason}|${rec.champion?'C':''}${rec.saunders?'S':''}`;
    if (key !== lastEffectKey) {
      lastEffectKey = key;
      if (rec.champion) triggerCrownRain();
      else if (rec.saunders) triggerSaundersFog();
    }

    const bits=[];
    if(rec.champion) bits.push("🏆 Champion" + (champNote(team, onlySeason) ? "*" : ""));
    if(rec.bye) bits.push("🔥 Top-2 Seed");
    if(rec.saunders) bits.push("🪦 Saunders" + (saundersNote(team, onlySeason) ? "*" : ""));
    if(rec.playoff_wins||rec.playoff_losses||rec.playoff_ties) bits.push(`Playoffs: ${(rec.playoff_wins||0)}-${(rec.playoff_losses||0)}-${(rec.playoff_ties||0)}`);
    if(rec.saunders_wins||rec.saunders_losses||rec.saunders_ties) bits.push(`Saunders: ${(rec.saunders_wins||0)}-${(rec.saunders_losses||0)}-${(rec.saunders_ties||0)}`);
    const record=`${rec.wins}-${rec.losses}-${rec.ties||0}`;
    const pct=fmtPct(rec.wins, rec.losses, rec.ties||0);
    const finish = Number.isFinite(+rec.finish) ? `${rec.finish}` : "—";
    const notes=[];
    const cN=champNote(team, onlySeason); if(cN) notes.push(`${onlySeason} — ${cN}`);
    const sN=saundersNote(team, onlySeason); if(sN) notes.push(`${onlySeason} — ${sN}`);
    callout.innerHTML = `<div class="callout">
      <div>${team} in <strong>${onlySeason}</strong></div>
      <div>Record: <strong>${record}</strong> (${pct})</div>
      <div>Finish: <strong>${finish}</strong></div>
      <div>${bits.join(" • ")||"—"}</div>
      ${notes.length ? `<div class="muted" style="margin-top:6px;font-size:12px">* ${notes.join(" • ")}</div>` : ""}
    </div>`;
  } else {
    lastEffectKey = null; // reset when not a single-season view
  }
}

/* ---------- FUN FACTS, LUCK ---------- */
function isTwoWeek2014(g){
  // Exclude 2014 non-regular games (two-week playoffs that season) for high/low lists
  return (+g.season === 2014) && !isRegularGame(g);
}

function weekLabelFor(team, g){
  const wk = g._weekByTeam && g._weekByTeam[team];
  return wk ? `Wk ${wk} ${g.season}` : `${g.season}`;
}

// Build a flat list of single-week scoring rows across ALL teams/games,
// excluding 2014 double-week playoffs (reuse your existing isTwoWeek2014).
function leagueRowsSingleWeeks(){
  const rows = [];
  for (const g of leagueGames) {
    if (typeof isTwoWeek2014 === 'function' && isTwoWeek2014(g)) continue; // 2014 2-week playoff
    rows.push({ team: g.teamA, pf: g.scoreA, pa: g.scoreB, opp: g.teamB, date: g.date, season: Number(g.season || g.year) || null, g });
    rows.push({ team: g.teamB, pf: g.scoreB, pa: g.scoreA, opp: g.teamA, date: g.date, season: Number(g.season || g.year) || null, g });
  }
  return rows;
}

function topNWeeklyScoresAllTeams(n=5){
  return leagueRowsSingleWeeks()
    .sort((a,b)=> b.pf - a.pf || a.team.localeCompare(b.team))
    .slice(0, n);
}

function bottomNWeeklyScoresAllTeams(n=5){
  return leagueRowsSingleWeeks()
    .sort((a,b)=> a.pf - b.pf || a.team.localeCompare(b.team))
    .slice(0, n);
}

// Gather unique team names from leagueGames (A/B sides)
function teamsFromLeagueGames(){
  const set = new Set();
  for (const g of leagueGames) {
    if (g.teamA) set.add(g.teamA);
    if (g.teamB) set.add(g.teamB);
  }
  return Array.from(set).sort();
}

// Longest winning streaks across the league (no ties/losses included)






function longestWinStreaksAllTeams(n=5){
  const results = [];
  for (const team of teamsFromLeagueGames()) {
    const tg = leagueGames
      .map(g => ({ g, s: sidesForTeam(g, team) }))
      .filter(x => x.s)
      .sort((a,b)=> new Date(a.g.date) - new Date(b.g.date));

    let cur=0, best=0, start=null, bestStart=null, bestEnd=null;
    for (const {g,s} of tg) {
      if (s.result === 'W') {
        if (cur === 0) start = g.date;
        cur++;
        if (cur > best) { best = cur; bestStart = start; bestEnd = g.date; }
      } else {
        // ties & losses break the win streak
        cur = 0; start = null;
      }
    }
    if (best > 0) results.push({ team, len: best, start: bestStart, end: bestEnd });
  }
  return results
    .sort((a,b)=> b.len - a.len || a.team.localeCompare(b.team))
    .slice(0, n);
}
function longestWinStreaksGlobal(n=10){
  const runs = [];
  for (const team of teamsFromLeagueGames()){
    const tg = leagueGames
      .map(g => ({ g, s: sidesForTeam(g, team) }))
      .filter(x => x.s)
      .sort((a,b)=> new Date(a.g.date) - new Date(b.g.date));
    let cur = 0, start = null;
    for (let i=0;i<tg.length;i++){
      const {g,s} = tg[i];
      if (s.result === 'W'){
        if (cur===0) start = g.date;
        cur++;
      } else {
        if (cur>0){
          const endDate = tg[i-1].g.date;
          runs.push({ team, len: cur, start, end: endDate });
          cur=0; start=null;
        }
      }
    }
    if (cur>0){
      runs.push({ team, len: cur, start, end: tg[tg.length-1].g.date });
    }
  }
  return runs
    .sort((a,b)=> b.len - a.len || new Date(b.end)-new Date(a.end) || a.team.localeCompare(b.team))
    .slice(0, n);
}



function expectedWinForGame(team, g){
  // Use REGULAR-SEASON games on the same date/season; denominator = opponents that date
  if (!isRegularGame(g)) return null;
  const season = +g.season;
  const dayGames = leagueGames.filter(x => +x.season===season && x.date===g.date && isRegularGame(x));
  if (!dayGames.length) return null;

  // Collect all team-scores that date
  const scoreList = [];
  for(const x of dayGames){
    scoreList.push({ team:x.teamA, score:x.scoreA });
    scoreList.push({ team:x.teamB, score:x.scoreB });
  }

  const myScore = (g.teamA===team) ? g.scoreA : (g.teamB===team ? g.scoreB : null);
  if (myScore===null) return null;

  // Count how many below; ties get half-credit
  let below = 0, tied = 0, totalTeams = 0;
  for(const s of scoreList){
    if (s.team === team) continue;
    totalTeams++;
    if (s.score < myScore) below++;
    else if (s.score === myScore) tied++;
  }
  if (totalTeams<=0) return null;
  return (below + 0.5 * tied) / totalTeams;
}

function luckSummary(team, games){
  // Sum expected wins over all REGULAR games in the filtered set; compare to actual W
  const regGames = games.filter(g=> isRegularGame(g) && (g.teamA===team || g.teamB===team));
  let exp = 0, act = 0;
  for(const g of regGames){
    const s = sidesForTeam(g, team);
    const xw = expectedWinForGame(team, g);
    if (xw!==null) exp += xw;
    if (s && s.result==='W') act += 1;
    if (s && s.result==='T') act += 0.5; // give ties half-win in "actual"
  }
  return { exp, act, luck: act - exp };
}






/* ---------- League Summary Tables (All Teams) ---------- */
function renderLeagueSummaryTablesAllTeams(){
  const funLists = document.getElementById('funLists');
  const facts = document.getElementById('funFacts');
  if (!funLists || !facts) return;

  // Ensure container exists and sits between funFacts and funLists
  let box = document.getElementById('leagueSummary');
  if (!box){
    box = document.createElement('div');
    box.id = 'leagueSummary';
    box.className = 'fun-lists';
    facts.parentNode.insertBefore(box, funLists);
  }

  // Regular season aggregates per TEAM (across all seasons)
  const seasons = seasonAggregatesAllTeams();
  const regByTeam = new Map();
  for (const r of seasons){
    const t = r.team;
    const cur = regByTeam.get(t) || { team:t, w:0,l:0,t:0,n:0,pf:0,pa:0 };
    cur.w += r.w; cur.l += r.l; cur.t += r.t;
    cur.n += r.n; cur.pf += r.pf; cur.pa += r.pa;
    regByTeam.set(t, cur);
  }
  const regRows = Array.from(regByTeam.values()).map(r=>{
    const games = (r.w + r.l + r.t);
    const winPct = games ? (r.w + 0.5*r.t) / games : 0;
    const ppg = r.n ? (r.pf / r.n) : 0;
    const oppg = r.n ? (r.pa / r.n) : 0;
    return { team:r.team, rec:`${r.w}-${r.l}${r.t?'-'+r.t:''}`, pct: winPct, ppg, oppg };
  }).sort((a,b)=> b.pct - a.pct || b.ppg - a.ppg || a.team.localeCompare(b.team));

  // Postseason aggregates (Darling=main playoffs, Saunders=saunders tourney)
  const ss = Array.isArray(seasonSummaries) ? seasonSummaries : [];
  const postByTeam = new Map();
  for (const r of ss){
    const t = r.owner;
    const cur = postByTeam.get(t) || {
      team:t, dW:0,dL:0, byes:0, champs:0, dPF:0,dPA:0,dN:0,
      sW:0,sL:0, saundersTitles:0, sPF:0,sPA:0,sN:0
    };
    cur.dW += (r.playoff_wins||0); cur.dL += (r.playoff_losses||0);
    cur.byes += (r.bye?1:0);
    cur.champs += (r.champion?1:0);
    cur.sW += (r.saunders_wins||0); cur.sL += (r.saunders_losses||0);
    cur.saundersTitles += (r.saunders?1:0);
    postByTeam.set(t, cur);
  }
  // PPG from game log
  for (const g of leagueGames){
    const t = (g.type||'').toLowerCase();
    const mainPO = t && t!=='regular' && !t.includes('saunders');
    const saunders = t && t.includes('saunders');
    if (!mainPO && !saunders) continue;
    // A
    {
      const rec = postByTeam.get(g.teamA) || { team:g.teamA, dW:0,dL:0, byes:0, champs:0, dPF:0,dPA:0,dN:0, sW:0,sL:0, saundersTitles:0, sPF:0,sPA:0,sN:0 };
      if (mainPO){ rec.dPF += +g.scoreA; rec.dPA += +g.scoreB; rec.dN += 1; }
      else { rec.sPF += +g.scoreA; rec.sPA += +g.scoreB; rec.sN += 1; }
      postByTeam.set(g.teamA, rec);
    }
    // B
    {
      const rec = postByTeam.get(g.teamB) || { team:g.teamB, dW:0,dL:0, byes:0, champs:0, dPF:0,dPA:0,dN:0, sW:0,sL:0, saundersTitles:0, sPF:0,sPA:0,sN:0 };
      if (mainPO){ rec.dPF += +g.scoreB; rec.dPA += +g.scoreA; rec.dN += 1; }
      else { rec.sPF += +g.scoreB; rec.sPA += +g.scoreA; rec.sN += 1; }
      postByTeam.set(g.teamB, rec);
    }
  }
  const postRows = Array.from(postByTeam.values()).map(r=>{
    const dPPG = r.dN ? (r.dPF/r.dN) : 0;
    const dOPPG = r.dN ? (r.dPA/r.dN) : 0;
    const sPPG = r.sN ? (r.sPF/r.sN) : 0;
    const sOPPG = r.sN ? (r.sPA/r.sN) : 0;
    return {
      team:r.team,
      darlingRec: `${r.dW}-${r.dL}`,
      byes: r.byes,
      champs: r.champs,
      dPPG, dOPPG,
      saundersRec: `${r.sW}-${r.sL}`,
      saundersTitles: r.saundersTitles,
      sPPG, sOPPG
    };
  }).sort((a,b)=> b.champs - a.champs || b.dPPG - a.dPPG || a.team.localeCompare(b.team));

  const n = (x,d=2)=> Number.isFinite(+x) ? (+x).toFixed(d) : "—";

  const regTable = `
    <div class="mini">
      <div class="mini-title">Regular Season (All-Time)</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Record</th><th>Win%</th><th>PPG</th><th>OPPG</th></tr></thead>
          <tbody>${
            regRows.map(r => `<tr><td>${r.team}</td><td>${r.rec}</td><td>${n(r.pct*100,1)}%</td><td>${n(r.ppg,2)}</td><td>${n(r.oppg,2)}</td></tr>`).join("")
            || '<tr><td colspan="5" class="muted">—</td></tr>'
          }</tbody>
        </table>
      </div>
    </div>`;

  const postTable = `
    <div class="mini">
      <div class="mini-title">Post Season (All-Time)</div>
      <div class="table-wrap mini-table">
        <table>
          <thead>
            <tr>
              <th>Team</th><th>Darling Record</th><th>Byes</th><th>Championships</th>
              <th>Darling PPG</th><th>Darling Opp PPG</th>
              <th>Saunders Record</th><th>Saunders</th><th>Saunders PPG</th><th>Saunders Opp PPG</th>
            </tr>
          </thead>
          <tbody>${
            postRows.map(r => `<tr>
              <td>${r.team}</td><td>${r.darlingRec}</td><td>${r.byes}</td><td>${r.champs}</td>
              <td>${n(r.dPPG,2)}</td><td>${n(r.dOPPG,2)}</td>
              <td>${r.saundersRec}</td><td>${r.saundersTitles}</td>
              <td>${n(r.sPPG,2)}</td><td>${n(r.sOPPG,2)}</td>
            </tr>`).join("") || '<tr><td colspan="10" class="muted">—</td></tr>'
          }</tbody>
        </table>
      </div>
    </div>`;

  const finishByTeam = new Map();
  for (const r of ss){
    if (!Number.isFinite(+r.finish)) continue;
    const cur = finishByTeam.get(r.owner) || { team:r.owner, sum:0, n:0 };
    cur.sum += +r.finish; cur.n += 1;
    finishByTeam.set(r.owner, cur);
  }
  const finishRows = Array.from(finishByTeam.values())
    .map(r=>({ team:r.team, avg: r.n ? (r.sum/r.n) : null, n:r.n }))
    .sort((a,b)=> (a.avg ?? Infinity) - (b.avg ?? Infinity) || b.n - a.n || a.team.localeCompare(b.team));

  const finishTable = `
    <div class="mini">
      <div class="mini-title">Average Finish (All-Time)</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Avg Finish</th><th>Seasons</th></tr></thead>
          <tbody>${
            finishRows.map(r => `<tr><td>${r.team}</td><td>${n(r.avg,2)}</td><td>${r.n}</td></tr>`).join("")
            || '<tr><td colspan="3" class="muted">—</td></tr>'
          }</tbody>
        </table>
      </div>
    </div>`;

  box.innerHTML = regTable + postTable + finishTable;
}
function renderFunFactsAllTeams(){
  const el = document.getElementById('funFacts');
  if (!el) return;

  const seasons = seasonAggregatesAllTeams();
  const minGames = 8;

  const valid = seasons.filter(r => r.n >= minGames);
  const bestRec = valid.slice().sort((a,b)=> b.pct - a.pct || b.w - a.w)[0] || null;
  const worstRec = valid.slice().sort((a,b)=> a.pct - b.pct || a.w - b.w)[0] || null;

  const bestDiff = valid.slice().sort((a,b)=> (b.diff - a.diff) || b.season - a.season)[0] || null;
  const worstDiff = valid.slice().sort((a,b)=> (a.diff - b.diff) || a.season - b.season)[0] || null;

  const winStk = (typeof longestWinStreaksAllTeams==='function' && longestWinStreaksAllTeams(1)[0]) || null;
  const loseStk = (typeof longestLosingStreaksAllTeams==='function' && longestLosingStreaksAllTeams(1)[0]) || null;

  const pairRows = headToHeadPairs(5).sort((a,b)=> b.pct - a.pct || b.g - a.g);
  const bestVs = pairRows[0] || null;

  const top = topNWeeklyScoresAllTeams(1)[0] || null;

  const fmtRec = (r) => r ? `${r.w}-${r.l}${r.t?'-'+r.t:''}` : '—';
  const nfmt = (x, d=2) => Number.isFinite(+x) ? (+x).toFixed(d) : "—";

  const tile = (label, val, sub="") => `
    <div class="stat">
      <div class="label">${label}</div>
      <div class="value">${val}</div>
      ${sub ? `<div class="label" style="margin-top:4px">${sub}</div>` : ""}
    </div>
  `;

  el.innerHTML = [
    tile("Best Single-Season Record", bestRec ? `${fmtRec(bestRec)}` : "—", bestRec ? `${bestRec.team} • ${bestRec.season} • ${nfmt(bestRec.pct*100,1)}%` : ""),
    tile("Worst Single-Season Record", worstRec ? `${fmtRec(worstRec)}` : "—", worstRec ? `${worstRec.team} • ${worstRec.season} • ${nfmt(worstRec.pct*100,1)}%` : ""),
    tile("Best Season Point Diff",
         bestDiff ? `${(+bestDiff.diff>=0?"+":"")}${nfmt(bestDiff.diff, 0)}` : "—",
         bestDiff ? `${bestDiff.team} • ${bestDiff.season} • PF ${nfmt(bestDiff.pf,0)} / PA ${nfmt(bestDiff.pa,0)}` : ""),
    tile("Worst Season Point Diff",
         worstDiff ? `${(+worstDiff.diff>=0?"+":"")}${nfmt(worstDiff.diff, 0)}` : "—",
         worstDiff ? `${worstDiff.team} • ${worstDiff.season} • PF ${nfmt(worstDiff.pf,0)} / PA ${nfmt(worstDiff.pa,0)}` : ""),
    tile("Longest Winning Streak",
         winStk ? `${winStk.len}` : "—",
         winStk ? `${winStk.team} (${winStk.start} → ${winStk.end})` : ""),
    tile("Longest Losing Streak",
         loseStk ? `${loseStk.len}` : "—",
         loseStk ? `${loseStk.team} (${loseStk.start} → ${loseStk.end})` : ""),
    tile("Best Record vs Single Opponent",
         bestVs ? `${nfmt(bestVs.pct*100, 1)}%` : "—",
         bestVs ? `${bestVs.team} vs ${bestVs.opp} • ${bestVs.w}-${bestVs.l}${bestVs.t?'-'+bestVs.t:''} (${bestVs.g} gms)` : ""),
    tile("Highest Scoring Single Game",
         top ? `${nfmt(top.pf, 2)}` : "—",
         top ? `${top.team} vs ${top.opp} (${top.date})` : "")
  ].join("");
}




function renderFunListsAllTeams(){
  const el = document.getElementById('funLists');
  if (!el) return;

  // Core datasets
  const highs   = topNWeeklyScoresAllTeams(10);
  const lows    = bottomNWeeklyScoresAllTeams(10);
  const streaks = longestWinStreaksGlobal(10);
  const streaksLoss = longestLosingStreaksGlobal(10);
  
  // === Added datasets for two minis ===
  // Most Consecutive Weeks Not Lowest (regular season only)
  const _nl_weekScores = new Map();
  for (const g of leagueGames){
    if (!isRegularGame(g)) continue;
    const d = g.date;
    if (!_nl_weekScores.has(d)) _nl_weekScores.set(d, []);
    _nl_weekScores.get(d).push({ team:g.teamA, score:+g.scoreA });
    _nl_weekScores.get(d).push({ team:g.teamB, score:+g.scoreB });
  }
  const _nl_dates = Array.from(_nl_weekScores.keys()).sort((a,b)=> a.localeCompare(b));
  const _nl_lowestByDate = new Map();
  for (const d of _nl_dates){
    const arr = _nl_weekScores.get(d) || [];
    if (!arr.length){ _nl_lowestByDate.set(d, new Set()); continue; }
    const min = Math.min(...arr.map(x=>x.score));
    const lows = new Set(arr.filter(x=> x.score===min).map(x=> x.team));
    _nl_lowestByDate.set(d, lows);
  }
  const _nl_teams = new Set(); for (const g of leagueGames){ _nl_teams.add(g.teamA); _nl_teams.add(g.teamB); }
  const _nl_runs = [];
  for (const team of _nl_teams){
    let cur=0, start=null;
    for (let i=0;i<_nl_dates.length;i++){
      const d = _nl_dates[i];
      const arr = _nl_weekScores.get(d) || [];
      const played = arr.some(x=> x.team===team);
      if (!played) continue;
      const isLow = _nl_lowestByDate.get(d)?.has(team);
      if (!isLow){
        if (cur===0) start = d;
        cur++;
      } else if (cur>0){
        const endDate = _nl_dates[i-1] || d;
        _nl_runs.push({ team, len:cur, start, end:endDate });
        cur=0; start=null;
      }
    }
    if (cur>0) _nl_runs.push({ team, len:cur, start, end:_nl_dates[_nl_dates.length-1] });
  }
  const topNoLows = _nl_runs.sort((a,b)=> b.len - a.len || new Date(b.end)-new Date(a.end) || a.team.localeCompare(b.team)).slice(0,10);
  const rowNoLow = (r)=> `<tr><td>${r.len}</td><td>${r.team}</td><td>${r.start} → ${r.end}</td></tr>`;

  // Most Rival Wins (overall)
  const _rv_wins = new Map(), _rv_losses = new Map();
  for (const g of leagueGames){
    const a=g.teamA, b=g.teamB, sa=+g.scoreA, sb=+g.scoreB;
    if (sa!==sb){
      const awin = sa>sb;
      const keyAB = `${a}|${b}`, keyBA = `${b}|${a}`;
      if (awin){ _rv_wins.set(keyAB, (_rv_wins.get(keyAB)||0)+1); _rv_losses.set(keyBA, (_rv_losses.get(keyBA)||0)+1); }
      else     { _rv_wins.set(keyBA, (_rv_wins.get(keyBA)||0)+1); _rv_losses.set(keyAB, (_rv_losses.get(keyAB)||0)+1); }
    }
  }
  const _rv_allTeams = Array.from(_nl_teams);
  const _rv_bestPairs = [];
  for (const t of _rv_allTeams){
    let bestOpp=null, bestW=0, bestRec={w:0,l:0};
    for (const o of _rv_allTeams){
      if (o===t) continue;
      const w = _rv_wins.get(`${t}|${o}`)||0;
      const l = _rv_losses.get(`${t}|${o}`)||0;
      const curPct = (w/(w+l||1));
      const bestPct = (bestRec.w/(bestRec.w+bestRec.l||1));
      if (w>bestW || (w===bestW && curPct>bestPct)){
        bestW = w; bestOpp=o; bestRec={w,l};
      }
    }
    if (bestOpp) _rv_bestPairs.push({ team:t, opp:bestOpp, wins:bestRec.w, losses:bestRec.l });
  }
  const topRivals = _rv_bestPairs.sort((a,b)=> b.wins - a.wins || (a.team+a.opp).localeCompare(b.team+b.opp)).slice(0,10);
  const rowRival = (r)=> `<tr><td>${r.wins}</td><td>${r.team}</td><td>${r.opp}</td><td>${r.wins}-${r.losses}</td></tr>`;
const seasons = seasonAggregatesAllTeams();
  // Luckiest/Unluckiest Seasons (min games = 8)
  const luckPool = seasons.filter(r => r.n >= 8 && Number.isFinite(+r.luck));
  const luckiestSeasons = [...luckPool]
    .sort((a,b)=> b.luck - a.luck || b.season - a.season)
    .slice(0,10);
  const unluckiestSeasons = [...luckPool]
    .sort((a,b)=> a.luck - b.luck || a.season - b.season)
    .slice(0,10);
  const rowLuckSeason = (r) => `<tr><td>${r.team}</td><td>${r.season}</td><td>${Number.isFinite(+r.luck)?(+r.luck).toFixed(2):'—'}</td></tr>`;
  // Best/Worst Regular Seasons by record (min games = 8)
  const validSeasons = seasons.filter(r => r.n >= 8);
  const bestSeasonsByRec = [...validSeasons]
    .sort((a,b)=> b.pct - a.pct || b.w - a.w || a.l - b.l || b.season - a.season)
    .slice(0,10);
  const worstSeasonsByRec = [...validSeasons]
    .sort((a,b)=> a.pct - b.pct || a.w - b.w || b.l - a.l || a.season - b.season)
    .slice(0,10);
  const rowRec = (r) => `<tr><td>${r.team}</td><td>${r.season}</td><td>${r.w}-${r.l}${r.t?'-'+r.t:''}</td></tr>`;

  
  // number formatter: up to 2 decimals, trim zeros; keep trailing dot for integers
  const s2 = (x)=>{
    const s = (+x).toFixed(2);
    const t = s.replace(/\.0+$/,'').replace(/(\.\d*[1-9])0$/,'$1');
    return t.includes('.') ? t : t + '.';
  };

  // Highest Combined Points in a Game (Regular season)
  const combinedGames = [];
  for (const g of leagueGames){
    if (!isRegularGame(g)) continue;
    const total = (+g.scoreA) + (+g.scoreB);
    combinedGames.push({ teamA:g.teamA, teamB:g.teamB, total, scoreA:+g.scoreA, scoreB:+g.scoreB, date:g.date });
  }
  const topCombined = combinedGames.sort((a,b)=> b.total - a.total || a.date.localeCompare(b.date)).slice(0,10);
  const rowCombined = (r)=> `<tr><td>${s2(r.total)}</td><td>${s2(r.scoreA)}–${s2(r.scoreB)}</td><td>${r.teamA} vs ${r.teamB}</td><td>${r.date}</td></tr>`;
// Local helpers
  const n = (x,d=2)=> Number.isFinite(+x) ? (+x).toFixed(d) : "—";
  const isPlayoff = (g)=> {
    const t = (g.type||'').toLowerCase();
    return t && t!=='regular' && !t.includes('saunders');
  };

  // Row renderers for existing tables
  const rowHigh = (r) => `<tr><td>${s2(r.pf)}–${s2(r.pa)}</td><td>${r.team} vs ${r.opp}</td><td>${r.date}</td></tr>`;
  const rowLow  = (r) => `<tr><td>${s2(r.pf)}–${s2(r.pa)}</td><td>${r.team} vs ${r.opp}</td><td>${r.date}</td></tr>`;
  const rowStk  = (r) => `<tr><td>${r.len}</td><td>${r.team}</td><td>${r.start} → ${r.end}</td></tr>`;

    // Unluckiest/Luckiest Games (Regular season only)
  const mostPtsInLoss = [];
  const fewestPtsInWin = [];
  for (const g of leagueGames){
    if (!isRegularGame(g)) continue;
    const aWins = g.scoreA > g.scoreB;
    const bWins = g.scoreB > g.scoreA;
    if (aWins){
      fewestPtsInWin.push({ winner:g.teamA, loser:g.teamB, wScore:+g.scoreA, lScore:+g.scoreB, date:g.date });
      mostPtsInLoss.push({ winner:g.teamA, loser:g.teamB, wScore:+g.scoreA, lScore:+g.scoreB, date:g.date });
    } else if (bWins){
      fewestPtsInWin.push({ winner:g.teamB, loser:g.teamA, wScore:+g.scoreB, lScore:+g.scoreA, date:g.date });
      mostPtsInLoss.push({ winner:g.teamB, loser:g.teamA, wScore:+g.scoreB, lScore:+g.scoreA, date:g.date });
    }
  }
  const topUnluckyGames = mostPtsInLoss
    .sort((a,b)=> b.lScore - a.lScore || a.date.localeCompare(b.date))
    .slice(0,10);
  const topLuckyGames   = fewestPtsInWin
    .sort((a,b)=> a.wScore - b.wScore || a.date.localeCompare(b.date))
    .slice(0,10);
  const rowLuckGameLoss = (r)=> `<tr><td>${s2(r.wScore)}–${s2(r.lScore)}</td><td>${r.winner} vs ${r.loser}</td><td>${r.date}</td></tr>`;
  const rowLuckGameWin  = (r)=> `<tr><td>${s2(r.wScore)}–${s2(r.lScore)}</td><td>${r.winner} vs ${r.loser}</td><td>${r.date}</td></tr>`;
// --- Highest Scoring Regular Seasons (PPG) ---
  const mostPPG = [...seasons].sort((a,b)=> b.ppg - a.ppg || b.season - a.season).slice(0,10);
  const rowPPG = (r) => `<tr><td>${r.team}</td><td>${r.season}</td><td>${n(r.ppg,2)}</td><td>${r.n}</td></tr>`;

  // --- OPPG lists (points allowed per game) ---
  const byOPPG_Desc = [...seasons].sort((a,b)=> b.oppg - a.oppg || b.season - a.season).slice(0,10);
  const byOPPG_Asc  = [...seasons].sort((a,b)=> a.oppg - b.oppg || a.season - b.season).slice(0,10);
  const rowOPPG = (r) => `<tr><td>${r.team}</td><td>${r.season}</td><td>${n(r.oppg,2)}</td><td>${r.n}</td></tr>`;

  // --- Weekly awards & 150+ ---
  const wa = weeklyAwards();
  const topW = wa.top.sort((a,b)=> b.count - a.count || a.team.localeCompare(b.team)).slice(0,10);
  const lowW = wa.low.sort((a,b)=> b.count - a.count || a.team.localeCompare(b.team)).slice(0,10);
  const high150 = wa.high150.sort((a,b)=> b.count - a.count || a.team.localeCompare(b.team)).slice(0,10);
  const rowCount = (r) => `<tr><td>${r.team}</td><td>${r.count}</td></tr>`;

  // --- Sub-65 games (regular season only) ---
  const sub65 = sub65GamesPerTeam(70).sort((a,b)=> b.count - a.count || a.team.localeCompare(b.team)).slice(0,10);

  // --- Playoff-only datasets ---
  const playoffSingles = []; // single-team scoring rows
  const playoffMargins = []; // per-game blowouts
  const avgMarginBySeason = new Map(); // team|season -> {team, season, sum, games}

  // Champions set for "avg margin" table (championship seasons only)
  const champions = new Set();
  if (Array.isArray(seasonSummaries)){
    for (const r of seasonSummaries){ if (r.champion) champions.add(`${r.owner}|${r.season}`); }
  }

  for (const g of leagueGames){
    if (!isPlayoff(g)) continue;
    if (typeof isTwoWeek2014 === 'function' && isTwoWeek2014(g)) continue;

    // Highest scoring playoff games (single-team)
    playoffSingles.push({ team: g.teamA, opp: g.teamB, pf: +g.scoreA, oppf: +g.scoreB, date: g.date, season:+g.season });
    playoffSingles.push({ team: g.teamB, opp: g.teamA, pf: +g.scoreB, oppf: +g.scoreA, date: g.date, season:+g.season });

    // Biggest playoff blowouts (winner margin)
    const aWins = g.scoreA > g.scoreB;
    const bWins = g.scoreB > g.scoreA;
    if (aWins || bWins){
      const winner = aWins ? g.teamA : g.teamB;
      const loser  = aWins ? g.teamB : g.teamA;
      const wScore = aWins ? +g.scoreA : +g.scoreB;
      const lScore = aWins ? +g.scoreB : +g.scoreA;
      const margin = wScore - lScore;
      playoffMargins.push({ winner, loser, margin, date:g.date, season:+g.season, wScore, lScore });
    }

    // Biggest Avg Playoff Point Diff — Championship Seasons (all playoff games)
    const season = +g.season;
    const keyA = `${g.teamA}|${season}`;
    if (champions.has(keyA)){
      const curA = avgMarginBySeason.get(keyA) || { team:g.teamA, season, sum:0, games:0 };
      curA.sum += (+g.scoreA - +g.scoreB); curA.games += 1; avgMarginBySeason.set(keyA, curA);
    }
    const keyB = `${g.teamB}|${season}`;
    if (champions.has(keyB)){
      const curB = avgMarginBySeason.get(keyB) || { team:g.teamB, season, sum:0, games:0 };
      curB.sum += (+g.scoreB - +g.scoreA); curB.games += 1; avgMarginBySeason.set(keyB, curB);
    }
  }

  const topPlayoffSingles = playoffSingles.sort((a,b)=> b.pf - a.pf || b.season - a.season).slice(0,10);
  const topPlayoffBlowouts = playoffMargins.sort((a,b)=> b.margin - a.margin || b.season - a.season).slice(0,10);
  const topAvgWinDiff = Array.from(avgMarginBySeason.values())
    .map(r => ({...r, avg: r.games ? (r.sum/r.games) : 0}))
    .sort((a,b)=> b.avg - a.avg || b.season - a.season)
    .slice(0,10);

  const rowPOHigh = (r)=> `<tr><td>${s2(r.pf)}–${s2(r.oppf ?? 0)}</td><td>${r.team} vs ${r.opp}</td><td>${r.date}</td></tr>`;
  const rowPOBlow = (r)=> `<tr><td>${s2(r.margin)}</td><td>${s2(r.wScore)}–${s2(r.lScore)}</td><td>${r.winner} vs ${r.loser}</td><td>${r.date}</td></tr>`;
  const rowAvgPO  = (r)=> `<tr><td>${r.team}</td><td>${r.season}</td><td>${n(r.avg,2)}</td><td>${r.games}</td></tr>`;

  el.innerHTML = `




    
    <div class="mini">
      <div class="mini-title">Best Regular Seasons</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Season</th><th>Record</th></tr></thead>
          <tbody>${bestSeasonsByRec.map(rowRec).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Worst Regular Seasons</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Season</th><th>Record</th></tr></thead>
          <tbody>${worstSeasonsByRec.map(rowRec).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>


<div class="mini">
      <div class="mini-title">Highest Scoring Regular Seasons</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Season</th><th>PPG</th><th>G</th></tr></thead>
          <tbody>${mostPPG.map(rowPPG).join("") || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Most Dominant Playoff Runs</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Season</th><th>Avg Margin</th><th>PO Games</th></tr></thead>
          <tbody>${topAvgWinDiff.map(rowAvgPO).join("") || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Highest Scoring Performances</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Score</th><th>Matchup</th><th>Date</th></tr></thead>
          <tbody>${highs.map(rowHigh).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>


    <div class="mini">
      <div class="mini-title">Lowest Scoring Performances</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Score</th><th>Matchup</th><th>Date</th></tr></thead>
          <tbody>${lows.map(rowLow).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>


    <div class="mini">
      <div class="mini-title">Longest Winning Streaks</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Length</th><th>Team</th><th>Range</th></tr></thead>
          <tbody>${streaks.map(rowStk).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div class="mini">
      <div class="mini-title">Longest Losing Streaks</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Length</th><th>Team</th><th>Range</th></tr></thead>
          <tbody>${streaksLoss.map(r => `<tr><td>${r.len}</td><td>${r.team}</td><td>${r.start} → ${r.end}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>



    <div class="mini">
      <div class="mini-title">Most PPG Allowed</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Season</th><th>OPPG</th><th>G</th></tr></thead>
          <tbody>${byOPPG_Desc.map(rowOPPG).join("") || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Fewest PPG Allowed</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Season</th><th>OPPG</th><th>G</th></tr></thead>
          <tbody>${byOPPG_Asc.map(rowOPPG).join("") || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>


    <div class="mini">
      <div class="mini-title">Most Dominant Rivalries</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Opponent</th><th>Win %</th><th>Record (G)</th></tr></thead>
          <tbody>${headToHeadPairs(5).sort((a,b)=> b.pct - a.pct || b.g - a.g).slice(0,10).map(r => 
            `<tr><td>${r.team}</td><td>${r.opp}</td><td>${n(r.pct*100,1)}%</td><td>${r.w}-${r.l}${r.t?'-'+r.t:''} (${r.g})</td></tr>`
          ).join("") || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>


    <div class="mini">
      <div class="mini-title">Most Weekly Top Scores</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Awards</th></tr></thead>
          <tbody>${topW.map(rowCount).join("") || '<tr><td colspan="2" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Most Weekly Bottom Scores</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Awards</th></tr></thead>
          <tbody>${lowW.map(rowCount).join("") || '<tr><td colspan="2" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Most 150+ Point Games</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Games</th></tr></thead>
          <tbody>${high150.map(rowCount).join("") || '<tr><td colspan="2" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Most Sub-70 Point Games</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Games</th></tr></thead>
          <tbody>${sub65.map(rowCount).join("") || '<tr><td colspan="2" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>


    <div class="mini">
      <div class="mini-title">Best Playoff Performances</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Score</th><th>Matchup</th><th>Date</th></tr></thead>
          <tbody>${topPlayoffSingles.map(rowPOHigh).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Biggest Playoff Blowouts</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Margin</th><th>Score</th><th>Matchup</th><th>Date</th></tr></thead>
          <tbody>${topPlayoffBlowouts.map(rowPOBlow).join("") || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Lowest Scoring Wins</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Score</th><th>Matchup</th><th>Date</th></tr></thead>
          <tbody>${topLuckyGames.map(rowLuckGameWin).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Highest Scoring Losses</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Score</th><th>Matchup</th><th>Date</th></tr></thead>
          <tbody>${topUnluckyGames.map(rowLuckGameLoss).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Most Combined Points</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Points</th><th>Score</th><th>Matchup</th><th>Date</th></tr></thead>
          <tbody>${topCombined.map(rowCombined).join("") || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Luckiest Regular Seasons</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Season</th><th>Luck</th></tr></thead>
          <tbody>${luckiestSeasons.map(rowLuckSeason).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="mini">
      <div class="mini-title">Unluckiest Regular Seasons</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Team</th><th>Season</th><th>Luck</th></tr></thead>
          <tbody>${unluckiestSeasons.map(rowLuckSeason).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>

  

`;

  // Append two new minis safely (outside the main template string)
  const __miniNoLow = `
    <div class="mini">
      <div class="mini-title">Most Consecutive Weeks Not Lowest</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Length</th><th>Team</th><th>Range</th></tr></thead>
          <tbody>${topNoLows.map(rowNoLow).join("") || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  const __miniRivals = `
    <div class="mini">
      <div class="mini-title">Most Rival Wins</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Wins</th><th>Team</th><th>Opponent</th><th>Record</th></tr></thead>
          <tbody>${topRivals.map(rowRival).join("") || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  el.innerHTML += __miniNoLow + __miniRivals;

}
function renderFunFacts(team, games){
  if (team === ALL_TEAMS) { renderFunFactsAllTeams(); renderLeagueSummaryTablesAllTeams(); renderFunListsAllTeams(); return; }
  const box = document.getElementById('funFacts');
  const lists = document.getElementById('funLists');
  if(!box || !lists) return;

  

  let hi = null;
  let blow = null;
  let loss = null;

  const perGame = [];
  const orderedAsc = games.slice().sort(byDateAsc);

  let lwLen=0, llLen=0;
  let curType=null, curLen=0, curStart=null, curEnd=null;
  let lwStart=null, lwEnd=null, llStart=null, llEnd=null;

  function finalizeCurrent(){
    if(!curType || curLen<=0) return;
    if(curType==='W' && curLen>lwLen){ lwLen=curLen; lwStart=curStart; lwEnd=curEnd; }
    if(curType==='L' && curLen>llLen){ llLen=curLen; llStart=curStart; llEnd=curEnd; }
  }

  for(const g of orderedAsc){
    const s = sidesForTeam(g, team); if(!s) continue;

    if(!isTwoWeek2014(g) && (!hi || s.pf > hi.pf)) hi = { pf:s.pf, pa:s.pa, date:g.date, opp:s.opp };

    if(s.result==='W'){
      const margin = s.pf - s.pa;
      if(!blow || margin > blow.margin) blow = { margin, date:g.date, opp:s.opp, pf:s.pf, pa:s.pa };
    }
    if(s.result==='L'){
      const margin = s.pa - s.pf;
      if(!loss || margin > loss.margin) loss = { margin, date:g.date, opp:s.opp, pf:s.pf, pa:s.pa };
    }

    if(!isTwoWeek2014(g)){
      perGame.push({
        pf:s.pf, pa:s.pa, date:g.date, opp:s.opp, season:+g.season, type:normType(g.type), g
      });
    }

    if(s.result==='T'){
      finalizeCurrent();
      curType=null; curLen=0; curStart=null; curEnd=null;
    }else{
      if(curType===s.result){
        curLen++; curEnd=g;
      }else{
        finalizeCurrent();
        curType=s.result; curLen=1; curStart=g; curEnd=g;
      }
    }
  }
  finalizeCurrent();

  const hi5 = perGame.slice().sort((a,b)=> b.pf - a.pf || new Date(b.date)-new Date(a.date)).slice(0,5);
  const lo5 = perGame.slice().sort((a,b)=> a.pf - b.pf || new Date(a.date)-new Date(b.date)).slice(0,5);

  const { exp, act, luck } = luckSummary(team, games);

  let crowns = 0, turds = 0;
  const datesPlayed = unique(orderedAsc.map(g=> (sidesForTeam(g,team)? g.date : null)).filter(Boolean));
  for(const d of datesPlayed){
    const dayGames = leagueGames.filter(x=>x.date===d);
    if(dayGames.some(isTwoWeek2014)) continue; // skip 2014 double-weeks
    const maxScore = Math.max(...dayGames.flatMap(x=>[x.scoreA, x.scoreB]));
    const minScore = Math.min(...dayGames.flatMap(x=>[x.scoreA, x.scoreB]));
    const meGame = orderedAsc.find(x=>x.date===d && sidesForTeam(x,team));
    const meScore = meGame ? (meGame.teamA===team ? meGame.scoreA : meGame.scoreB) : -Infinity;
    if(meScore === maxScore) crowns++;
    if(meScore === minScore) turds++;
  }

  let closeW=0, closeL=0, closeT=0, blowouts=0;
  for(const g of orderedAsc){
    const s = sidesForTeam(g, team); if(!s) continue;
    const margin = Math.abs(s.pf - s.pa);
    if(margin < 5){
      if(s.result==='W') closeW++;
      else if(s.result==='L') closeL++;
      else closeT++;
    }
    if(s.result==='W' && (s.pf - s.pa) >= 29) blowouts++;
  }

  const teamSeasons = seasonAggregatesAllTeams().filter(r=>r.team===team && r.n>0 && +r.season !== 2014);
  const bestPPG = teamSeasons.slice().sort((a,b)=> b.ppg - a.ppg || b.season - a.season)[0] || null;
  const bestOPPG = teamSeasons.slice().sort((a,b)=> a.oppg - b.oppg || b.season - a.season)[0] || null;

  let blowoutLosses=0;
  let high150=0;
  for(const g of orderedAsc){
    const s = sidesForTeam(g, team); if(!s) continue;
    if(s.result==='L' && (s.pa - s.pf) >= 29) blowoutLosses++;
    if(s.pf >= 150) high150++;
  }

  const byeYears = seasonSummaries.filter(r=>r.owner===team && r.bye).map(r=>r.season).sort((a,b)=>b-a);
  const antiByeYears = seasonSummaries.filter(r=>r.owner===team && r.saunders_bye).map(r=>r.season).sort((a,b)=>b-a);

  const tile=(label,val,sub="")=>`<div class="stat"><div class="label">${label}</div><div class="value">${val}</div>${sub?`<div class="label" style="margin-top:4px">${sub}</div>`:""}</div>`;
  const lwSub = lwLen>0 && lwStart && lwEnd ? `${lwStart.date} → ${lwEnd.date} (${weekLabelFor(team,lwStart)} → ${weekLabelFor(team,lwEnd)})` : "";
  const llSub = llLen>0 && llStart && llEnd ? `${llStart.date} → ${llEnd.date} (${weekLabelFor(team,llStart)} → ${weekLabelFor(team,llEnd)})` : "";

  box.innerHTML = [
    tile("Highest Score", hi? hi.pf.toFixed(2) : "—", hi? `${hi.date} vs ${hi.opp} (${hi.pa.toFixed(2)} allowed)`:""),
    tile("Biggest Blowout", blow? `+${blow.margin.toFixed(2)}`:"—", blow? `${blow.date} vs ${blow.opp} (${blow.pf.toFixed(2)}–${blow.pa.toFixed(2)})`:""),
    tile("Biggest Loss", loss? `-${loss.margin.toFixed(2)}`:"—", loss? `${loss.date} vs ${loss.opp} (${loss.pf.toFixed(2)}–${loss.pa.toFixed(2)})`:""),
    tile("Longest Win Streak", lwLen || 0, lwSub || "—"),
    tile("Longest Losing Streak", llLen || 0, llSub || "—"),
    tile("Top-Week Crowns", crowns || 0, crowns? "Led league in points on those dates":""),
    tile("Bottom-Week Turds", turds || 0, turds? "Lowest score league-wide on those dates":""),
    tile("Close Games Record (<5)", `${closeW}-${closeL}${closeT?`-${closeT}`:""}`, (closeW+closeL+closeT) ? `${closeW+closeL+closeT} games` : "—"),
    tile("Most PPG Season", bestPPG ? nfmt(bestPPG.ppg, 2) : "—", bestPPG ? `${bestPPG.season}` : "—"),
    tile("Lowest OPPG Season", bestOPPG ? nfmt(bestOPPG.oppg, 2) : "—", bestOPPG ? `${bestOPPG.season}` : "—"),
    tile("Blowout Wins (29+)", blowouts, blowouts ? "Wins by 29+ points" : "—"),
    tile("Blowout Losses (29+)", blowoutLosses, blowoutLosses ? "Losses by 29+ points" : "—"),
    tile("150+ Point Games", high150, high150 ? "Single-team scores ≥150" : "—"),
    tile("Luck (Actual − Expected)", luck ? (luck>0?`+${luck.toFixed(2)}`:luck.toFixed(2)) : (luck===0 ? "0.00" : "—"),
         (Number.isFinite(exp) ? `Actual: ${act.toFixed(2)} • Expected: ${exp.toFixed(2)} (regular season only)` : "—")),
    tile("Byes", byeYears.length, byeYears.length ? `Years: ${byeYears.join(", ")}` : "—"),
    tile("Anti-Byes", antiByeYears.length, antiByeYears.length ? `Years: ${antiByeYears.join(", ")}` : "—")
  ].join("");

  const row = (r)=>`<tr>
    <td>${nfmt(r?.pf, 2)} – ${r.pa.toFixed(2)}</td>
    <td>${r.opp}</td>
    <td>${r.date}</td>
  </tr>`;

  lists.innerHTML = `
    <div class="mini">
      <div class="mini-title">Top 5 Highest Scoring Games</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Score</th><th>Opponent</th><th>Date</th></tr></thead>
          <tbody>${hi5.map(row).join("") || `<tr><td colspan="3" class="muted">—</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <div class="mini">
      <div class="mini-title">Bottom 5 Lowest Scoring Games</div>
      <div class="table-wrap mini-table">
        <table>
          <thead><tr><th>Score</th><th>Opponent</th><th>Date</th></tr></thead>
          <tbody>${lo5.map(row).join("") || `<tr><td colspan="3" class="muted">—</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ---- Opponent/Team Breakdown (+ rivalry callouts) ---- */

function renderOppBreakdown(team, games){
  const titleEl=document.getElementById('oppTableTitle');
  const firstCol=document.getElementById('oppFirstCol');
  const tb=document.querySelector('#oppTable tbody'); if(!tb) return;

  const calloutsBox=document.getElementById('rivalGroupCallouts');
  if(calloutsBox) calloutsBox.innerHTML="";

  const rivalList = (typeof rivalries !== 'undefined' && Array.isArray(rivalries)) ? rivalries : [];

  // Subset match (stats only)
  const groupMatched=(members,selfTeam=null)=>{
    const selOppLower=new Set([...selectedOpponents].map(s=>s.toLowerCase()));
    const memExSelf=(selfTeam?members.filter(m=>m!==selfTeam):members.slice()).map(m=>m.toLowerCase());
    if(memExSelf.length===0) return false;
    return memExSelf.every(m=>selOppLower.has(m));
  };

  // Exact set match (FX/background) — selection must equal members (minus self in single-team mode)
  const exactSetMatch=(members,selfTeam=null)=>{
    const selSet=new Set([...selectedOpponents].map(s=>s.toLowerCase()));
    const memExSelf=selfTeam?members.filter(m=>m!==selfTeam):members.slice();
    const groupSet=new Set(memExSelf.map(m=>m.toLowerCase()));
    if(selSet.size!==groupSet.size) return false;
    for(const m of groupSet){ if(!selSet.has(m)) return false; }
    return true;
  };

  // Treat certain pairs as "groups" for FX/backdrop if they have slugs
  const isFxEligible=(r)=>{
    const t=(r.type||"group").toLowerCase();
    return t==="group" || (t==="pair" && r.slug && (r.slug==="nuss-rishi" || r.slug==="singer-nuss"));
  };

  // Helper to set/clear persistent backdrop
  const setBackdrop = (slug) => {
    if (window.setGroupBackdrop) {
      try { window.setGroupBackdrop(slug||null); } catch(e){}
    }
  };

  if(team===ALL_TEAMS){
    titleEl.textContent="Team Breakdown";
    firstCol.textContent="Team";

    const map=new Map();
    const useWeek = (typeof isRestrictive === 'function') ? isRestrictive(selectedWeeks, universe.weeks) : false;

    for(const g of games){
      const sides=[
        { team:g.teamA, pf:g.scoreA, pa:g.scoreB, win:g.scoreA>g.scoreB, tie:g.scoreA===g.scoreB },
        { team:g.teamB, pf:g.scoreB, pa:g.scoreA, win:g.scoreB>g.scoreA, tie:g.scoreB===g.scoreA },
      ];
      for(const side of sides){
        if(useWeek){
          const w=(g._weekByTeam && g._weekByTeam[side.team])||null;
          if(!w || !selectedWeeks.has(w)) continue;
        }
        const r=map.get(side.team)||{w:0,l:0,t:0,pf:0,pa:0,n:0};
        if(side.tie) r.t++; else if(side.win) r.w++; else r.l++;
        r.pf+=side.pf; r.pa+=side.pa; r.n++; map.set(side.team, r);
      }
    }

    const rows=[...map.entries()].map(([team,r])=>({
      team, ...r,
      pct:(r.w+0.5*r.t)/Math.max(1,(r.w+r.l+r.t)),
      ppg:r.n?(r.pf/r.n):0, oppg:r.n?(r.pa/r.n):0
    })).sort((a,b)=> b.pct-a.pct || b.w-a.w || a.l-b.l || a.team.localeCompare(b.team));

    tb.innerHTML=rows.map(r=>`
      <tr>
        <td>${r.team}</td>
        <td>${r.w}-${r.l}-${r.t}</td>
        <td>${fmtPct(r.w,r.l,r.t)}</td>
        <td>${nfmt(r?.ppg, 2)}</td>
        <td>${r.oppg.toFixed(2)}</td>
        <td>${r.n}</td>
      </tr>
    `).join("");

    if(calloutsBox && rivalList.length){
      const oppRestrictive = (typeof isRestrictive === 'function') ? isRestrictive(selectedOpponents, universe.opponents) : false;

      // Stats callouts for subset groups
      const statGroups = rivalList.filter(r => (r.type||"group").toLowerCase()==="group" && groupMatched(r.members, null));
      if (statGroups.length){
        calloutsBox.innerHTML = statGroups.map(r=>`
          <div class="callout">
            <div>👀 <strong>${r.name}</strong></div>
          </div>
        `).join("");
      }

      // FX + persistent background only for exact largest match
      if (oppRestrictive){
        const exact = rivalList.filter(r => isFxEligible(r) && exactSetMatch(r.members, null));
        if (exact.length){
          exact.sort((a,b)=> (b.members.length - a.members.length));
          const top = exact[0];
          if (top.slug){
            if (window.triggerGroupEgg) { try{ window.triggerGroupEgg(top.slug); }catch(e){} }
            setBackdrop(top.slug);
          } else {
            setBackdrop(null);
          }
        } else {
          setBackdrop(null);
        }
      } else {
        setBackdrop(null);
      }
    }
    return;
  }

  // Single-team mode
  titleEl.textContent="Opponent Breakdown";
  firstCol.textContent="Opponent";

  const map=new Map();
  for(const g of games){
    const s=sidesForTeam(g, team); if(!s) continue;
    const r=map.get(s.opp)||{w:0,l:0,t:0,pf:0,pa:0,n:0};
    if(s.result==='W') r.w++; else if(s.result==='L') r.l++; else r.t++;
    r.pf+=s.pf; r.pa+=s.pa; r.n++; map.set(s.opp, r);
  }
  const rows=[...map.entries()].map(([opp,r])=>({
    opp, ...r,
    pct:(r.w+0.5*r.t)/Math.max(1,(r.w+r.l+r.t)),
    ppg:r.n?(r.pf/r.n):0, oppg:r.n?(r.pa/r.n):0
  })).sort((a,b)=> b.pct-a.pct || b.w-a.w || a.l-b.l || a.opp.localeCompare(b.opp));

  tb.innerHTML=rows.map(r=>`
    <tr>
      <td>${r.opp}</td>
      <td>${r.w}-${r.l}-${r.t}</td>
      <td>${fmtPct(r.w,r.l,r.t)}</td>
      <td>${nfmt(r?.ppg, 2)}</td>
      <td>${r.oppg.toFixed(2)}</td>
      <td>${r.n}</td>
    </tr>
  `).join("");

  if(calloutsBox && rivalList.length){
    const active=[];
    const oppRestrictive = (typeof isRestrictive === 'function') ? isRestrictive(selectedOpponents, universe.opponents) : false;

    // Stats callouts for subset groups (restore full stats)
    const groups = rivalList.filter(r => (r.type||"group").toLowerCase()==="group");
    for (const grp of groups){
      if (oppRestrictive && groupMatched(grp.members, team)){
        const vsMembers = grp.members.filter(m => m !== team);
        const s = aggregateVsOpps(team, games, vsMembers);
        active.push(`
          <div class="callout">
            <div>🏷️ <strong>${grp.name}</strong> — ${s.w}-${s.l}-${s.t} (${fmtPct(s.w,s.l,s.t)})</div>
            <div class="muted" style="margin-top:4px;font-size:12px">
              Members: ${vsMembers.join(", ")} • PPG: ${s.ppg.toFixed(2)} • OPPG: ${s.oppg.toFixed(2)}
              <span> • (within current filters)</span>
            </div>
          </div>
        `);
      }
    }

    // FX + persistent background for exact largest match (groups + special pairs)
    const candidates = rivalList.filter(r => isFxEligible(r));
    const exact = candidates.filter(r => oppRestrictive && exactSetMatch(r.members, team));
    if (exact.length){
      exact.sort((a,b)=> (b.members.length - a.members.length));
      const top = exact[0];
      if (top.slug){
        if (window.triggerGroupEgg) { try{ window.triggerGroupEgg(top.slug); }catch(e){} }
        setBackdrop(top.slug);
      } else {
        setBackdrop(null);
      }
    } else {
      setBackdrop(null);
    }

    calloutsBox.innerHTML = active.join("");
  }
}

function aggregateVsOpps(team, games, members){
  let w=0,l=0,t=0,pf=0,pa=0,n=0;
  const memLower = members.map(m=>m.toLowerCase());
  for(const g of games){
    const s = sidesForTeam(g, team); if(!s) continue;
    if(!memLower.includes(s.opp.toLowerCase())) continue;
    if(s.result==='W') w++; else if(s.result==='L') l++; else t++;
    pf+=s.pf; pa+=s.pa; n++;
  }
  return { w,l,t,n, ppg: n?pf/n:0, oppg: n?pa/n:0 };
}

/* ---- Season Recap (team only) ---- */

function renderSeasonRecap(team){
  const tb=document.querySelector('#seasonRecapTable tbody'); if(!tb) return;
  if(team===ALL_TEAMS){ tb.innerHTML=`<tr><td colspan="5" class="muted">Select a team to see season recap.</td></tr>`; return; }

  let rows=seasonSummaries.filter(r=>r.owner===team);
  if(isRestrictive(selectedSeasons, universe.seasons)) rows = rows.filter(r=>selectedSeasons.has(+r.season));
  rows.sort((a,b)=>b.season-a.season);

  function narrativeForGames(games, roundPrefix=""){
    if(!games.length) return "";
    const ordered = games
      .slice()
      .sort((a,b)=> new Date(a.date) - new Date(b.date) || roundOrder(a.round) - roundOrder(b.round));
    if(!games.length) return "";
    let narrative=[];
    for(const g of ordered){
      const s=sidesForTeam(g,team); if(!s) continue;
      const opp=s.opp;
      let round=normRound(g.round) || (roundPrefix ? `${roundPrefix} Round` : "Playoffs");
      if(roundPrefix) round = round.replace(/^saunders\\s+/i,'').trim();
      if(s.result==='W') narrative.push(`Defeated ${opp} in ${round}`);
      else if(s.result==='L') narrative.push(`Lost in ${round} to ${opp}`);
      else narrative.push(`Tied ${opp} in ${round}`);
    }
    return narrative.join(", ");
  }

  const mkOutcome = (r)=>{
    const playoffGames = leagueGames.filter(g=>+g.season===+r.season && (g.teamA===team||g.teamB===team) && isPlayoffGame(g));
    const saundersGames = leagueGames.filter(g=>+g.season===+r.season && (g.teamA===team||g.teamB===team) && isSaundersGame(g));
    const playoffNarr = narrativeForGames(playoffGames);
    if(playoffNarr) return playoffNarr;
    const saundersNarr = narrativeForGames(saundersGames, "Saunders");
    if(saundersNarr) return saundersNarr;
    if (r.bye) return "Top-2 Seed";
    return "—";
  };

  tb.innerHTML = rows.map(r=>`
    <tr>
      <td>${r.season}</td>
      <td>${r.wins}-${r.losses}-${r.ties||0}</td>
      <td>${fmtPct(r.wins,r.losses,r.ties||0)}</td>
      <td>${Number.isFinite(+r.finish) ? r.finish : "—"}</td>
      <td>${r.champion ? "👑 " : r.saunders ? "💩 " : ""}${mkOutcome(r)}</td>
    </tr>
  `).join("");
}

/* ---- Week-by-Week (newest → oldest) with crowns/turds + XW ---- */
function renderWeekByWeek(team, games){
  const tb=document.querySelector('#weekTable tbody'); if(!tb) return;
  if(team===ALL_TEAMS){ tb.innerHTML=`<tr><td colspan="9" class="muted">Select a team to see week-by-week games.</td></tr>`; return; }

  const bySeason=new Map();
  for(const g of games){ const arr=bySeason.get(g.season)||[]; arr.push(g); bySeason.set(g.season, arr); }

  const rows=[];
  for(const [season, arr] of [...bySeason.entries()].sort((a,b)=>b[0]-a[0])){
    for(const g of arr.sort(byDateDesc)){
      const s=sidesForTeam(g, team); if(!s) continue;
      const type=normType(g.type);
      const week=(g._weekByTeam && g._weekByTeam[team]) || '';

      // Crown/Turd calculation for this date (use ALL league games that date)
      const dayGames = leagueGames.filter(x => +x.season===+g.season && x.date===g.date);
      const allScores = dayGames.flatMap(x => [x.scoreA, x.scoreB]);
      const maxScore = Math.max(...allScores);
      const minScore = Math.min(...allScores);
      const myScore = (g.teamA===team) ? g.scoreA : g.scoreB;
      const isCrown = myScore===maxScore;
      const isTurd  = myScore===minScore;

      // Expected win (regular season only)
      const xw = expectedWinForGame(team, g);

      rows.push({
        season, week, date:g.date, opp:s.opp, result:s.result, pf:s.pf, pa:s.pa, type, round:normRound(g.round),
        isCrown, isTurd, xw
      });
    }
  }
  tb.innerHTML = rows.map(r=>{
    const resClass = r.result==='W'?'result-win': r.result==='L'?'result-loss':'result-tie';
    const postClass = (r.type!=="Regular") ? 'postseason' : '';
    const badges = `
      ${r.isCrown ? `<span class="badge-emoji" title="Top score league-wide this week">👑</span>` : ""}
      ${r.isTurd  ? `<span class="badge-emoji big" title="Lowest score league-wide this week">💩</span>` : ""}
    `;
    return `<tr class="${resClass} ${postClass}">
      <td>${r.season}</td>
      <td>${r.week||''}</td>
      <td>${r.date}</td>
      <td>${r.opp}</td>
      <td>${r.result}</td>
      <td class="score-cell">${nfmt(r?.pf, 2)} - ${r.pa.toFixed(2)} ${badges}</td>
      <td>${(r.xw===null || r.xw===undefined) ? '—' : r.xw.toFixed(2)}</td>
      <td>${r.type}</td>
      <td>${r.round||''}</td>
    </tr>`;
  }).join("");
}

/* ---- All Games (newest → oldest) ---- */
function renderGamesTable(team, games){
  const tbody=document.querySelector("#historyGamesTable tbody"); if(!tbody) return;
  if(team===ALL_TEAMS){ tbody.innerHTML=`<tr><td colspan="7" class="muted">Select a team to see full game list.</td></tr>`; return; }

  const rows=games.slice().sort(byDateDesc).map(g=>{
    const s=sidesForTeam(g, team); if(!s) return null;
    const type=normType(g.type);
    const resClass = s.result==='W'?'result-win': s.result==='L'?'result-loss':'result-tie';
    const postClass = (type!=="Regular") ? 'postseason' : '';
    return `<tr class="${resClass} ${postClass}">
      <td>${g.date}</td>
      <td>${s.opp}</td>
      <td>${s.result}</td>
      <td>${s.pf.toFixed(2)} - ${s.pa.toFixed(2)}</td>
      <td>${type}</td>
      <td>${normRound(g.round)}</td>
      <td>${g.season}</td>
    </tr>`;
  }).filter(Boolean).join("");
  tbody.innerHTML = rows;
}

/* ---------- Export ---------- */
function exportHistoryCsv(){
  const filtered=applyFacetFilters(leagueGames).sort(byDateDesc);
  const header=['date','season','team','opponent','result','pf','pa','type','round','week','xw'];
  const lines=[header.join(',')];

  if(selectedTeam===ALL_TEAMS){
    const useWeek = isRestrictive(selectedWeeks, universe.weeks);
    for(const g of filtered){
      const sides = [
        { team: g.teamA, opp: g.teamB, pf: g.scoreA, pa: g.scoreB, res: g.scoreA>g.scoreB?'W':g.scoreA<g.scoreB?'L':'T' },
        { team: g.teamB, opp: g.teamA, pf: g.scoreB, pa: g.scoreA, res: g.scoreB>g.scoreA?'W':g.scoreB<g.scoreA?'L':'T' },
      ];
      for(const s of sides){
        const w = (g._weekByTeam && g._weekByTeam[s.team]) || null;
        if(useWeek && (!w || !selectedWeeks.has(w))) continue;
        const xw = isRegularGame(g) ? expectedWinForGame(s.team, g) : null;
        lines.push([g.date,g.season,s.team,s.opp,s.res,s.pf.toFixed(2),s.pa.toFixed(2),normType(g.type),normRound(g.round),w??"", (xw??"")]
          .map(csvEscape).map(v=>`"${v}"`).join(','));
      }
    }
    const blob=new Blob([lines.join('\n')],{type:'text/csv'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`history_ALL.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    return;
  }

  for(const g of filtered){
    const s=sidesForTeam(g, selectedTeam); if(!s) continue;
    const w=(g._weekByTeam && g._weekByTeam[selectedTeam]) || "";
    const xw = isRegularGame(g) ? expectedWinForGame(selectedTeam, g) : null;
    lines.push([g.date,g.season,selectedTeam,s.opp,s.result,s.pf.toFixed(2),s.pa.toFixed(2),normType(g.type),normRound(g.round),w,(xw??"")]
      .map(csvEscape).map(v=>`"${v}"`).join(','));
  }
  const blob=new Blob([lines.join('\n')],{type:'text/csv'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`history_${selectedTeam}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ---------- FX helpers ---------- */
function triggerCrownRain(){
  const wrap = document.getElementById('fxCrown'); if(!wrap) return;
  wrap.innerHTML = ""; wrap.style.display = "block";
  const N = 28;
  let cleared = 0;
  for(let i=0;i<N;i++){
    const s = document.createElement('span');
    s.className = 'crown';
    s.textContent = '👑';
    s.style.left = Math.random()*100 + 'vw';
    s.style.animationDuration = (1.8 + Math.random()*1.0) + 's';
    s.style.animationDelay = (Math.random()*0.5)+'s';
    s.style.fontSize = (20 + Math.random()*12) + 'px';
    wrap.appendChild(s);
    s.addEventListener('animationend', ()=>{
      s.remove(); cleared++;
      if(cleared===N) wrap.style.display='none';
    });
  }
  setTimeout(()=>{ wrap.style.display='none'; wrap.innerHTML=""; }, 3000);
}
function triggerSaundersFog(){
  const fog = document.getElementById('fxSaunders'); if(!fog) return;
  fog.style.display='block';
  trombone();
  setTimeout(()=>{ fog.style.display='none'; }, 2000);
}

/* ---------- Test exports (node-friendly) ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dedupeGames,
    deriveWeeksInPlace,
    computeRegularSeasonChampYears,
    canonicalGameKey
  }};


function longestLosingStreaksGlobal(n=10){
  const runs = [];
  for (const team of teamsFromLeagueGames()){
    const tg = leagueGames
      .map(g => ({ g, s: sidesForTeam(g, team) }))
      .filter(x => x.s)
      .sort((a,b)=> new Date(a.g.date) - new Date(b.g.date));
    let cur = 0, start = null;
    for (let i=0;i<tg.length;i++){
      const {g,s} = tg[i];
      if (s.result === 'L'){
        if (cur===0) start = g.date;
        cur++;
      } else {
        if (cur>0){
          const endDate = tg[i-1].g.date;
          runs.push({ team, len: cur, start, end: endDate });
          cur=0; start=null;
        }
      }
    }
    if (cur>0){
      runs.push({ team, len: cur, start, end: tg[tg.length-1].g.date });
    }
  }
  return runs
    .sort((a,b)=> b.len - a.len || new Date(b.end)-new Date(a.end) || a.team.localeCompare(b.team))
    .slice(0, n);
}
