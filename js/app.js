/* =========================================================
   The Darling — history filters, highlights, dedupe & weeks
   + Asterisks, Rivalries (easter eggs)
   + Fun Facts, Crown Rain, Saunders Fog
   + Top 5 High/Low (skip 2014 playoffs), streak ranges
   + 👑 crowns + 💩 turds per week; Luck (Expected Wins)
========================================================= */

import { byDateDesc, canonicalGameKey } from './core-helpers.js';
import { loadLeagueAssets } from './data-helpers.js';
import {
  bestStreakForTeam,
  computeBottomNWeeklyScoresAllTeams,
  computeExpectedWinForGame,
  computeHeadToHeadPairs,
  computeLeagueRowsSingleWeeks,
  computeLongestStreaksGlobal,
  computeLongestTeamStreaks,
  computeLuckSummary,
  computeSeasonAggregatesAllTeams,
  computeSubThresholdGamesPerTeam,
  computeTeamsFromLeagueGames,
  computeTopNWeeklyScoresAllTeams,
  computeWeeklyAwards,
} from './stats-helpers.js';
import {
  buildFacetControl,
  clearAppStatus,
  escapeHtml,
  renderHeaderBanners,
  setAppStatus,
  showPage,
  updateTeamHeader,
} from './render-helpers.js';
import {
  opponentOptions,
  roundOptionsOrdered,
  seasonOptions,
  teamOptions,
  typeOptions,
  weekOptions,
} from './facet-helpers.js';
import {
  applyFacetFilters,
  buildHistoryCsvText,
  parseUrlState,
  setFacetSelections,
  updateUrlFromState,
} from './state-helpers.js';
import {
  opponentBreakdownView,
  renderGamesTable,
  renderSeasonRecap,
  renderTopHighlights,
  renderWeekByWeek,
  seasonCalloutView,
} from './history-renderers.js';
import {
  leagueFunFactsAllTeamsHtml,
  leagueFunListsAllTeamsHtml,
  leagueSummaryTablesHtml,
  teamFunFactsView,
} from './league-renderers.js';
import './easter-eggs.js';

/* ---------- Global State ---------- */

const DEFAULT_TEAM = "Joe";
const BLOWOUT_MARGIN = 29;
const HIGH_SCORE_THRESHOLD = 150;
const SUB_SCORE_THRESHOLD = 70;
const CLOSE_GAME_MARGIN = 5;

let leagueGames = [];      // assets/H2H.json
let seasonSummaries = [];  // assets/SeasonSummary.json
let rivalries = [];        // assets/Rivalries.json

const ALL_TEAMS = "__ALL__";
let selectedTeam = DEFAULT_TEAM;

let selectedSeasons = new Set();
let selectedWeeks   = new Set();
let selectedOpponents = new Set();
let selectedTypes = new Set();
let selectedRounds = new Set();

let universe = { seasons: [], weeks: [], opponents: [], types: [], rounds: [] };
let isApplyingUrlState = false;

/* Derived weeks set */
let derivedWeeksSet = new Set();
let seasonAggregatesCache = null;
let weeklyAwardsCache = null;
let teamsFromLeagueGamesCache = null;
const headToHeadPairsCache = new Map();
const renderSectionCache = new Map();
let filteredGamesCacheKey = null;
let filteredGamesCacheValue = [];
const renderMetrics = { filterRuns: 0 };

/* Effects — avoid replaying repeatedly */
let lastEffectKey = null;

/* ---------- Special season notes (asterisks) ---------- */
const SPECIAL_TITLE_NOTES = {
  Joel: { champs: { 2014: "Singer not in league", 2020: "COVID season" } },
  Joe:  { saunders: { 2015: "Saunders Bowl matchups incorrect" } }
};
const champNote    = (owner, season) => SPECIAL_TITLE_NOTES[owner]?.champs?.[season] || null;
const saundersNote = (owner, season) => SPECIAL_TITLE_NOTES[owner]?.saunders?.[season] || null;

function currentFacetState(){
  return {
    selectedTeam,
    selectedSeasons,
    selectedWeeks,
    selectedOpponents,
    selectedTypes,
    selectedRounds,
    universe,
    allTeams: ALL_TEAMS,
  };
}

