import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTopHighlightsViewModel,
  buildSeasonCalloutViewModel,
  historyGamesTableRowHtml,
  historyGamesTableHtml,
  weekByWeekRows,
  weekByWeekTableHtml,
  seasonRecapOutcome,
  seasonRecapRows,
  seasonRecapTableHtml,
  avgFinishForTeam,
  topHighlightsHtml,
  seasonSummaryLookup,
  seasonCalloutView,
  groupMatched,
  exactSetMatch,
  isFxEligible,
  aggregateVsOpps,
  opponentBreakdownRows,
  opponentBreakdownTableHtml,
  opponentBreakdownView,
} from '../js/history-renderers.js';
import { validSeasonRow } from './test-helpers.js';

test('history renderer builds all-games table html for selected team', () => {
  const games = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, type: 'Regular', round: '' },
    { season: 2025, date: '2025-09-14', teamA: 'Nuss', teamB: 'Joe', scoreA: 80, scoreB: 70, type: 'Playoff', round: 'Semi Final' },
  ];

  const row = historyGamesTableRowHtml(games[0], 'Joe');
  assert.match(row, /result-win/);
  assert.match(row, /100\.00 - 90\.00/);
  assert.match(row, /<td>Shap<\/td>/);

  const html = historyGamesTableHtml('Joe', games, { allTeams: '__ALL__' });
  assert.ok(html.indexOf('2025-09-14') < html.indexOf('2025-09-07'));
  assert.match(html, /result-loss postseason/);
  assert.match(html, /Semi Final/);

  const allHtml = historyGamesTableHtml('__ALL__', games, { allTeams: '__ALL__' });
  assert.match(allHtml, /Select a team to see full game list/);
});

