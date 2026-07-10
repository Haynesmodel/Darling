import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseUrlState,
  buildUrlFromState,
  applyFacetFilters,
  buildHistoryCsvText,
} from '../js/state-helpers.js';

test('url helpers parse and rebuild facet state', () => {
  const parsed = parseUrlState('?team=Joe&seasons=2024,2025&weeks=1,3&opps=Shap&types=Regular&rounds=Semi%20Final');
  assert.equal(parsed.team, 'Joe');
  assert.deepEqual([...parsed.seasons], [2024, 2025]);
  assert.deepEqual([...parsed.weeks], [1, 3]);
  assert.deepEqual([...parsed.opps], ['Shap']);
  assert.deepEqual([...parsed.types], ['Regular']);
  assert.deepEqual([...parsed.rounds], ['Semi Final']);
  assert.equal(parsed.hasAny, true);

  const next = buildUrlFromState({
    selectedTeam: 'Joe',
    selectedSeasons: new Set([2024, 2025]),
    selectedWeeks: new Set([1]),
    selectedOpponents: new Set(['Shap']),
    selectedTypes: new Set(['Regular']),
    selectedRounds: new Set(['Semi Final']),
    universe: {
      seasons: [2023, 2024, 2025],
      weeks: [1, 2],
      opponents: ['Shap', 'Nuss'],
      types: ['Regular'],
      rounds: ['Semi Final', 'Final'],
    },
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?team=Joe&seasons=2024%2C2025&weeks=1&opps=Shap&rounds=Semi+Final');
});

test('url helpers parse and rebuild rivalry state', () => {
  const parsed = parseUrlState('?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel&rivalryScope=currentSeason');
  assert.equal(parsed.tab, 'rivalry');
  assert.equal(parsed.rivalryTeamA, 'Joe');
  assert.equal(parsed.rivalryTeamB, 'Joel');
  assert.equal(parsed.rivalryScope, 'currentSeason');
  assert.equal(parsed.hasRivalry, true);
  assert.equal(parsed.hasAny, false);

  const next = buildUrlFromState({
    tab: 'rivalry',
    selectedRivalryTeamA: 'Joe',
    selectedRivalryTeamB: 'Joel',
    selectedRivalryScope: 'currentSeason',
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel&rivalryScope=currentSeason');
});

test('url helpers parse and rebuild current season state', () => {
  const parsed = parseUrlState('?tab=current&currentSeason=2025&currentWeek=6&currentOwner=Joe&currentView=owners&currentProjection=current');
  assert.equal(parsed.tab, 'current');
  assert.equal(parsed.currentSeason, 2025);
  assert.equal(parsed.currentWeek, 6);
  assert.equal(parsed.currentOwner, 'Joe');
  assert.equal(parsed.currentView, 'owners');
  assert.equal(parsed.currentProjection, 'current');
  assert.equal(parsed.hasCurrent, true);
  assert.equal(parsed.hasAny, true);

  const next = buildUrlFromState({
    tab: 'current',
    selectedCurrentSeason: 2025,
    selectedCurrentWeek: 6,
    selectedCurrentOwner: 'Joe',
    selectedCurrentView: 'owners',
    selectedCurrentProjection: 'current',
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?tab=current&currentSeason=2025&currentWeek=6&currentOwner=Joe&currentView=owners&currentProjection=current');
});

test('url helpers parse and rebuild trophy state', () => {
  const parsed = parseUrlState('?tab=trophy&trophyOwner=Joe');
  assert.equal(parsed.tab, 'trophy');
  assert.equal(parsed.trophyOwner, 'Joe');
  assert.equal(parsed.hasTrophy, true);
  assert.equal(parsed.hasAny, true);

  const next = buildUrlFromState({
    tab: 'trophy',
    selectedTrophyOwner: 'Joe',
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?tab=trophy&trophyOwner=Joe');
});

test('url helpers parse and rebuild dynasty state', () => {
  const parsed = parseUrlState('?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2023&dynastyMinSeasons=2&dynastySaunders=1');
  assert.equal(parsed.tab, 'dynasty');
  assert.equal(parsed.dynastyMode, 'calculator');
  assert.equal(parsed.dynastyOwner, 'Joe');
  assert.equal(parsed.dynastyStart, 2021);
  assert.equal(parsed.dynastyEnd, 2023);
  assert.equal(parsed.dynastyMinSeasons, 2);
  assert.equal(parsed.dynastySaunders, true);
  assert.equal(parsed.hasDynasty, true);
  assert.equal(parsed.hasAny, true);

  const next = buildUrlFromState({
    tab: 'dynasty',
    selectedDynastyMode: 'calculator',
    selectedDynastyOwner: 'Joe',
    selectedDynastyStartSeason: 2021,
    selectedDynastyEndSeason: 2023,
    selectedDynastyMinSeasons: 2,
    selectedDynastySaunders: true,
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?tab=dynasty&dynastyMode=calculator&dynastyOwner=Joe&dynastyStart=2021&dynastyEnd=2023&dynastyMinSeasons=2&dynastySaunders=1');
});

test('url helpers parse and rebuild gauntlet state', () => {
  const parsed = parseUrlState('?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019&gm=hybrid&gp=1&gn=10000&gs=abc123');
  assert.equal(parsed.tab, 'gauntlet');
  assert.equal(parsed.gauntletA, 'Joe:2024');
  assert.equal(parsed.gauntletB, 'Zook:2019');
  assert.equal(parsed.gauntletModel, 'hybrid');
  assert.equal(parsed.gauntletIncludePostseason, true);
  assert.equal(parsed.gauntletSimulations, 10000);
  assert.equal(parsed.gauntletSeed, 'abc123');
  assert.equal(parsed.hasGauntlet, true);
  assert.equal(parsed.hasAny, true);

  const missing = parseUrlState('?tab=gauntlet');
  assert.equal(missing.gauntletA, null);
  assert.equal(missing.gauntletB, null);
  assert.equal(missing.gauntletModel, null);
  assert.equal(missing.gauntletIncludePostseason, null);
  assert.equal(missing.gauntletSimulations, null);
  assert.equal(missing.gauntletSeed, null);
  assert.equal(missing.hasGauntlet, true);

  const next = buildUrlFromState({
    tab: 'gauntlet',
    selectedGauntletA: 'Joe:2024',
    selectedGauntletB: 'Zook:2019',
    selectedGauntletModel: 'hybrid',
    selectedGauntletIncludePostseason: true,
    selectedGauntletSimulations: 10000,
    selectedGauntletSeed: 'abc123',
    selectedTeam: 'Joe',
    selectedSeasons: new Set([2024]),
    selectedWeeks: new Set([1]),
    selectedOpponents: new Set(['Zook']),
    universe: {
      seasons: [2024, 2025],
      weeks: [1, 2],
      opponents: ['Zook', 'Shap'],
      types: ['Regular'],
      rounds: ['Final'],
    },
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?tab=gauntlet&ga=Joe%3A2024&gb=Zook%3A2019&gm=hybrid&gp=1&gn=10000&gs=abc123');
});

test('url helpers preserve opponent selections with spaces and punctuation', () => {
  const next = buildUrlFromState({
    selectedTeam: 'Joe',
    selectedOpponents: new Set(['The Boss', 'A&B / C+']),
    universe: {
      seasons: [],
      weeks: [],
      opponents: ['The Boss', 'A&B / C+', 'Other'],
      types: [],
      rounds: [],
    },
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?team=Joe&opps=The+Boss%2CA%26B+%2F+C%2B');

  const parsed = parseUrlState(next.slice(next.indexOf('?')));
  assert.deepEqual([...parsed.opps], ['The Boss', 'A&B / C+']);
});

test('history game query URL fields validate, cap, and round-trip', () => {
  const parsed = parseUrlState('?tab=history&gameResult=L&gameMinScore=100&gameMaxScore=160.5&gameSort=marginAsc&gameLimit=999&focus=games');
  assert.equal(parsed.gameResult, 'L');
  assert.equal(parsed.gameMinScore, 100);
  assert.equal(parsed.gameMaxScore, 160.5);
  assert.equal(parsed.gameSort, 'marginAsc');
  assert.equal(parsed.gameLimit, 100);
  assert.equal(parsed.focus, 'games');
  assert.equal(parsed.hasGameQuery, true);

  const invalid = parseUrlState('?gameResult=nope&gameMinScore=-1&gameMaxScore=x&gameSort=random&gameLimit=0&focus=sidebar');
  assert.equal(invalid.gameResult, null);
  assert.equal(invalid.gameMinScore, null);
  assert.equal(invalid.gameMaxScore, null);
  assert.equal(invalid.gameSort, null);
  assert.equal(invalid.gameLimit, null);
  assert.equal(invalid.focus, null);

  const url = buildUrlFromState({
    tab: 'history',
    selectedGameResult: 'W',
    selectedGameMinScore: 150,
    selectedGameSort: 'scoreDesc',
    selectedGameLimit: 1,
    selectedFocus: 'games',
    pathname: '/Darling/',
  });
  assert.equal(url, '/Darling/?tab=history&gameResult=W&gameMinScore=150&gameSort=scoreDesc&gameLimit=1&focus=games');
});

test('applyFacetFilters honors team and facet selections', () => {
  const games = [
    { teamA: 'Joe', teamB: 'Shap', season: 2025, type: 'Regular', round: '', date: '2025-09-07', scoreA: 100, scoreB: 90, _weekByTeam: { Joe: 1, Shap: 1 } },
    { teamA: 'Joe', teamB: 'Nuss', season: 2025, type: 'Regular', round: '', date: '2025-09-14', scoreA: 80, scoreB: 70, _weekByTeam: { Joe: 2, Nuss: 2 } },
    { teamA: 'Shap', teamB: 'Nuss', season: 2024, type: 'Regular', round: '', date: '2024-09-07', scoreA: 77, scoreB: 88, _weekByTeam: { Shap: 1, Nuss: 1 } },
  ];
  const filtered = applyFacetFilters(games, {
    selectedTeam: 'Joe',
    selectedSeasons: new Set([2025]),
    selectedWeeks: new Set([1]),
    selectedOpponents: new Set(['Shap']),
    selectedTypes: new Set(['Regular']),
    selectedRounds: new Set(),
    universe: {
      seasons: [2024, 2025],
      weeks: [1, 2],
      opponents: ['Shap', 'Nuss'],
      types: ['Regular'],
      rounds: [],
    },
    allTeams: '__ALL__',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].teamB, 'Shap');
});

test('buildHistoryCsvText exports single-team and all-team rows', () => {
  const games = [
    {
      season: 2025,
      date: '2025-09-07',
      teamA: 'Joe',
      teamB: 'Shap',
      scoreA: 100,
      scoreB: 90,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 1, Shap: 1 },
    },
    {
      season: 2025,
      date: '2025-09-14',
      teamA: 'Nuss',
      teamB: 'Joe',
      scoreA: 80,
      scoreB: 70,
      type: 'Playoff',
      round: 'Final',
      _weekByTeam: { Nuss: 2, Joe: 2 },
    },
  ];

  const single = buildHistoryCsvText(games, {
    allTeams: '__ALL__',
    selectedTeam: 'Joe',
    expectedWinForGameFn: () => 0.5,
  }).split('\n');
  assert.equal(single[0], 'date,season,team,opponent,result,pf,pa,type,round,week,xw');
  assert.equal(single[1], '"2025-09-07","2025","Joe","Shap","W","100.00","90.00","Regular","","1","0.5"');
  assert.equal(single[2], '"2025-09-14","2025","Joe","Nuss","L","70.00","80.00","Playoff","Final","2",""');

  const allTeams = buildHistoryCsvText(games, {
    allTeams: '__ALL__',
    selectedTeam: '__ALL__',
    selectedWeeks: new Set([1]),
    universeWeeks: [1, 2],
    expectedWinForGameFn: (team) => team === 'Joe' ? 0.75 : 0.25,
  }).split('\n');
  assert.equal(allTeams.length, 3);
  assert.equal(allTeams[1], '"2025-09-07","2025","Joe","Shap","W","100.00","90.00","Regular","","1","0.75"');
  assert.equal(allTeams[2], '"2025-09-07","2025","Shap","Joe","L","90.00","100.00","Regular","","1","0.25"');

  const queried = buildHistoryCsvText(games, {
    allTeams: '__ALL__',
    selectedTeam: '__ALL__',
    gameQuery: { gameMinScore: 90, gameSort: 'scoreDesc', gameLimit: 2 },
    expectedWinForGameFn: () => 0.5,
  }).split('\n');
  assert.equal(queried.length, 3);
  assert.equal(queried[1], '"2025-09-07","2025","Joe","Shap","W","100.00","90.00","Regular","","1","0.5"');
  assert.equal(queried[2], '"2025-09-07","2025","Shap","Joe","L","90.00","100.00","Regular","","1","0.5"');
});