function setKey(set){
  return [...set].map(v => `${v}`).sort().join(',');
}

function gamesKey(games){
  return games.map(canonicalGameKey).join('|');
}

function facetStateKey(){
  return [
    selectedTeam,
    `s:${setKey(selectedSeasons)}`,
    `w:${setKey(selectedWeeks)}`,
    `o:${setKey(selectedOpponents)}`,
    `t:${setKey(selectedTypes)}`,
    `r:${setKey(selectedRounds)}`,
    `us:${universe.seasons.join(',')}`,
    `uw:${universe.weeks.join(',')}`,
    `uo:${universe.opponents.join(',')}`,
    `ut:${universe.types.join(',')}`,
    `ur:${universe.rounds.join(',')}`,
  ].join('|');
}

function filteredGamesForCurrentState(){
  const key = facetStateKey();
  if(filteredGamesCacheKey === key) return filteredGamesCacheValue;
  filteredGamesCacheKey = key;
  filteredGamesCacheValue = applyFacetFilters(leagueGames, currentFacetState());
  renderMetrics.filterRuns++;
  return filteredGamesCacheValue;
}

function renderIfChanged(section, signature, renderFn){
  if(renderSectionCache.get(section) === signature) return;
  renderFn();
  renderSectionCache.set(section, signature);
}

