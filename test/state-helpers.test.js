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
  const parsed = parseUrlState('?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
  assert.equal(parsed.tab, 'rivalry');
  assert.equal(parsed.rivalryTeamA, 'Joe');
  assert.equal(parsed.rivalryTeamB, 'Joel');
  assert.equal(parsed.hasRivalry, true);
  assert.equal(parsed.hasAny, false);

  const next = buildUrlFromState({
    tab: 'rivalry',
    selectedRivalryTeamA: 'Joe',
    selectedRivalryTeamB: 'Joel',
    pathname: '/index.html',
    allTeams: '__ALL__',
  });
  assert.equal(next, '/index.html?tab=rivalry&rivalryTeamA=Joe&rivalryTeamB=Joel');
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
});