test('history renderer builds week-by-week table html for selected team', () => {
  const allGames = [
    { season: 2025, date: '2025-09-07', teamA: 'Joe', teamB: 'Shap', scoreA: 100, scoreB: 90, type: 'Regular', round: '', _weekByTeam: { Joe: 1, Shap: 1 } },
    { season: 2025, date: '2025-09-07', teamA: 'Nuss', teamB: 'Singer', scoreA: 60, scoreB: 95, type: 'Regular', round: '', _weekByTeam: { Nuss: 1, Singer: 1 } },
    { season: 2025, date: '2025-09-14', teamA: 'Shap', teamB: 'Joe', scoreA: 85, scoreB: 70, type: 'Playoff', round: 'Semi Final', _weekByTeam: { Shap: 2, Joe: 2 } },
  ];
  const filtered = [allGames[0], allGames[2]];

  const rows = weekByWeekRows('Joe', filtered, { allGames });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2025-09-14');
  assert.equal(rows[0].result, 'L');
  assert.equal(rows[1].isCrown, true);
  assert.equal(rows[1].isTurd, false);
  assert.equal(rows[1].xw, 1);

  const html = weekByWeekTableHtml('Joe', filtered, { allGames, allTeams: '__ALL__' });
  assert.match(html, /result-loss postseason/);
  assert.match(html, /Semi Final/);
  assert.match(html, /&#x1f451;/);
  assert.match(html, /1\.00/);

  const allHtml = weekByWeekTableHtml('__ALL__', filtered, { allGames, allTeams: '__ALL__' });
  assert.match(allHtml, /Select a team to see week-by-week games/);
});

test('history renderer builds season recap html and narratives', () => {
  const summaries = [
    { owner: 'Joe', season: 2025, wins: 10, losses: 4, ties: 0, finish: 1, champion: true, saunders: false, bagels_earned: 2 },
    { owner: 'Joe', season: 2024, wins: 7, losses: 7, ties: 0, finish: 5, champion: false, saunders: false, bye: true },
    { owner: 'Shap', season: 2025, wins: 8, losses: 6, ties: 0, finish: 3, champion: false, saunders: false },
  ];
  const games = [
    { season: 2025, date: '2025-12-14', teamA: 'Joe', teamB: 'Shap', scoreA: 120, scoreB: 100, type: 'Playoff', round: 'Semi Final' },
    { season: 2025, date: '2025-12-21', teamA: 'Nuss', teamB: 'Joe', scoreA: 90, scoreB: 110, type: 'Playoff', round: 'Final' },
  ];

  assert.equal(
    seasonRecapOutcome('Joe', summaries[0], games),
    'Defeated Shap in Semi Final, Defeated Nuss in Final • Bagels earned 🥯: 2'
  );
  assert.equal(seasonRecapOutcome('Joe', summaries[1], games), 'Top-2 Seed');

  const rows = seasonRecapRows('Joe', summaries, {
    selectedSeasons: new Set([2025]),
    universeSeasons: [2024, 2025],
  });
  assert.deepEqual(rows.map(r => r.season), [2025]);

  const html = seasonRecapTableHtml('Joe', summaries, {
    allGames: games,
    selectedSeasons: new Set([2025]),
    universeSeasons: [2024, 2025],
    allTeams: '__ALL__',
  });
  assert.match(html, /10-4-0/);
  assert.match(html, /71\.4%/);
  assert.match(html, /👑 Defeated Shap in Semi Final/);

  const allHtml = seasonRecapTableHtml('__ALL__', summaries, { allTeams: '__ALL__' });
  assert.match(allHtml, /Select a team to see season recap/);
});

test('history renderer builds top highlight chips', () => {
  const summaries = [
    { owner: 'Joe', season: 2025, champion: true, saunders: false, wins: 11, finish: 1 },
    { owner: 'Joe', season: 2024, champion: false, saunders: true, wins: 7, finish: 8 },
    { owner: 'Shap', season: 2025, champion: false, saunders: false, wins: 9, finish: 3 },
    { owner: 'Shap', season: 2024, champion: true, saunders: false, wins: 7, finish: 1 },
  ];

  assert.equal(avgFinishForTeam('Joe', summaries), 4.5);

  const html = topHighlightsHtml('Joe', {
    seasonSummaries: summaries,
    allTeams: '__ALL__',
    champNoteFn: (owner, season) => owner === 'Joe' && season === 2025 ? 'note' : null,
    saundersNoteFn: (owner, season) => owner === 'Joe' && season === 2024 ? 'bad bracket' : null,
  });
  assert.match(html, /Darlings/);
  assert.match(html, /Years: 2025\*/);
  assert.match(html, /Saunders/);
  assert.match(html, /Years: 2024\*/);
  assert.match(html, /Regular-Season Titles/);
  assert.match(html, /Years: 2025/);
  assert.match(html, /Avg Finish/);
  assert.match(html, /4\.50/);
  assert.match(html, /2025 — note/);
  assert.match(html, /2024 — bad bracket/);

  const allHtml = topHighlightsHtml('__ALL__', { allTeams: '__ALL__', seasonSummaries: summaries });
  assert.match(allHtml, /League view/);
});

test('history renderer view models normalize headline text', () => {
  const summaries = [
    { owner: 'Joe', season: 2025, champion: true, saunders: false, wins: 11, finish: 1 },
    { owner: 'Joe', season: 2024, champion: false, saunders: true, wins: 7, finish: 8 },
  ];
  const vm = buildTopHighlightsViewModel('Joe', {
    seasonSummaries: summaries,
    allTeams: '__ALL__',
    champNoteFn: (owner, season) => owner === 'Joe' && season === 2025 ? 'note' : null,
    saundersNoteFn: (owner, season) => owner === 'Joe' && season === 2024 ? 'bad bracket' : null,
  });
  assert.equal(vm.isLeagueView, false);
  assert.equal(vm.chips[0].title, 'Darlings');
  assert.equal(vm.chips[0].main, '1');
  assert.match(vm.chips[0].sub, /Years: 2025\*/);
  assert.equal(vm.chips[3].main, '4.50');
  assert.match(vm.chips[4].sub, /2025 — note/);
  assert.match(vm.chips[4].sub, /2024 — bad bracket/);

  const leagueVm = buildTopHighlightsViewModel('__ALL__', { allTeams: '__ALL__', seasonSummaries: summaries });
  assert.equal(leagueVm.isLeagueView, true);
  assert.match(leagueVm.chips[0].main, /Select a team/);
});

test('history renderer builds season callout view and effect metadata', () => {
  const summaries = [
    {
      owner: 'Joe',
      season: 2025,
      wins: 10,
      losses: 4,
      ties: 0,
      finish: 1,
      champion: true,
      bye: true,
      saunders: false,
      playoff_wins: 2,
      playoff_losses: 0,
    },
  ];

  assert.equal(seasonSummaryLookup('Joe', 2025, summaries), summaries[0]);
  const view = seasonCalloutView('Joe', {
    seasonSummaries: summaries,
    selectedSeasons: new Set([2025]),
    allTeams: '__ALL__',
    champNoteFn: () => 'COVID season',
    saundersNoteFn: () => null,
  });
  assert.match(view.html, /Joe in <strong>2025<\/strong>/);
  assert.match(view.html, /Record: <strong>10-4-0<\/strong> \(71\.4%\)/);
  assert.match(view.html, /Champion\*/);
  assert.match(view.html, /Top-2 Seed/);
  assert.match(view.html, /Playoffs: 2-0-0/);
  assert.match(view.html, /2025 — COVID season/);
  assert.equal(view.effectKey, 'Joe|2025|C');
  assert.equal(view.effectType, 'champion');
  assert.equal(view.resetEffect, false);

  const reset = seasonCalloutView('Joe', {
    seasonSummaries: summaries,
    selectedSeasons: new Set([2024, 2025]),
    allTeams: '__ALL__',
  });
  assert.equal(reset.html, '');
  assert.equal(reset.resetEffect, true);

  const allView = seasonCalloutView('__ALL__', {
    seasonSummaries: summaries,
    selectedSeasons: new Set([2025]),
    allTeams: '__ALL__',
  });
  assert.equal(allView.html, '');
  assert.equal(allView.resetEffect, false);
});

test('history renderer view model normalizes season callout text', () => {
  const summaries = [
    {
      owner: 'Joe',
      season: 2025,
      wins: 10,
      losses: 4,
      ties: 0,
      finish: 1,
      champion: true,
      bye: true,
      saunders: false,
      playoff_wins: 2,
      playoff_losses: 0,
    },
  ];
  const vm = buildSeasonCalloutViewModel('Joe', {
    seasonSummaries: summaries,
    selectedSeasons: new Set([2025]),
    allTeams: '__ALL__',
    champNoteFn: () => 'COVID season',
    saundersNoteFn: () => null,
  });
  assert.equal(vm.show, true);
  assert.equal(vm.record, '10-4-0');
  assert.equal(vm.pct, '71.4%');
  assert.equal(vm.finish, '1');
  assert.match(vm.bits.join(' • '), /Champion/);
  assert.match(vm.notes.join(' • '), /2025 — COVID season/);
  assert.equal(vm.effectKey, 'Joe|2025|C');
  assert.equal(vm.effectType, 'champion');
});

test('history renderer builds opponent breakdown rows and rivalry metadata', () => {
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
      teamA: 'Joe',
      teamB: 'Nuss',
      scoreA: 80,
      scoreB: 70,
      type: 'Regular',
      round: '',
      _weekByTeam: { Joe: 2, Nuss: 2 },
    },
    {
      season: 2025,
      date: '2025-09-21',
      teamA: 'Shap',
      teamB: 'Nuss',
      scoreA: 75,
      scoreB: 85,
      type: 'Regular',
      round: '',
      _weekByTeam: { Shap: 2, Nuss: 3 },
    },
  ];
  const rivalries = [
    { name: 'Rivals', type: 'group', members: ['Joe', 'Shap', 'Nuss'], slug: 'rivals' },
    { name: 'Pair', type: 'pair', members: ['Singer', 'Nuss'], slug: 'singer-nuss' },
  ];
  const selectedOpponents = new Set(['Shap', 'Nuss']);

  assert.equal(groupMatched(['Joe', 'Shap', 'Nuss'], selectedOpponents, 'Joe'), true);
  assert.equal(exactSetMatch(['Joe', 'Shap', 'Nuss'], selectedOpponents, 'Joe'), true);
  assert.equal(isFxEligible(rivalries[0]), true);
  assert.equal(isFxEligible(rivalries[1]), true);

  const agg = aggregateVsOpps('Joe', games, ['Shap', 'Nuss']);
  assert.deepEqual(agg, { w: 2, l: 0, t: 0, n: 2, ppg: 90, oppg: 80 });

  const rows = opponentBreakdownRows('Joe', games, { allTeams: '__ALL__' });
  assert.deepEqual(rows.map(r => r.label), ['Nuss', 'Shap']);
  assert.equal(rows[0].w, 1);
  assert.equal(rows[0].ppg, 80);

  const html = opponentBreakdownTableHtml('Joe', games, { allTeams: '__ALL__' });
  assert.match(html, /Nuss/);
  assert.match(html, /1-0-0/);
  assert.match(html, /100\.0%/);

  const view = opponentBreakdownView('Joe', games, {
    allTeams: '__ALL__',
    rivalries,
    selectedOpponents,
    universeOpponents: ['Shap', 'Nuss', 'Singer'],
  });
  assert.equal(view.title, 'Opponent Breakdown');
  assert.equal(view.firstCol, 'Opponent');
  assert.match(view.calloutsHtml, /Rivals/);
  assert.match(view.calloutsHtml, /2-0-0/);
  assert.equal(view.triggerSlug, 'rivals');
  assert.equal(view.backdropSlug, 'rivals');

  const allView = opponentBreakdownView('__ALL__', games, {
    allTeams: '__ALL__',
    rivalries,
    selectedOpponents: new Set(['Joe', 'Shap', 'Nuss']),
    universeOpponents: ['Joe', 'Shap', 'Nuss', 'Rishi'],
  });
  assert.equal(allView.title, 'Team Breakdown');
  assert.equal(allView.firstCol, 'Team');
  assert.match(allView.calloutsHtml, /Rivals/);
  assert.equal(allView.triggerSlug, 'rivals');

  const weekRows = opponentBreakdownRows('__ALL__', games, {
    allTeams: '__ALL__',
    selectedWeeks: new Set([1]),
    universeWeeks: [1, 2, 3],
  });
  assert.deepEqual(weekRows.map(r => r.label), ['Joe', 'Shap']);
});