function setDropdownOpen(dropdown, isOpen){
  dropdown.classList.toggle('open', isOpen);
  const btn = dropdown.querySelector('.dropdown-toggle');
  if(btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeDropdowns(except = null){
  document.querySelectorAll('.dropdown').forEach((dropdown)=>{
    if(dropdown !== except) setDropdownOpen(dropdown, false);
  });
}

if(typeof window !== 'undefined'){
  window.__darlingRenderMetrics = renderMetrics;
}

/* ---------- League-wide computed helpers (cached) ---------- */

function subThresholdGamesPerTeam(threshold = SUB_SCORE_THRESHOLD){
  return computeSubThresholdGamesPerTeam(leagueGames, threshold);
}

function longestLosingStreaksAllTeams(n=10){
  return computeLongestTeamStreaks(leagueGames, teamsFromLeagueGames(), 'L', n);
}

function longestWinStreaksAllTeams(n=5){
  return computeLongestTeamStreaks(leagueGames, teamsFromLeagueGames(), 'W', n);
}

function seasonAggregatesAllTeams(){
  if (seasonAggregatesCache) return seasonAggregatesCache;
  seasonAggregatesCache = computeSeasonAggregatesAllTeams(leagueGames, seasonSummaries);
  return seasonAggregatesCache;
}

function headToHeadPairs(minGames=5){
  if (headToHeadPairsCache.has(minGames)) return headToHeadPairsCache.get(minGames);
  const rows = computeHeadToHeadPairs(leagueGames, minGames);
  headToHeadPairsCache.set(minGames, rows);
  return rows;
}

function weeklyAwards(){
  if (weeklyAwardsCache) return weeklyAwardsCache;
  weeklyAwardsCache = computeWeeklyAwards(leagueGames, HIGH_SCORE_THRESHOLD);
  return weeklyAwardsCache;
}

/* ---------- Loaders & Tabs ---------- */
async function loadLeagueJSON(){
  setAppStatus('loading', 'Loading league data...');
  try{
    seasonAggregatesCache = null;
    weeklyAwardsCache = null;
    teamsFromLeagueGamesCache = null;
    headToHeadPairsCache.clear();
    renderSectionCache.clear();
    filteredGamesCacheKey = null;
    filteredGamesCacheValue = [];
    renderMetrics.filterRuns = 0;

    const loaded = await loadLeagueAssets();
    leagueGames = loaded.leagueGames;
    derivedWeeksSet = loaded.derivedWeeksSet;
    seasonSummaries = loaded.seasonSummaries;
    rivalries = loaded.rivalries;

    renderHeaderBannersForOwner(DEFAULT_TEAM);
    clearAppStatus();
    return true;
  }catch(e){
    console.error("Failed to load league JSON", e);
    setAppStatus('error', 'Could not load league data. Refresh after the JSON files are available.');
    return false;
  }
}
/* ---------- Header banners row ---------- */
function renderHeaderBannersForOwner(owner){
  renderHeaderBanners(owner, seasonSummaries);
}

// Update header (team name + accomplishment chips)
function updateHeaderForTeam(team){
  updateTeamHeader(team, seasonSummaries);
}

/* ---------- Init ---------- */
window.addEventListener('DOMContentLoaded', async ()=>{
  showPage('history');
  const loaded = await loadLeagueJSON();
  if (!loaded) return;

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
    const toggle = e.target.closest('.dropdown-toggle');
    if(toggle){
      const dropdown = toggle.closest('.dropdown');
      const shouldOpen = !dropdown.classList.contains('open');
      closeDropdowns(dropdown);
      setDropdownOpen(dropdown, shouldOpen);
      return;
    }
    if(!e.target.closest('.dropdown')) closeDropdowns();
  });

  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    const openToggle = document.querySelector('.dropdown.open .dropdown-toggle');
    closeDropdowns();
    if(openToggle) openToggle.focus();
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


/* ---------- Facet Options ---------- */
/* ---------- Build History Controls ---------- */
function buildHistoryControls(){
  const urlState = parseUrlState();

  // Team select (with All Teams)
  const teamSelect=document.getElementById('teamSelect');
  const teams=teamOptions(seasonSummaries, leagueGames, ALL_TEAMS);
  teamSelect.innerHTML=teams.map(t=>`<option value="${escapeHtml(t.value)}">${escapeHtml(t.label)}</option>`).join("");
  const defaultTeam = teams.find(t=>t.value===DEFAULT_TEAM) ? DEFAULT_TEAM : teams[0].value;
  const urlTeam = (urlState.team && teams.some(t=>t.value===urlState.team)) ? urlState.team : null;
  teamSelect.value = urlTeam || defaultTeam;
  selectedTeam = teamSelect.value;
  updateHeaderForTeam(selectedTeam);
  teamSelect.addEventListener('change', ()=>{
    selectedTeam = teamSelect.value;
    updateHeaderForTeam(selectedTeam);
    buildFacet('oppFilters', opponentOptions(leagueGames, selectedTeam, ALL_TEAMS), {prefix:'opp'});
    readFacetSelections(); updateFacetCountTexts(); renderHistory();
    updateUrlFromState({ ...currentFacetState(), isApplyingUrlState });
  });

  // Facets
  buildFacet('seasonFilters', seasonOptions(leagueGames), {prefix:'season'});
  buildFacet('weekFilters', weekOptions(derivedWeeksSet),   {prefix:'week'});
  buildFacet('oppFilters', opponentOptions(leagueGames, selectedTeam, ALL_TEAMS), {prefix:'opp'});
  buildFacet('typeFilters', typeOptions(leagueGames), {prefix:'type'});
  buildFacet('roundFilters', roundOptionsOrdered(leagueGames), {prefix:'round'});

  // Universe + defaults
  universe.seasons = seasonOptions(leagueGames);
  universe.weeks   = weekOptions(derivedWeeksSet);
  universe.opponents = opponentOptions(leagueGames, selectedTeam, ALL_TEAMS);
  universe.types = typeOptions(leagueGames);
  universe.rounds = roundOptionsOrdered(leagueGames);

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
  const { prefix='f' } = opts;
  buildFacetControl(containerId, values, {
    prefix,
    onChange: () => {
      readFacetSelections(); updateFacetCountTexts(); renderHistory();
      updateUrlFromState({ ...currentFacetState(), isApplyingUrlState });
    },
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
  updateUrlFromState({ ...currentFacetState(), isApplyingUrlState });
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

  universe.seasons = seasonOptions(leagueGames);
  universe.weeks   = weekOptions(derivedWeeksSet);
  universe.opponents = opponentOptions(leagueGames, selectedTeam, ALL_TEAMS);
  universe.types = typeOptions(leagueGames);
  universe.rounds = roundOptionsOrdered(leagueGames);
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
function renderHistory(){
  const teamSel=document.getElementById('teamSelect');
  if(teamSel && selectedTeam!==teamSel.value) selectedTeam=teamSel.value;

  const filtered = filteredGamesForCurrentState();
  const filteredKey = gamesKey(filtered);
  const seasonFilterKey = setKey(selectedSeasons);
  const weekFilterKey = setKey(selectedWeeks);
  const opponentFilterKey = setKey(selectedOpponents);

  renderIfChanged('topHighlights', selectedTeam, () => {
    renderTopHighlights(selectedTeam, {
      allTeams: ALL_TEAMS,
      seasonSummaries,
      champNoteFn: champNote,
      saundersNoteFn: saundersNote,
    });
  });

  // removed: Stats Overview
  const funFactsKey = selectedTeam === ALL_TEAMS ? selectedTeam : `${selectedTeam}|${filteredKey}`;
  renderIfChanged('funFacts', funFactsKey, () => {
    renderFunFacts(selectedTeam, filtered);
  });
  renderIfChanged('oppBreakdown', `${selectedTeam}|${filteredKey}|weeks:${weekFilterKey}|opps:${opponentFilterKey}`, () => {
    renderOppBreakdown(selectedTeam, filtered);
  });
  renderIfChanged('seasonRecap', `${selectedTeam}|seasons:${seasonFilterKey}`, () => {
    renderSeasonRecap(selectedTeam, seasonSummaries, {
      allTeams: ALL_TEAMS,
      allGames: leagueGames,
      selectedSeasons,
      universeSeasons: universe.seasons,
    });
  });
  renderIfChanged('seasonCallout', `${selectedTeam}|seasons:${seasonFilterKey}`, () => {
    renderSeasonCallout(selectedTeam);
  });
  renderIfChanged('weekByWeek', `${selectedTeam}|${filteredKey}`, () => {
    renderWeekByWeek(selectedTeam, filtered, { allTeams: ALL_TEAMS, allGames: leagueGames });
  });
  renderIfChanged('gamesTable', `${selectedTeam}|${filteredKey}`, () => {
    renderGamesTable(selectedTeam, filtered);
  });
}

/* ---- Season Callout + FX ---- */
function renderSeasonCallout(team){
  const callout=document.getElementById('seasonCallout'); if(!callout) return;
  const view = seasonCalloutView(team, {
    allTeams: ALL_TEAMS,
    selectedSeasons,
    seasonSummaries,
    champNoteFn: champNote,
    saundersNoteFn: saundersNote,
  });
  callout.innerHTML = view.html;
  if (view.resetEffect) lastEffectKey = null;
  if (view.effectKey && view.effectKey !== lastEffectKey) {
    lastEffectKey = view.effectKey;
    if (view.effectType === 'champion') triggerCrownRain();
    else if (view.effectType === 'saunders') triggerSaundersFog();
  }
}

/* ---------- FUN FACTS, LUCK ---------- */
function leagueRowsSingleWeeks(){
  return computeLeagueRowsSingleWeeks(leagueGames);
}

function topNWeeklyScoresAllTeams(n=5){
  return computeTopNWeeklyScoresAllTeams(leagueGames, n);
}

function bottomNWeeklyScoresAllTeams(n=5){
  return computeBottomNWeeklyScoresAllTeams(leagueGames, n);
}

function teamsFromLeagueGames(){
  if (teamsFromLeagueGamesCache) return teamsFromLeagueGamesCache;
  teamsFromLeagueGamesCache = computeTeamsFromLeagueGames(leagueGames);
  return teamsFromLeagueGamesCache;
}

function longestWinStreaksGlobal(n=10){
  return computeLongestStreaksGlobal(leagueGames, teamsFromLeagueGames(), 'W', n);
}

function longestLosingStreaksGlobal(n=10){
  return computeLongestStreaksGlobal(leagueGames, teamsFromLeagueGames(), 'L', n);
}

function expectedWinForGame(team, g){
  return computeExpectedWinForGame(leagueGames, team, g);
}

function luckSummary(team, games){
  return computeLuckSummary(leagueGames, team, games);
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

  box.innerHTML = leagueSummaryTablesHtml({
    leagueGames,
    seasonSummaries,
    seasonAggregates: seasonAggregatesAllTeams(),
  });
}
function renderFunFactsAllTeams(){
  const el = document.getElementById('funFacts');
  if (!el) return;

  el.innerHTML = leagueFunFactsAllTeamsHtml({
    seasonAggregates: seasonAggregatesAllTeams(),
    minGames: 8,
    winStreak: longestWinStreaksAllTeams(1)[0] || null,
    lossStreak: longestLosingStreaksAllTeams(1)[0] || null,
    headToHeadPairs: headToHeadPairs(5),
    topWeeklyScores: topNWeeklyScoresAllTeams(1),
  });
}




function renderFunListsAllTeams(){
  const el = document.getElementById('funLists');
  if (!el) return;

  el.innerHTML = leagueFunListsAllTeamsHtml({
    leagueGames,
    seasonSummaries,
    seasonAggregates: seasonAggregatesAllTeams(),
    highs: topNWeeklyScoresAllTeams(10),
    lows: bottomNWeeklyScoresAllTeams(10),
    streaks: longestWinStreaksGlobal(10),
    streaksLoss: longestLosingStreaksGlobal(10),
    weeklyAwards: weeklyAwards(),
    sub70: subThresholdGamesPerTeam(SUB_SCORE_THRESHOLD),
    headToHeadPairs: headToHeadPairs(5),
    limit: 10,
  });
}
function renderFunFacts(team, games){
  if (team === ALL_TEAMS) { renderFunFactsAllTeams(); renderLeagueSummaryTablesAllTeams(); renderFunListsAllTeams(); return; }
  document.getElementById('leagueSummary')?.remove();
  const box = document.getElementById('funFacts');
  const lists = document.getElementById('funLists');
  if(!box || !lists) return;

  const view = teamFunFactsView(team, games, {
    leagueGames,
    seasonSummaries,
    seasonAggregates: seasonAggregatesAllTeams(),
    winStreak: bestStreakForTeam(games, team, 'W'),
    lossStreak: bestStreakForTeam(games, team, 'L'),
    luckSummary: luckSummary(team, games),
    blowoutMargin: BLOWOUT_MARGIN,
    highScoreThreshold: HIGH_SCORE_THRESHOLD,
    closeGameMargin: CLOSE_GAME_MARGIN,
  });
  box.innerHTML = view.factsHtml;
  lists.innerHTML = view.listsHtml;
}

/* ---- Opponent/Team Breakdown (+ rivalry callouts) ---- */

function renderOppBreakdown(team, games){
  const titleEl=document.getElementById('oppTableTitle');
  const firstCol=document.getElementById('oppFirstCol');
  const tb=document.querySelector('#oppTable tbody'); if(!tb) return;

  const calloutsBox=document.getElementById('rivalGroupCallouts');

  const view = opponentBreakdownView(team, games, {
    allTeams: ALL_TEAMS,
    rivalries,
    selectedOpponents,
    universeOpponents: universe.opponents,
    selectedWeeks,
    universeWeeks: universe.weeks,
  });

  titleEl.textContent = view.title;
  firstCol.textContent = view.firstCol;
  tb.innerHTML = view.tableHtml;

  if(calloutsBox){
    calloutsBox.innerHTML = view.calloutsHtml;
    if(view.shouldUpdateBackdrop){
      if(view.triggerSlug && window.triggerGroupEgg){
        try{ window.triggerGroupEgg(view.triggerSlug); }catch(e){}
      }
      if(window.setGroupBackdrop){
        try{ window.setGroupBackdrop(view.backdropSlug || null); }catch(e){}
      }
    }
  }
}

/* ---------- Export ---------- */
function exportHistoryCsv(){
  const filtered=applyFacetFilters(leagueGames, currentFacetState()).sort(byDateDesc);
  const csv = buildHistoryCsvText(filtered, {
    allTeams: ALL_TEAMS,
    selectedTeam,
    selectedWeeks,
    universeWeeks: universe.weeks,
    expectedWinForGameFn: expectedWinForGame,
  });
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`history_${selectedTeam===ALL_TEAMS ? 'ALL' : selectedTeam}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
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
  setTimeout(()=>{ fog.style.display='none'; }, 2000);
}
