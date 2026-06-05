import * as core from './core-helpers.js';
import * as render from './render-helpers.js';

function coreFn(name) {
  const fn = core[name];
  if (typeof fn !== 'function') {
    throw new Error(`trophy-renderers.js requires core-helpers.js before it (${name})`);
  }
  return fn;
}

function renderFn(name) {
  const fn = render[name];
  if (typeof fn !== 'function') {
    throw new Error(`trophy-renderers.js requires render-helpers.js before it (${name})`);
  }
  return fn;
}

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function esc(value) {
  return renderFn('escapeHtml')(value);
}

function nfmt(value, digits = 2) {
  return renderFn('nfmt')(value, digits);
}

function fmtPct(w, l, t = 0) {
  return coreFn('fmtPct')(w, l, t);
}

function ownerSeasonRows(owner, seasonSummaries = []) {
  return seasonSummaries
    .filter(row => row && row.owner === owner)
    .slice()
    .sort((a, b) => (+b.season) - (+a.season) || String(a.owner || '').localeCompare(String(b.owner || '')));
}

function ownerSeasonAggregateRows(owner, seasonAggregates = []) {
  return seasonAggregates
    .filter(row => row && row.team === owner)
    .slice()
    .sort((a, b) => (+b.season) - (+a.season) || String(a.team || '').localeCompare(String(b.team || '')));
}

function formatRecord(wins = 0, losses = 0, ties = 0) {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function formatOrdinal(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return '—';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function formatDelta(value, digits = 1) {
  if (!Number.isFinite(+value)) return '—';
  const n = +value;
  const prefix = n > 0 ? '+' : '';
  return `${prefix}${nfmt(n, digits)}`;
}

function bestBy(rows, scoreFn, tieBreakerFn = null) {
  const sorted = rows
    .slice()
    .sort((a, b) => {
      const diff = scoreFn(b) - scoreFn(a);
      if (diff !== 0) return diff;
      if (tieBreakerFn) return tieBreakerFn(a, b);
      return (+b.season) - (+a.season);
    });
  return sorted[0] || null;
}

function seasonOutcomeLabel(row) {
  if (!row) return '—';
  if (row.champion) return 'Champion';
  if (row.saunders) return 'Saunders';
  if (row.playoff_wins || row.playoff_losses) return 'Playoff Run';
  if (row.bye) return 'Top-2 Seed';
  if (row.wild_card) return 'Wild Card';
  if (row.saunders_bye) return 'Saunders Bye';
  return 'Regular Season';
}

function seasonOutcomeRank(row) {
  if (!row) return 0;
  if (row.champion) return 6;
  if (row.saunders) return 5;
  if (row.playoff_wins || row.playoff_losses) return 4;
  if (row.bye) return 3;
  if (row.wild_card) return 2;
  if (row.saunders_bye) return 1;
  return 0;
}

function seasonOutcomeSummary(row) {
  if (!row) return { label: '—', season: null };
  return {
    label: seasonOutcomeLabel(row),
    season: row.season,
  };
}

function countByTeam(rows, team) {
  return rows.reduce((count, row) => count + ((row && row.team === team) ? +row.count || 0 : 0), 0);
}

function findByTeam(rows, team) {
  return rows.find(row => row && row.team === team) || null;
}

function uniqueSeasons(rows, predicate) {
  return rows
    .filter(predicate)
    .map(row => row.season)
    .filter(season => season !== null && season !== undefined)
    .sort((a, b) => (+b) - (+a));
}

function formatYearChips(items = []) {
  if (!items.length) return '';
  return `<div class="trophy-year-list">${items.map(item => {
    const label = typeof item === 'object' && item ? (item.label || item.season) : item;
    return `<span class="trophy-year-chip">${esc(label)}</span>`;
  }).join('')}</div>`;
}

function emptyTile(label, value = '0', sub = '—', tone = '') {
  return {
    label: String(label),
    value: String(value),
    sub: String(sub),
    tone: String(tone || ''),
    chips: [],
  };
}

function computeOwnerHardware(owner, seasonRows, seasonSummaries) {
  const championYears = uniqueSeasons(seasonRows, row => row.champion);
  const saundersYears = uniqueSeasons(seasonRows, row => row.saunders);
  const regularYears = coreFn('computeRegularSeasonChampYears')(owner, seasonSummaries);
  const byeYears = uniqueSeasons(seasonRows, row => row.bye);
  const wildCardYears = uniqueSeasons(seasonRows, row => row.wild_card);
  const saundersByeYears = uniqueSeasons(seasonRows, row => row.saunders_bye);
  const bagelRows = seasonRows.filter(row => Number.isFinite(+row.bagels_earned) && +row.bagels_earned > 0);
  const bagels = bagelRows.reduce((sum, row) => sum + (+row.bagels_earned || 0), 0);

  return [
    {
      label: 'Darlings',
      value: `${championYears.length}`,
      sub: championYears.length ? 'Championship seasons' : 'No championships yet',
      tone: championYears.length ? 'primary' : '',
      chips: championYears,
    },
    {
      label: 'Saunders Titles',
      value: `${saundersYears.length}`,
      sub: saundersYears.length ? 'Saunders bracket winners' : 'No Saunders titles yet',
      tone: saundersYears.length ? 'warning' : '',
      chips: saundersYears,
    },
    {
      label: 'Regular-Season Titles',
      value: `${regularYears.length}`,
      sub: regularYears.length ? 'Best regular-season records' : 'No regular-season titles yet',
      tone: regularYears.length ? 'primary' : '',
      chips: regularYears,
    },
    {
      label: 'Top-2 Seeds',
      value: `${byeYears.length}`,
      sub: byeYears.length ? 'Finished with a bye' : 'No top-2 seeds yet',
      tone: byeYears.length ? 'primary' : '',
      chips: byeYears,
    },
    {
      label: 'Wild Cards',
      value: `${wildCardYears.length}`,
      sub: wildCardYears.length ? 'Earned a wild card spot' : 'No wild card seasons yet',
      tone: wildCardYears.length ? 'warning' : '',
      chips: wildCardYears,
    },
    {
      label: 'Saunders Byes',
      value: `${saundersByeYears.length}`,
      sub: saundersByeYears.length ? 'Avoided the opening Saunders match' : 'No Saunders byes yet',
      tone: saundersByeYears.length ? 'warning' : '',
      chips: saundersByeYears,
    },
    {
      label: 'Bagels Earned',
      value: `${bagels}`,
      sub: bagels ? 'Blanked an opponent' : 'No bagels yet',
      tone: bagelRows.length ? 'warning' : '',
      chips: bagelRows.map(row => ({
        season: row.season,
        label: Number.isFinite(+row.bagels_earned) ? `${row.season} (${+row.bagels_earned})` : `${row.season}`,
      })),
    },
  ];
}

function computeOwnerRegularResume(owner, seasonRows, seasonAggregates) {
  const rows = seasonRows.slice();
  const aggregates = ownerSeasonAggregateRows(owner, seasonAggregates);
  const totals = rows.reduce((acc, row) => {
    acc.wins += +row.wins || 0;
    acc.losses += +row.losses || 0;
    acc.ties += +row.ties || 0;
    acc.pf += +row.points_for || 0;
    acc.pa += +row.points_against || 0;
    return acc;
  }, { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 });
  const seasonCount = rows.length || 0;
  const avgFinishRows = rows.filter(row => Number.isFinite(+row.finish));
  const avgFinish = avgFinishRows.length
    ? avgFinishRows.reduce((sum, row) => sum + (+row.finish), 0) / avgFinishRows.length
    : null;
  const bestFinish = bestBy(rows.filter(row => Number.isFinite(+row.finish)), row => -(+row.finish));
  const bestPf = bestBy(aggregates.filter(row => Number.isFinite(+row.pf)), row => +row.pf);
  const bestDiff = bestBy(aggregates.filter(row => Number.isFinite(+row.diff)), row => +row.diff);
  const unlucky = bestBy(aggregates.filter(row => Number.isFinite(+row.luck)), row => -(+row.luck));

  return [
    emptyTile('Record', formatRecord(totals.wins, totals.losses, totals.ties), 'Career regular season'),
    emptyTile('Win %', fmtPct(totals.wins, totals.losses, totals.ties), seasonCount ? `${seasonCount} seasons` : 'No seasons recorded'),
    {
      label: 'Points For',
      value: nfmt(totals.pf, 1),
      sub: seasonCount ? `Avg ${nfmt(totals.pf / seasonCount, 1)} per season` : 'No seasons recorded',
      tone: '',
      chips: [],
    },
    {
      label: 'Points Against',
      value: nfmt(totals.pa, 1),
      sub: seasonCount ? `Avg ${nfmt(totals.pa / seasonCount, 1)} per season` : 'No seasons recorded',
      tone: '',
      chips: [],
    },
    emptyTile('Average Finish', avgFinish === null ? '—' : nfmt(avgFinish, 1), seasonCount ? `${seasonCount} seasons tracked` : 'No finish data'),
    emptyTile('Best Finish', bestFinish ? formatOrdinal(bestFinish.finish) : '—', bestFinish ? `${bestFinish.season}` : 'No finish data'),
    emptyTile('Best Scoring Season', bestPf ? nfmt(bestPf.pf, 1) : '—', bestPf ? `${bestPf.season}` : 'No scoring data'),
    emptyTile('Best Differential Season', bestDiff ? formatDelta(bestDiff.diff, 1) : '—', bestDiff ? `${bestDiff.season}` : 'No differential data'),
    emptyTile('Most Unlucky Season', unlucky ? formatDelta(unlucky.luck, 2) : '—', unlucky ? `${unlucky.season}` : 'No luck data'),
  ];
}

function championshipAppearanceSeasons(owner, seasonRows, leagueGames) {
  const seasons = new Set();
  for (const game of leagueGames || []) {
    if (game.teamA !== owner && game.teamB !== owner) continue;
    const round = String(coreFn('normRound')(game.round) || '').toLowerCase();
    const type = String(coreFn('normType')(game.type) || '').toLowerCase();
    const isSaunders = coreFn('isSaundersGame')(game);
    if (!isSaunders && type !== 'regular' && (round.includes('final') || round.includes('champ'))) {
      seasons.add(+game.season);
    }
  }
  if (seasons.size) {
    return [...seasons].sort((a, b) => b - a);
  }
  return seasonRows
    .filter(row => +row.playoff_wins > 0 || +row.playoff_losses > 0 || row.champion)
    .map(row => row.season)
    .filter((season, index, arr) => arr.indexOf(season) === index)
    .sort((a, b) => b - a);
}

function computeOwnerPostseasonResume(owner, seasonRows, leagueGames) {
  const playoffWins = seasonRows.reduce((sum, row) => sum + (+row.playoff_wins || 0), 0);
  const playoffLosses = seasonRows.reduce((sum, row) => sum + (+row.playoff_losses || 0), 0);
  const saundersWins = seasonRows.reduce((sum, row) => sum + (+row.saunders_wins || 0), 0);
  const saundersLosses = seasonRows.reduce((sum, row) => sum + (+row.saunders_losses || 0), 0);
  const champions = uniqueSeasons(seasonRows, row => row.champion);
  const saundersTitles = uniqueSeasons(seasonRows, row => row.saunders);
  const byes = uniqueSeasons(seasonRows, row => row.bye);
  const wildCards = uniqueSeasons(seasonRows, row => row.wild_card);
  const saundersByes = uniqueSeasons(seasonRows, row => row.saunders_bye);
  const finalAppearances = championshipAppearanceSeasons(owner, seasonRows, leagueGames);
  const bestPostseason = seasonRows
    .slice()
    .sort((a, b) => seasonOutcomeRank(b) - seasonOutcomeRank(a) || (+b.season) - (+a.season))[0] || null;

  return [
    {
      label: 'Playoff Record',
      value: formatRecord(playoffWins, playoffLosses),
      sub: playoffWins || playoffLosses ? fmtPct(playoffWins, playoffLosses) : 'No playoff games recorded',
      tone: '',
      chips: [],
    },
    emptyTile('Championships', `${champions.length}`, champions.length ? 'Won the title' : 'No championships yet', champions.length ? 'primary' : ''),
    emptyTile('Championship Appearances', `${finalAppearances.length}`, finalAppearances.length ? 'Reached the final round' : 'No championship games recorded'),
    {
      label: 'Best Postseason',
      value: bestPostseason ? seasonOutcomeLabel(bestPostseason) : '—',
      sub: bestPostseason ? `${bestPostseason.season}` : 'No postseason data',
      tone: bestPostseason && bestPostseason.champion ? 'primary' : (bestPostseason && bestPostseason.saunders ? 'warning' : ''),
      chips: [],
    },
    {
      label: 'Saunders Record',
      value: formatRecord(saundersWins, saundersLosses),
      sub: saundersWins || saundersLosses ? 'Saunders bracket games' : 'No Saunders bracket games',
      tone: '',
      chips: [],
    },
    emptyTile('Saunders Titles', `${saundersTitles.length}`, saundersTitles.length ? 'Won Saunders' : 'No Saunders titles yet', saundersTitles.length ? 'warning' : ''),
    emptyTile('Saunders Scars', `${saundersLosses}`, saundersLosses ? 'Losses in the Saunders bracket' : 'No Saunders losses'),
    emptyTile('Top-2 Byes', `${byes.length}`, byes.length ? 'Started with a bye' : 'No top-2 seeds yet', byes.length ? 'primary' : ''),
    emptyTile('Wild Cards', `${wildCards.length}`, wildCards.length ? 'Reached the bracket via wild card' : 'No wild card seasons yet', wildCards.length ? 'warning' : ''),
    emptyTile('Saunders Byes', `${saundersByes.length}`, saundersByes.length ? 'Skipped the first Saunders round' : 'No Saunders byes yet', saundersByes.length ? 'warning' : ''),
  ];
}

function lookupCount(rows, owner) {
  const row = findByTeam(rows, owner);
  return row ? (+row.count || 0) : 0;
}

function bestGameForOwner(games, owner, compareFn) {
  let best = null;
  for (const game of games || []) {
    const s = coreFn('sidesForTeam')(game, owner);
    if (!s) continue;
    const row = {
      season: +game.season,
      date: game.date,
      opp: s.opp,
      pf: +s.pf,
      pa: +s.pa,
      margin: +s.pf - +s.pa,
    };
    if (!best || compareFn(row, best) > 0) {
      best = row;
    }
  }
  return best;
}

function computeOwnerWeeklyResume(owner, leagueGames, weeklyAwards = {}, sub70 = []) {
  const topCount = lookupCount(weeklyAwards.top || [], owner);
  const lowCount = lookupCount(weeklyAwards.low || [], owner);
  const high150Count = lookupCount(weeklyAwards.high150 || [], owner);
  const sub70Count = lookupCount(sub70, owner);
  const ownerGames = (leagueGames || []).filter(game => game.teamA === owner || game.teamB === owner);
  const highest = bestGameForOwner(ownerGames, owner, (a, b) => a.pf - b.pf);
  const lowest = bestGameForOwner(ownerGames, owner, (a, b) => b.pf - a.pf);
  const biggestWin = bestGameForOwner(ownerGames, owner, (a, b) => (a.margin > b.margin ? 1 : (a.margin < b.margin ? -1 : 0)));
  const biggestLoss = bestGameForOwner(ownerGames, owner, (a, b) => (a.margin < b.margin ? 1 : (a.margin > b.margin ? -1 : 0)));

  return [
    emptyTile('Weekly Crowns', `${topCount}`, topCount ? 'Highest score on a game date' : 'No weekly crowns'),
    emptyTile('Weekly Lows', `${lowCount}`, lowCount ? 'Lowest score on a game date' : 'No weekly lows'),
    emptyTile('150+ Games', `${high150Count}`, high150Count ? 'Regular season scores of 150+' : 'No 150+ games'),
    emptyTile('Sub-70 Games', `${sub70Count}`, sub70Count ? 'Regular season scores below 70' : 'No sub-70 games'),
    {
      label: 'Highest Single-Game Score',
      value: highest ? nfmt(highest.pf, 2) : '—',
      sub: highest ? `${highest.date} vs ${highest.opp}` : 'No games recorded',
      tone: '',
      chips: [],
    },
    {
      label: 'Lowest Single-Game Score',
      value: lowest ? nfmt(lowest.pf, 2) : '—',
      sub: lowest ? `${lowest.date} vs ${lowest.opp}` : 'No games recorded',
      tone: '',
      chips: [],
    },
    {
      label: 'Biggest Blowout Win',
      value: biggestWin ? formatDelta(biggestWin.margin, 2) : '—',
      sub: biggestWin ? `${biggestWin.date} vs ${biggestWin.opp}` : 'No wins recorded',
      tone: '',
      chips: [],
    },
    {
      label: 'Biggest Blowout Loss',
      value: biggestLoss ? formatDelta(biggestLoss.margin, 2) : '—',
      sub: biggestLoss ? `${biggestLoss.date} vs ${biggestLoss.opp}` : 'No losses recorded',
      tone: '',
      chips: [],
    },
  ];
}

function computeSignatureSeasonNotes(owner, seasonRows, seasonSummaries, seasonAggregates) {
  const aggRows = ownerSeasonAggregateRows(owner, seasonAggregates);
  const championSeasons = new Set(uniqueSeasons(seasonRows, row => row.champion));
  const saundersSeasons = new Set(uniqueSeasons(seasonRows, row => row.saunders));
  const regularSeasonTitleSeasons = new Set(coreFn('computeRegularSeasonChampYears')(owner, seasonSummaries));
  const byeSeasons = new Set(uniqueSeasons(seasonRows, row => row.bye));
  const wildCardSeasons = new Set(uniqueSeasons(seasonRows, row => row.wild_card));
  const saundersByeSeasons = new Set(uniqueSeasons(seasonRows, row => row.saunders_bye));
  const bagelMap = new Map(seasonRows.filter(row => Number.isFinite(+row.bagels_earned) && +row.bagels_earned > 0).map(row => [row.season, +row.bagels_earned]));
  const bestPf = aggRows.length ? Math.max(...aggRows.map(row => +row.pf || 0)) : null;
  const worstPf = aggRows.length ? Math.min(...aggRows.map(row => +row.pf || 0)) : null;
  const bestDiff = aggRows.length ? Math.max(...aggRows.map(row => +row.diff || 0)) : null;
  const unlucky = aggRows.length ? Math.min(...aggRows.map(row => +row.luck || 0)) : null;

  return seasonRows.map(row => {
    const notes = [];
    if (championSeasons.has(+row.season)) notes.push('Champion');
    if (saundersSeasons.has(+row.season)) notes.push('Saunders');
    if (regularSeasonTitleSeasons.has(+row.season)) notes.push('Regular-season title');
    if (byeSeasons.has(+row.season)) notes.push('Top-2 seed');
    if (wildCardSeasons.has(+row.season)) notes.push('Wild card');
    if (saundersByeSeasons.has(+row.season)) notes.push('Saunders bye');
    if (bestPf !== null && (+row.points_for || 0) === bestPf) notes.push('Best scoring season');
    if (worstPf !== null && (+row.points_for || 0) === worstPf) notes.push('Worst scoring season');
    if (bestDiff !== null && aggRows.some(agg => +agg.season === +row.season && (+agg.diff || 0) === bestDiff)) notes.push('Best differential season');
    if (unlucky !== null && aggRows.some(agg => +agg.season === +row.season && (+agg.luck || 0) === unlucky)) notes.push('Most unlucky season');
    if (bagelMap.has(+row.season)) notes.push(`Bagels earned ${bagelMap.get(+row.season)}`);
    return {
      season: row.season,
      record: formatRecord(+row.wins || 0, +row.losses || 0, +row.ties || 0),
      finish: Number.isFinite(+row.finish) ? `${+row.finish}` : '—',
      outcome: seasonOutcomeLabel(row),
      pf: nfmt(row.points_for, 1),
      pa: nfmt(row.points_against, 1),
      diff: formatDelta((+row.points_for || 0) - (+row.points_against || 0), 1),
      notes,
      finishRank: Number.isFinite(+row.finish) ? +row.finish : null,
      outcomeRank: seasonOutcomeRank(row),
    };
  });
}

function buildTrophyCaseViewModel(owner, opts = {}) {
  const seasonSummaries = Array.isArray(opts.seasonSummaries) ? opts.seasonSummaries : [];
  const seasonAggregates = Array.isArray(opts.seasonAggregates) ? opts.seasonAggregates : [];
  const weeklyAwards = opts.weeklyAwards || { top: [], low: [], high150: [] };
  const sub70 = Array.isArray(opts.sub70) ? opts.sub70 : [];
  const leagueGames = Array.isArray(opts.leagueGames) ? opts.leagueGames : [];

  const seasonRows = ownerSeasonRows(owner, seasonSummaries);
  const hardware = computeOwnerHardware(owner, seasonRows, seasonSummaries);
  const regularSeason = computeOwnerRegularResume(owner, seasonRows, seasonAggregates);
  const postseason = computeOwnerPostseasonResume(owner, seasonRows, leagueGames);
  const weeklyResume = computeOwnerWeeklyResume(owner, leagueGames, weeklyAwards, sub70);
  const signatureSeasons = computeSignatureSeasonNotes(owner, seasonRows, seasonSummaries, seasonAggregates)
    .slice()
    .sort((a, b) => (+b.season) - (+a.season));

  const championCount = hardware[0]?.value || '0';
  const regularTitleCount = hardware[2]?.value || '0';
  const top2Count = hardware[3]?.value || '0';
  const regularRecord = regularSeason[0]?.value || '0-0';
  const regularPct = regularSeason[1]?.value || '0.0%';
  const bestFinish = regularSeason[5]?.value || '—';
  const avgFinishRow = seasonRows.filter(row => Number.isFinite(+row.finish));
  const avgFinish = avgFinishRow.length
    ? nfmt(avgFinishRow.reduce((sum, row) => sum + (+row.finish), 0) / avgFinishRow.length, 1)
    : '—';
  const bestPostseason = postseason[3]?.value || '—';
  const bestPostseasonSeason = postseason[3]?.sub || '—';

  return {
    owner,
    hero: {
      title: `${owner} Trophy Case`,
      lines: seasonRows.length ? [
        `${championCount} Darlings | ${regularTitleCount} Regular-Season Titles | ${top2Count} Top-2 Seeds`,
        `Career regular season: ${regularRecord} (${regularPct})`,
        `Best finish: ${bestFinish} | Average finish: ${avgFinish}`,
        `Best postseason: ${bestPostseason}${bestPostseasonSeason && bestPostseasonSeason !== '—' ? ` (${bestPostseasonSeason})` : ''}`,
      ] : [
        'No seasons recorded yet.',
      ],
    },
    hardware,
    regularSeason,
    postseason,
    weeklyAwards: weeklyResume,
    signatureSeasons,
  };
}

function tileHtml(tile) {
  const toneClass = tile.tone ? ` ${tile.tone}` : '';
  return `<div class="trophy-card${toneClass}">
    <div class="label">${esc(tile.label)}</div>
    <div class="value">${esc(tile.value)}</div>
    <div class="sub">${esc(tile.sub || '—')}</div>
    ${formatYearChips(tile.chips || [])}
  </div>`;
}

function statTileHtml(tile) {
  return `<div class="stat">
    <div class="label">${esc(tile.label)}</div>
    <div class="value">${esc(tile.value)}</div>
    ${tile.sub ? `<div class="sub">${esc(tile.sub)}</div>` : ''}
  </div>`;
}

function trophyHeroHtml(vm) {
  const hero = vm.hero || {};
  const lines = Array.isArray(hero.lines) ? hero.lines : [];
  return `<div class="trophy-hero">
    <div class="trophy-hero-copy">
      <div class="trophy-kicker">Trophy Case</div>
      <h3>${esc(hero.title || vm.owner || 'Trophy Case')}</h3>
      <div class="trophy-hero-lines">
        ${lines.map(line => `<p>${esc(line)}</p>`).join('')}
      </div>
    </div>
  </div>`;
}

function trophyHardwareHtml(vm) {
  const tiles = Array.isArray(vm.hardware) ? vm.hardware : [];
  return tiles.map(tileHtml).join('');
}

function trophyRegularSeasonHtml(vm) {
  const tiles = Array.isArray(vm.regularSeason) ? vm.regularSeason : [];
  return tiles.map(statTileHtml).join('');
}

function trophyPostseasonHtml(vm) {
  const tiles = Array.isArray(vm.postseason) ? vm.postseason : [];
  return tiles.map(statTileHtml).join('');
}

function trophyWeeklyAwardsHtml(vm) {
  const tiles = Array.isArray(vm.weeklyAwards) ? vm.weeklyAwards : [];
  return tiles.map(statTileHtml).join('');
}

function trophySeasonTableHtml(vm) {
  const rows = Array.isArray(vm.signatureSeasons) ? vm.signatureSeasons : [];
  if (!rows.length) {
    return '<tr><td colspan="8" class="muted">No seasons recorded for this owner.</td></tr>';
  }
  return rows.map(row => {
    const noteHtml = (row.notes || []).map(note => `<span class="trophy-season-note">${esc(note)}</span>`).join(' ');
    return `<tr>
      <td>${esc(row.season)}</td>
      <td>${esc(row.record)}</td>
      <td>${esc(row.finish)}</td>
      <td>${esc(row.outcome)}</td>
      <td>${esc(row.pf)}</td>
      <td>${esc(row.pa)}</td>
      <td>${esc(row.diff)}</td>
      <td>${noteHtml || '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('');
}

function renderTrophyHero(vm, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const el = root.getElementById('trophyHero');
  if (!el) return;
  el.innerHTML = trophyHeroHtml(vm);
}

function renderTrophyHardware(vm, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const el = root.getElementById('trophyHardwareGrid');
  if (!el) return;
  el.innerHTML = trophyHardwareHtml(vm);
}

function renderTrophyRegularSeason(vm, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const el = root.getElementById('trophyRegularGrid');
  if (!el) return;
  el.innerHTML = trophyRegularSeasonHtml(vm);
}

function renderTrophyPostseason(vm, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const el = root.getElementById('trophyPostseasonGrid');
  if (!el) return;
  el.innerHTML = trophyPostseasonHtml(vm);
}

function renderTrophyWeeklyAwards(vm, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const el = root.getElementById('trophyWeeklyGrid');
  if (!el) return;
  el.innerHTML = trophyWeeklyAwardsHtml(vm);
}

function renderTrophySeasonTable(vm, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const el = root.querySelector('#trophySeasonTable tbody');
  if (!el) return;
  el.innerHTML = trophySeasonTableHtml(vm);
}

export {
  buildTrophyCaseViewModel,
  trophyHeroHtml,
  trophyHardwareHtml,
  trophyRegularSeasonHtml,
  trophyPostseasonHtml,
  trophyWeeklyAwardsHtml,
  trophySeasonTableHtml,
  renderTrophyHero,
  renderTrophyHardware,
  renderTrophyRegularSeason,
  renderTrophyPostseason,
  renderTrophyWeeklyAwards,
  renderTrophySeasonTable,
  ownerSeasonRows,
  ownerSeasonAggregateRows,
  computeOwnerHardware,
  computeOwnerRegularResume,
  computeOwnerPostseasonResume,
  computeOwnerWeeklyResume,
  computeSignatureSeasonNotes,
};
