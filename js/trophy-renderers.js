import {
  byDateAsc,
  byDateDesc,
  computeRegularSeasonChampYears,
  fmtPct,
  isPlayoffGame,
  isRegularGame,
  isSaundersGame,
  sidesForTeam,
} from './core-helpers.js';
import { escapeHtml, fmtTrimmed } from './render-helpers.js';
import {
  computeExpectedWinForGame,
  computeLuckSummary,
  computeWeeklyAwards,
} from './stats-helpers.js';
import { renderTrophyCareerPlot } from './charting/plot-charts.js';

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function esc(value) {
  return escapeHtml(value ?? '');
}

function toNumber(value, fallback = null) {
  const n = +value;
  return Number.isFinite(n) ? n : fallback;
}

function fmtWhole(value) {
  return Number.isFinite(+value) ? `${Math.round(+value)}` : '—';
}

function fmtDecimal(value, digits = 1) {
  return Number.isFinite(+value) ? (+value).toFixed(digits) : '—';
}

function fmtSigned(value, digits = 1) {
  if (!Number.isFinite(+value)) return '—';
  const n = +value;
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function fmtScore(value, digits = 1) {
  return Number.isFinite(+value) ? fmtTrimmed(+value).replace(/\.?$/, '') : '—';
}

function joinYears(years) {
  if (!Array.isArray(years) || years.length === 0) return '—';
  return years.slice().sort((a, b) => +a - +b).join(', ');
}

function uniquePreserveOrder(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function isFiniteRow(row) {
  return row && Number.isFinite(+row.season);
}

function sortSeasonDesc(a, b) {
  return (+b.season) - (+a.season);
}

function sortSeasonAsc(a, b) {
  return (+a.season) - (+b.season);
}

function regularRecordString(profile) {
  const { wins, losses, ties } = profile.totals.regular;
  return `${wins}-${losses}-${ties}`;
}

function playoffRecordString(profile) {
  const { wins, losses, ties } = profile.totals.playoffs;
  return `${wins}-${losses}${ties ? `-${ties}` : ''}`;
}

function saundersRecordString(profile) {
  const { wins, losses, ties } = profile.totals.saunders;
  return `${wins}-${losses}${ties ? `-${ties}` : ''}`;
}

function calcPctFromRecord(record) {
  const games = record.wins + record.losses + record.ties;
  if (!games) return null;
  return ((record.wins + 0.5 * record.ties) / games);
}

function calcAvg(values) {
  const nums = values.filter(v => Number.isFinite(+v)).map(Number);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function calcStdDev(values) {
  const nums = values.filter(v => Number.isFinite(+v)).map(Number);
  if (nums.length < 2) return 0;
  const avg = calcAvg(nums);
  const variance = nums.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function formatPctValue(value) {
  return Number.isFinite(+value) ? `${(+value * 100).toFixed(1)}%` : '—';
}

function ordinalText(value) {
  if (!Number.isFinite(+value)) return '—';
  const n = Math.round(+value);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function valueRankText(rank, tied = false) {
  if (!Number.isFinite(+rank)) return '—';
  return tied && rank > 1 ? `T-${rank}` : ordinalText(rank);
}

function svgDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function hardwareArt(kind) {
  const icons = {
    trophy: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop offset="0%" stop-color="#fde68a"/>
            <stop offset="100%" stop-color="#f59e0b"/>
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="#fff7ed"/>
        <path d="M22 12h20v6h8c0 9-5 16-13 18v6h6v6H21v-6h6v-6c-8-2-13-9-13-18h8v-6zm-2 10c0 5 3 9 8 11v-11h-8zm24 0v11c5-2 8-6 8-11h-8z" fill="url(#g)"/>
      </svg>
    `),
    medal: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#eff6ff"/>
        <path d="M22 8h8l6 12-8 8-6-20zm20 0h-8l-6 12 8 8 6-20z" fill="#2563eb"/>
        <circle cx="32" cy="36" r="16" fill="#bfdbfe" stroke="#2563eb" stroke-width="4"/>
        <path d="M32 24l3.5 7.1 7.8 1.1-5.6 5.5 1.3 7.7L32 41.8 25 45.4l1.3-7.7-5.6-5.5 7.8-1.1z" fill="#1d4ed8"/>
      </svg>
    `),
    bagel: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#fff7ed"/>
        <path d="M32 14c10 0 18 8 18 18s-8 18-18 18-18-8-18-18 8-18 18-18zm0 8a10 10 0 100 20 10 10 0 000-20z" fill="#c08457"/>
        <path d="M21 32c0-6 4-11 11-11 6 0 11 5 11 11s-5 11-11 11c-7 0-11-5-11-11z" fill="#f7cfa7"/>
        <circle cx="32" cy="32" r="4" fill="#f8fafc"/>
      </svg>
    `),
    warning: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#fef2f2"/>
        <path d="M32 10 56 52H8L32 10z" fill="#ef4444"/>
        <rect x="29" y="24" width="6" height="16" rx="3" fill="#fff"/>
        <circle cx="32" cy="46" r="3" fill="#fff"/>
      </svg>
    `),
    football: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#f1f5f9"/>
        <ellipse cx="32" cy="32" rx="18" ry="12" fill="#6b3f1d"/>
        <path d="M22 32h20M30 26v12M34 26v12" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `),
    beachChair: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#f0f9ff"/>
        <circle cx="48" cy="18" r="7" fill="#fbbf24"/>
        <path d="M15 45 31 22l6 3-10 20z" fill="#fb7185"/>
        <path d="M26 26h14l5 18H20z" fill="#93c5fd"/>
        <path d="M18 50h28M24 33l9 5M29 26l5 7" stroke="#1d4ed8" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `),
    joker: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#eef2ff"/>
        <rect x="20" y="13" width="22" height="32" rx="5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
        <rect x="28" y="9" width="22" height="34" rx="5" fill="#fff" stroke="#0f172a" stroke-width="2.5"/>
        <path d="M36 16c3-4 7-4 10 0 3 4 0 8-3 10 2 2 3 5 1 8-2 3-5 4-8 3" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M32 42c4-7 11-10 18-9" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
        <path d="M42 18l1.8 3.8 4.2.6-3 3 0.7 4.2-3.7-2-3.7 2 0.7-4.2-3-3 4.2-.6z" fill="#ef4444"/>
        <path d="M35 28l2.6 2.1-1.1 3.1h-3l-1.1-3.1z" fill="#1d4ed8"/>
      </svg>
    `),
    turd: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#fff7ed"/>
        <path d="M20 46c-4-10 4-17 12-17 2-8 16-10 20 0 4 3 6 7 6 11 0 7-6 14-18 14H28c-4 0-7-3-8-8z" fill="#8b5a2b"/>
        <path d="M24 38c4-4 10-4 14 0 4-4 8-4 12 0" fill="none" stroke="#d6a066" stroke-width="4" stroke-linecap="round"/>
        <circle cx="44" cy="27" r="4" fill="#c08457"/>
      </svg>
    `),
  };
  return icons[kind] || '';
}

function ownerMetricRow(leagueRanks, owner, metricKey) {
  const metric = leagueRanks?.metrics?.[metricKey];
  if (!metric) return null;
  return metric.rows.find(row => row.owner === owner) || null;
}

function topStatHighlights(view) {
  const owner = view.owner;
  const keys = [
    ['championships', 'Darlings', 'trophy'],
    ['regularTitles', 'Regular Titles', 'medal'],
    ['weeklyCrowns', 'Weekly Crowns', 'medal'],
    ['playoffWins', 'Playoff Wins', 'football'],
    ['top2Seeds', 'Byes', 'beachChair'],
    ['avgFinish', 'Avg Finish', null],
    ['sub70Games', 'Sub-70 Games', 'warning'],
    ['saundersPain', 'Saunders Titles', 'warning'],
  ];

  const items = [];
  for (const [key, label, icon] of keys) {
    const metricRow = ownerMetricRow(view.leagueRanks, owner, key);
    if (!metricRow || !Number.isFinite(metricRow.rank) || metricRow.rank > 3) continue;
    const tied = (view.leagueRanks.metrics[key]?.rows || []).filter(row => row.value === metricRow.value).length > 1;
    const value = Number.isFinite(metricRow.value)
      ? (key === 'avgFinish' ? fmtDecimal(metricRow.value, 1) : `${Math.round(metricRow.value)}`)
      : '—';
    items.push({
      label,
      value,
      rankText: valueRankText(metricRow.rank, tied),
      icon,
      type: key,
    });
  }

  return items;
}

function formatLedgerNotes(row) {
  const notes = [];
  if (row.champion) notes.push('Champion');
  if (row.saunders) notes.push('Saunders');
  if (row.playoff_wins > 0 || row.playoff_losses > 0) {
    notes.push(`Postseason ${row.playoff_wins || 0}-${row.playoff_losses || 0}`);
  }
  if (row.saunders_wins > 0 || row.saunders_losses > 0) {
    notes.push(`Saunders ${row.saunders_wins || 0}-${row.saunders_losses || 0}`);
  }
  if (row.bye) notes.push(row.champion ? 'Regular-season title' : 'Bye');
  if (row.wild_card) notes.push('Wild card');
  if (row.bagels_earned !== null && row.bagels_earned !== undefined) {
    notes.push(`Bagels ${row.bagels_earned}`);
  }
  return uniquePreserveOrder(notes);
}

function competitionRankRows(rows, accessor, { direction = 'desc' } = {}) {
  const scored = rows.map(row => {
    const raw = accessor(row);
    const value = Number.isFinite(+raw) ? +raw : null;
    return { row, value };
  });

  const filtered = scored
    .filter(item => item.value !== null)
    .sort((a, b) => {
      if (a.value === b.value) return a.row.owner.localeCompare(b.row.owner);
      return direction === 'asc' ? a.value - b.value : b.value - a.value;
    });

  const rankByValue = new Map();
  filtered.forEach((item, index) => {
    if (!rankByValue.has(item.value)) {
      rankByValue.set(item.value, index + 1);
    }
  });

  return scored.map(item => ({
    owner: item.row.owner,
    value: item.value,
    rank: item.value === null ? null : rankByValue.get(item.value),
  }));
}

function buildOwnerCareerProfile(owner, seasonSummaries = [], leagueGames = [], opts = {}) {
  const seasonRows = seasonSummaries
    .filter(row => row.owner === owner)
    .sort(sortSeasonDesc);
  const ownerGames = leagueGames
    .filter(game => game.teamA === owner || game.teamB === owner)
    .sort(byDateAsc);
  const regularGames = ownerGames.filter(isRegularGame);
  const playoffGames = ownerGames.filter(isPlayoffGame);
  const saundersGames = ownerGames.filter(isSaundersGame);

  const regularRecord = seasonRows.reduce((acc, row) => {
    acc.wins += +row.wins || 0;
    acc.losses += +row.losses || 0;
    acc.ties += +row.ties || 0;
    return acc;
  }, { wins: 0, losses: 0, ties: 0 });

  const playoffRecord = seasonRows.reduce((acc, row) => {
    acc.wins += +row.playoff_wins || 0;
    acc.losses += +row.playoff_losses || 0;
    return acc;
  }, { wins: 0, losses: 0, ties: 0 });

  const saundersRecord = seasonRows.reduce((acc, row) => {
    acc.wins += +row.saunders_wins || 0;
    acc.losses += +row.saunders_losses || 0;
    return acc;
  }, { wins: 0, losses: 0, ties: 0 });

  const pointsFor = seasonRows.reduce((sum, row) => sum + (Number.isFinite(+row.points_for) ? +row.points_for : 0), 0);
  const pointsAgainst = seasonRows.reduce((sum, row) => sum + (Number.isFinite(+row.points_against) ? +row.points_against : 0), 0);
  const diffTotal = pointsFor - pointsAgainst;
  const finishes = seasonRows.map(row => toNumber(row.finish)).filter(value => value !== null);
  const averageFinish = calcAvg(finishes);
  const finishStdDev = calcStdDev(finishes);
  const finishCount = finishes.length;
  const bestFinish = finishCount ? Math.min(...finishes) : null;
  const worstFinish = finishCount ? Math.max(...finishes) : null;

  const regularTitleYears = computeRegularSeasonChampYears(owner, seasonSummaries);
  const championYears = seasonRows.filter(row => row.champion).map(row => +row.season).sort((a, b) => a - b);
  const saundersYears = seasonRows.filter(row => row.saunders).map(row => +row.season).sort((a, b) => a - b);
  const byeYears = seasonRows.filter(row => row.bye).map(row => +row.season).sort((a, b) => a - b);
  const wildCardYears = seasonRows.filter(row => row.wild_card).map(row => +row.season).sort((a, b) => a - b);
  const saundersByeYears = seasonRows.filter(row => row.saunders_bye).map(row => +row.season).sort((a, b) => a - b);

  const weeklyAwards = computeWeeklyAwards(leagueGames, 150);
  const weeklyCrowns = (weeklyAwards.top || []).find(row => row.team === owner)?.count || 0;
  const lowScores = (weeklyAwards.low || []).find(row => row.team === owner)?.count || 0;
  const highScores = (weeklyAwards.high150 || []).find(row => row.team === owner)?.count || 0;
  const sub70Games = regularGames.filter(game => {
    const s = sidesForTeam(game, owner);
    return s && +s.pf < 70;
  }).length;

  const seasonLuckRows = seasonRows
    .map(row => {
      const games = regularGames.filter(game => +game.season === +row.season);
      const expectedWins = games.reduce((sum, game) => {
        const xw = computeExpectedWinForGame(leagueGames, owner, game);
        return xw === null ? sum : sum + xw;
      }, 0);
      const luck = games.reduce((sum, game) => {
        const xw = computeExpectedWinForGame(leagueGames, owner, game);
        if (xw === null) return sum;
        const s = sidesForTeam(game, owner);
        if (!s) return sum;
        const actual = s.result === 'W' ? 1 : s.result === 'T' ? 0.5 : 0;
        return sum + (actual - xw);
      }, 0);
      return { season: +row.season, luck, games: games.length, expectedWins };
    })
    .filter(row => row.games > 0)
    .sort((a, b) => a.luck - b.luck || b.season - a.season);

  const luckySeason = seasonLuckRows.length ? seasonLuckRows[seasonLuckRows.length - 1] : null;
  const unluckySeason = seasonLuckRows.length ? seasonLuckRows[0] : null;

  const singleGameRows = ownerGames
    .map(game => {
      const s = sidesForTeam(game, owner);
      if (!s) return null;
      const xw = isRegularGame(game) ? computeExpectedWinForGame(leagueGames, owner, game) : null;
      return {
        game,
        opponent: s.opp,
        result: s.result,
        pf: s.pf,
        pa: s.pa,
        margin: s.pf - s.pa,
        luckDelta: xw === null ? null : ((s.result === 'W' ? 1 : s.result === 'T' ? 0.5 : 0) - xw),
        xw,
      };
    })
    .filter(Boolean);

  const regularScoringRows = singleGameRows.filter(row => isRegularGame(row.game) && +row.game.season !== 2014);

  const profile = {
    owner,
    seasonRows,
    ownerGames,
    regularGames,
    playoffGames,
    saundersGames,
    totals: {
      regular: regularRecord,
      playoffs: playoffRecord,
      saunders: saundersRecord,
      pointsFor,
      pointsAgainst,
      diff: diffTotal,
    },
    counts: {
      championships: championYears.length,
      regularTitles: regularTitleYears.length,
      top2Seeds: byeYears.length,
      wildCards: wildCardYears.length,
      saundersTitles: saundersYears.length,
      saundersByes: saundersByeYears.length,
      weeklyCrowns,
      lowScores,
      highScores,
      sub70Games,
      bagels: seasonRows.reduce((sum, row) => sum + (Number.isFinite(+row.bagels_earned) ? +row.bagels_earned : 0), 0),
    },
    years: {
      champions: championYears,
      regularTitles: regularTitleYears,
      top2Seeds: byeYears,
      wildCards: wildCardYears,
      saundersTitles: saundersYears,
      saundersByes: saundersByeYears,
    },
    rates: {
      regularWinPct: calcPctFromRecord(regularRecord),
      playoffWinPct: calcPctFromRecord(playoffRecord),
      saundersWinPct: calcPctFromRecord(saundersRecord),
      averageFinish,
      finishStdDev,
    },
    finishes: {
      count: finishCount,
      best: bestFinish,
      worst: worstFinish,
    },
    seasonLuckRows,
    bestSeason: regularTitleYears[regularTitleYears.length - 1] || (championYears[championYears.length - 1] || null),
    bestPFSeason: seasonRows
      .filter(row => Number.isFinite(+row.points_for))
      .sort((a, b) => (+b.points_for) - (+a.points_for) || +b.season - +a.season)[0] || null,
    bestDiffSeason: seasonRows
      .filter(row => Number.isFinite(+row.points_for) && Number.isFinite(+row.points_against))
      .sort((a, b) => ((+b.points_for - +b.points_against) - (+a.points_for - +a.points_against)) || +b.season - +a.season)[0] || null,
    worstFinishSeason: seasonRows
      .filter(row => Number.isFinite(+row.finish))
      .sort((a, b) => (+b.finish) - (+a.finish) || +b.season - +a.season)[0] || null,
    mostUnluckySeason: unluckySeason ? seasonRows.find(row => +row.season === unluckySeason.season) || null : null,
    luckiestSeason: luckySeason ? seasonRows.find(row => +row.season === luckySeason.season) || null : null,
    bestGame: regularScoringRows
      .slice()
      .sort((a, b) => b.pf - a.pf || byDateDesc(a.game, b.game))[0] || null,
    worstGame: singleGameRows
      .slice()
      .sort((a, b) => a.pf - b.pf || byDateDesc(a.game, b.game))[0] || null,
    biggestWin: singleGameRows
      .filter(row => row.margin > 0)
      .sort((a, b) => b.margin - a.margin || byDateDesc(a.game, b.game))[0] || null,
    biggestLoss: singleGameRows
      .filter(row => row.margin < 0)
      .sort((a, b) => a.margin - b.margin || byDateDesc(a.game, b.game))[0] || null,
    bestPlayoffWin: playoffGames
      .map(game => {
        const s = sidesForTeam(game, owner);
        return s && s.result === 'W' ? { game, opponent: s.opp, margin: s.pf - s.pa, pf: s.pf, pa: s.pa } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.margin - a.margin || byDateDesc(a.game, b.game))[0] || null,
    worstPlayoffLoss: playoffGames
      .map(game => {
        const s = sidesForTeam(game, owner);
        return s && s.result === 'L' ? { game, opponent: s.opp, margin: s.pf - s.pa, pf: s.pf, pa: s.pa } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.margin - b.margin || byDateDesc(a.game, b.game))[0] || null,
    bestSaundersWin: saundersGames
      .map(game => {
        const s = sidesForTeam(game, owner);
        return s && s.result === 'W' ? { game, opponent: s.opp, margin: s.pf - s.pa, pf: s.pf, pa: s.pa } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.margin - a.margin || byDateDesc(a.game, b.game))[0] || null,
  };

  return profile;
}

function rankOwners(ownerProfiles, accessor, { direction = 'desc' } = {}) {
  const rows = ownerProfiles.map(profile => ({
    owner: profile.owner,
    value: accessor(profile),
  }));
  const ranked = competitionRankRows(rows, row => row.value, { direction });
  const byOwner = new Map(ranked.map(row => [row.owner, row]));
  return { rows: ranked, byOwner };
}

function computeLeagueRanks(allOwnerProfiles) {
  const profiles = Array.isArray(allOwnerProfiles)
    ? allOwnerProfiles.slice()
    : allOwnerProfiles instanceof Map
      ? Array.from(allOwnerProfiles.values())
      : [];

  const metrics = {
    championships: rankOwners(profiles, profile => profile.counts.championships, { direction: 'desc' }),
    winPct: rankOwners(profiles, profile => profile.rates.regularWinPct, { direction: 'desc' }),
    avgFinish: rankOwners(profiles, profile => profile.rates.averageFinish, { direction: 'asc' }),
    regularTitles: rankOwners(profiles, profile => profile.counts.regularTitles, { direction: 'desc' }),
    playoffWins: rankOwners(profiles, profile => profile.totals.playoffs.wins, { direction: 'desc' }),
    weeklyCrowns: rankOwners(profiles, profile => profile.counts.weeklyCrowns, { direction: 'desc' }),
    sub70Games: rankOwners(profiles, profile => profile.counts.sub70Games, { direction: 'asc' }),
    saundersPain: rankOwners(profiles, profile => profile.counts.saundersTitles, { direction: 'asc' }),
    finishStdDev: rankOwners(profiles, profile => profile.rates.finishStdDev, { direction: 'asc' }),
    playoffWinPct: rankOwners(profiles, profile => profile.rates.playoffWinPct, { direction: 'desc' }),
  };

  const byOwner = new Map();
  for (const profile of profiles) {
    const row = {
      owner: profile.owner,
      championships: metrics.championships.byOwner.get(profile.owner) || { rank: null, value: null },
      winPct: metrics.winPct.byOwner.get(profile.owner) || { rank: null, value: null },
      avgFinish: metrics.avgFinish.byOwner.get(profile.owner) || { rank: null, value: null },
      regularTitles: metrics.regularTitles.byOwner.get(profile.owner) || { rank: null, value: null },
      playoffWins: metrics.playoffWins.byOwner.get(profile.owner) || { rank: null, value: null },
      weeklyCrowns: metrics.weeklyCrowns.byOwner.get(profile.owner) || { rank: null, value: null },
      sub70Games: metrics.sub70Games.byOwner.get(profile.owner) || { rank: null, value: null },
      saundersPain: metrics.saundersPain.byOwner.get(profile.owner) || { rank: null, value: null },
      finishStdDev: metrics.finishStdDev.byOwner.get(profile.owner) || { rank: null, value: null },
      playoffWinPct: metrics.playoffWinPct.byOwner.get(profile.owner) || { rank: null, value: null },
    };
    byOwner.set(profile.owner, row);
  }

  return { metrics, byOwner, profiles };
}

function ownerRank(leagueRanks, owner, metric) {
  return leagueRanks.byOwner.get(owner)?.[metric] || { rank: null, value: null };
}

function computeOwnerIdentity(ownerProfile, leagueRanks) {
  const ranks = leagueRanks.byOwner.get(ownerProfile.owner) || {};
  const profile = ownerProfile;
  const champCount = profile.counts.championships;
  const regularTitleCount = profile.counts.regularTitles;
  const playoffWins = profile.totals.playoffs.wins;
  const weeklyCrowns = profile.counts.weeklyCrowns;
  const top2Seeds = profile.counts.top2Seeds;
  const winPct = profile.rates.regularWinPct;
  const finishStdDev = profile.rates.finishStdDev;
  const saundersPain = profile.counts.saundersTitles;
  const playoffWinPct = profile.rates.playoffWinPct;
  const winPctRank = ranks.winPct?.rank;
  const champRank = ranks.championships?.rank;
  const regularTitleRank = ranks.regularTitles?.rank;
  const playoffWinRank = ranks.playoffWins?.rank;
  const weeklyCrownsRank = ranks.weeklyCrowns?.rank;
  const avgFinishRank = ranks.avgFinish?.rank;
  const sub70Rank = ranks.sub70Games?.rank;
  const saundersRank = ranks.saundersPain?.rank;
  const finishRank = ranks.finishStdDev?.rank;
  const dominanceSignal = [
    champRank,
    regularTitleRank,
    playoffWinRank,
    weeklyCrownsRank,
    avgFinishRank,
    sub70Rank,
  ].some(rank => Number.isFinite(rank) && rank <= 3);
  const identityLabel = (() => {
    if (champCount >= 2 || (champCount >= 1 && dominanceSignal)) return 'Dynasty Threat';
    if (regularTitleCount >= 2 && champCount === 0) return 'Regular Season Merchant';
    if ((saundersPain > 0 && Number.isFinite(saundersRank) && saundersRank <= 2) || profile.seasonLuckRows.some(row => row.luck < 0 && row.games >= 3)) return 'Snakebitten';
    if (finishStdDev > 4.5 || (Number.isFinite(finishRank) && finishRank <= 2)) return 'Boom/Bust';
    if ((playoffWinPct !== null && playoffWinPct > 0 && Number.isFinite(playoffWinRank) && playoffWinRank <= 3) || playoffWins >= 4) return 'Playoff Riser';
    if (champCount === 0 && regularTitleCount === 0 && playoffWins === 0) return 'Rebuild Resume';
    if (saundersPain === 0 && playoffWins > 0) return 'Saunders Survivor';
    if (weeklyCrowns > top2Seeds && winPct !== null && winPct >= 0.5) return 'Chaos Team';
    return 'Contender Profile';
  })();

  const summaryParts = [];
  if (champCount > 0) summaryParts.push(`${champCount} Darlings`);
  if (regularTitleCount > 0) summaryParts.push(`${regularTitleCount} regular-season titles`);
  if (top2Seeds > 0) summaryParts.push(`${top2Seeds} byes`);
  if (weeklyCrowns > 0) summaryParts.push(`${weeklyCrowns} weekly crowns`);
  if (summaryParts.length === 0) summaryParts.push('A career still in progress');
  const summary = `${summaryParts.slice(0, 3).join(', ')}${summaryParts.length > 3 ? `, and ${summaryParts[3]}` : ''}.`;

  return {
    label: identityLabel,
    summary,
    context: {
      championshipRank: champRank,
      winPctRank,
      regularTitleRank,
      playoffWinRank,
      saundersRank,
      finishRank,
    },
  };
}

function buildHeroView(ownerProfile, identity, leagueRanks) {
  const championshipRank = ownerRank(leagueRanks, ownerProfile.owner, 'championships').rank;
  const regularTitleRank = ownerRank(leagueRanks, ownerProfile.owner, 'regularTitles').rank;
  const weeklyRank = ownerRank(leagueRanks, ownerProfile.owner, 'weeklyCrowns').rank;
  const recordPct = fmtPct(ownerProfile.totals.regular.wins, ownerProfile.totals.regular.losses, ownerProfile.totals.regular.ties);
  const record = `${regularRecordString(ownerProfile)} (${recordPct})`;
  const highlights = topStatHighlights({ owner: ownerProfile.owner, leagueRanks });
  const bestAchievement = ownerProfile.counts.championships > 0
    ? `${joinYears(ownerProfile.years.champions)} Darling`
    : ownerProfile.counts.regularTitles > 0
      ? `${joinYears(ownerProfile.years.regularTitles)} regular-season title`
      : ownerProfile.bestPFSeason
        ? `${ownerProfile.bestPFSeason.season} scoring peak`
        : 'Still building';

  const worstScar = ownerProfile.counts.saundersTitles > 0
    ? `${joinYears(ownerProfile.years.saundersTitles)} Saunders`
    : ownerProfile.worstGame
      ? `${ownerProfile.worstGame.game.season} lowest outing`
      : 'No clear low point yet';

  return {
    owner: ownerProfile.owner,
    title: ownerProfile.owner,
    identityLabel: identity.label,
    summary: highlights.length
      ? 'Top-three stats are highlighted below. Win percentage is intentionally excluded.'
      : identity.summary,
    highlights,
    record,
    best: bestAchievement,
    worst: worstScar,
    rankContext: [
      Number.isFinite(championshipRank) ? `Darlings #${championshipRank}` : null,
      Number.isFinite(regularTitleRank) ? `Regular titles #${regularTitleRank}` : null,
      Number.isFinite(weeklyRank) ? `Weekly crowns #${weeklyRank}` : null,
    ].filter(Boolean).join(' | '),
  };
}

function seasonOutcomeTag(row) {
  if (row.champion) return 'Champion';
  if (row.saunders) return 'Saunders';
  if (row.bye) return 'Top-2 Seed';
  if (row.wild_card) return 'Wild Card';
  if (Number.isFinite(+row.finish)) return `Finish ${row.finish}`;
  return 'Season';
}

function computeHardwareShelf(ownerProfile, leagueRanks) {
  const rankMap = leagueRanks.byOwner.get(ownerProfile.owner) || {};
  const items = [
    {
      label: 'Darlings',
      count: ownerProfile.counts.championships,
      years: ownerProfile.years.champions,
      rank: rankMap.championships?.rank,
      context: ownerProfile.counts.championships > 0 ? 'League title hardware' : 'Still chasing the first one',
      tone: 'gold',
      icon: 'trophy',
    },
    {
      label: 'Regular-season titles',
      count: ownerProfile.counts.regularTitles,
      years: ownerProfile.years.regularTitles,
      rank: rankMap.regularTitles?.rank,
      context: ownerProfile.counts.regularTitles > 0 ? 'Regular season hardware' : 'No regular-season crown yet',
      tone: 'gold',
      icon: 'medal',
    },
    {
      label: 'Byes',
      count: ownerProfile.counts.top2Seeds,
      years: ownerProfile.years.top2Seeds,
      rank: null,
      context: 'Playoff positioning',
      tone: 'neutral',
      icon: 'beachChair',
    },
    {
      label: 'Wild cards',
      count: ownerProfile.counts.wildCards,
      years: ownerProfile.years.wildCards,
      rank: null,
      context: 'Back-door playoff appearances',
      tone: 'neutral',
      icon: 'joker',
    },
    {
      label: 'Playoff wins',
      count: ownerProfile.totals.playoffs.wins,
      years: [],
      rank: rankMap.playoffWins?.rank,
      context: 'Postseason wins',
      tone: 'neutral',
      icon: null,
    },
    {
      label: 'Saunders titles',
      count: ownerProfile.counts.saundersTitles,
      years: ownerProfile.years.saundersTitles,
      rank: rankMap.saundersPain?.rank,
      context: ownerProfile.counts.saundersTitles > 0 ? 'Saunders hardware' : 'Clean Saunders sheet',
      tone: 'scar',
      icon: 'turd',
    },
    {
      label: 'Saunders byes',
      count: ownerProfile.counts.saundersByes,
      years: ownerProfile.years.saundersByes,
      rank: null,
      context: 'Avoided the basement',
      tone: 'scar',
      icon: 'warning',
    },
    {
      label: 'Bagels',
      count: ownerProfile.counts.bagels,
      years: [],
      rank: null,
      context: 'League-wide bagels earned',
      tone: 'scar',
      icon: 'bagel',
    },
  ];

  return items;
}

function tierForSeason(row) {
  if (row.champion) return { tier: 'champion', label: 'Champion' };
  if (row.saunders) return { tier: 'saunders', label: 'Saunders' };
  if (row.bye || (+row.finish <= 2)) return { tier: 'contender', label: 'Contender' };
  if (Number.isFinite(+row.finish) && +row.finish <= 4) return { tier: 'upper', label: 'Upper tier' };
  if (Number.isFinite(+row.finish) && +row.finish >= 8) return { tier: 'pain', label: 'Pain' };
  return { tier: 'mid', label: 'Mid-table' };
}

function computeCareerShape(owner, seasonRows = []) {
  const rows = seasonRows
    .slice()
    .sort(sortSeasonAsc)
    .map(row => {
      const tier = tierForSeason(row);
      const record = `${row.wins}-${row.losses}-${row.ties || 0}`;
      const finish = Number.isFinite(+row.finish) ? `${row.finish}` : '—';
      const playoffCutoff = +row.season === 2014 ? 4 : 6;
      const pf = Number.isFinite(+row.points_for) ? fmtDecimal(row.points_for, 1) : '—';
      const pa = Number.isFinite(+row.points_against) ? fmtDecimal(row.points_against, 1) : '—';
      const diff = Number.isFinite(+row.points_for) && Number.isFinite(+row.points_against)
        ? fmtSigned(+row.points_for - +row.points_against, 1)
        : '—';
      return {
        season: +row.season,
        owner,
        tier: tier.tier,
        label: tier.label,
        record,
        finish,
        playoffCutoff,
        pf,
        pa,
        diff,
        title: `${row.season}: ${tier.label} | ${record} | Finish ${finish} | PF ${pf} | PA ${pa} | Diff ${diff} | Playoff cutoff ${playoffCutoff}`,
      };
    });

  return {
    owner,
    rows,
    summary: rows.length ? `${rows.length} seasons on the board` : 'No seasons recorded',
  };
}

function signatureSeasonReason(row, profile) {
  const reasons = [];
  if (row.champion) reasons.push('Champion');
  if (profile.bestPFSeason && +profile.bestPFSeason.season === +row.season) reasons.push('Best scoring season');
  if (profile.bestDiffSeason && +profile.bestDiffSeason.season === +row.season) reasons.push('Best differential season');
  if (profile.mostUnluckySeason && +profile.mostUnluckySeason.season === +row.season) reasons.push('Most unlucky season');
  if (profile.worstFinishSeason && +profile.worstFinishSeason.season === +row.season) reasons.push('Worst finish');
  if (row.bye && !profile.years?.regularTitles?.includes(+row.season)) reasons.push('Bye');
  if (row.saunders) reasons.push('Saunders');
  if (row.wild_card) reasons.push('Wild card');
  if (row.bagels_earned !== null && row.bagels_earned !== undefined) reasons.push(`Bagels earned ${row.bagels_earned}`);
  return uniquePreserveOrder(reasons);
}

function computeSignatureSeasons(ownerProfile) {
  const rows = ownerProfile.seasonRows.slice();
  const candidates = [];
  const addCandidate = (season, badge, reason, priority) => {
    if (!Number.isFinite(+season)) return;
    const key = +season;
    let existing = candidates.find(item => item.season === key);
    if (!existing) {
      existing = { season: key, badge, reasons: [], priority };
      candidates.push(existing);
    }
    if (badge && (!existing.badge || priority < existing.priority)) existing.badge = badge;
    existing.priority = Math.min(existing.priority, priority);
    if (reason) existing.reasons.push(reason);
  };

  for (const row of rows) {
    if (row.champion) addCandidate(row.season, 'Champion', 'Champion', 0);
    if (ownerProfile.years.regularTitles.includes(+row.season)) addCandidate(row.season, 'Regular-season title', 'Regular-season title', 1);
    if (row.saunders) addCandidate(row.season, 'Saunders', 'Saunders', 4);
    if (row.bye && !ownerProfile.years.regularTitles.includes(+row.season)) addCandidate(row.season, 'Bye', 'Bye', 5);
    if (row.wild_card) addCandidate(row.season, 'Wild card', 'Wild card', 6);
  }
  if (ownerProfile.bestPFSeason) addCandidate(ownerProfile.bestPFSeason.season, 'Best PF', 'Best scoring season', 2);
  if (ownerProfile.bestDiffSeason) addCandidate(ownerProfile.bestDiffSeason.season, 'Best Diff', 'Best differential season', 2);
  if (ownerProfile.mostUnluckySeason) addCandidate(ownerProfile.mostUnluckySeason.season, 'Most Unlucky', 'Most unlucky season', 3);
  if (ownerProfile.worstFinishSeason) addCandidate(ownerProfile.worstFinishSeason.season, 'Worst Finish', 'Worst finish', 5);

  if (!candidates.length && rows.length) {
    const row = rows[0];
    candidates.push({
      season: +row.season,
      badge: 'Season',
      reasons: ['Season summary'],
      priority: 9,
    });
  }

  return candidates
    .sort((a, b) => a.priority - b.priority || b.season - a.season)
    .slice(0, 6)
    .map(item => {
      const row = rows.find(r => +r.season === item.season) || null;
      const record = row ? `${row.wins}-${row.losses}-${row.ties || 0}` : '—';
      const finish = row && Number.isFinite(+row.finish) ? `${row.finish}` : '—';
      const pf = row && Number.isFinite(+row.points_for) ? fmtDecimal(row.points_for, 1) : '—';
      const pa = row && Number.isFinite(+row.points_against) ? fmtDecimal(row.points_against, 1) : '—';
      const diff = row && Number.isFinite(+row.points_for) && Number.isFinite(+row.points_against)
        ? fmtSigned(+row.points_for - +row.points_against, 1)
        : '—';
      const reasons = uniquePreserveOrder([
        ...item.reasons,
        ...(row ? signatureSeasonReason(row, ownerProfile) : []),
      ]).slice(0, 3);
      return {
        season: item.season,
        badge: item.badge || 'Season',
        record,
        finish,
        pf,
        pa,
        diff,
        reason: reasons.join(' • '),
        summary: row ? `${row.season} ${item.badge || 'Season'}` : `${item.season} ${item.badge || 'Season'}`,
      };
    });
}

function achievementAndScarItems(ownerProfile) {
  const bestScore = ownerProfile.bestGame;
  const worstScore = ownerProfile.worstGame;
  const biggestWin = ownerProfile.biggestWin;
  const biggestLoss = ownerProfile.biggestLoss;
  const bestDiffSeason = ownerProfile.bestDiffSeason;
  const mostUnluckySeason = ownerProfile.mostUnluckySeason;
  const bestSeason = ownerProfile.bestPFSeason || ownerProfile.bestDiffSeason || ownerProfile.seasonRows[0] || null;
  const bestSeasonRecord = bestSeason ? `${bestSeason.wins}-${bestSeason.losses}-${bestSeason.ties || 0}` : '—';
  const bestSeasonFinish = bestSeason && Number.isFinite(+bestSeason.finish) ? `${bestSeason.finish}` : '—';
  const bestSeasonDiff = bestSeason && Number.isFinite(+bestSeason.points_for) && Number.isFinite(+bestSeason.points_against)
    ? fmtSigned(+bestSeason.points_for - +bestSeason.points_against, 1)
    : '—';
  const bestSeasonDetail = bestSeason
    ? `${bestSeasonRecord} • Finish ${bestSeasonFinish} • Diff ${bestSeasonDiff}`
    : 'No season yet';
  const unluckyLuckRow = mostUnluckySeason
    ? ownerProfile.seasonLuckRows.find(row => +row.season === +mostUnluckySeason.season) || null
    : null;
  const unluckyExpectedRecord = unluckyLuckRow
    ? `${fmtDecimal(unluckyLuckRow.expectedWins, 1)}-${fmtDecimal(Math.max(0, unluckyLuckRow.games - unluckyLuckRow.expectedWins), 1)}`
    : null;
  const unluckyLuckValue = Number.isFinite(unluckyLuckRow?.luck) ? unluckyLuckRow.luck : mostUnluckySeason?.luck;
  const unluckySeasonDetail = mostUnluckySeason
    ? `Record ${mostUnluckySeason.wins}-${mostUnluckySeason.losses}-${mostUnluckySeason.ties || 0} • Expected ${unluckyExpectedRecord || '—'} • Luck ${fmtSigned(unluckyLuckValue, 2)}`
    : null;

  const achievements = [
    bestSeason ? {
      label: 'Best regular season',
      value: `${bestSeason.season}`,
      detail: bestSeasonDetail,
    } : null,
    bestScore ? {
      label: 'Highest weekly score',
      value: `${fmtDecimal(bestScore.pf, 1)}`,
      detail: `${bestScore.game.date} vs ${bestScore.opponent}`,
    } : null,
    biggestWin ? {
      label: 'Best win margin',
      value: fmtSigned(biggestWin.margin, 1),
      detail: `${biggestWin.game.date} vs ${biggestWin.opponent}`,
    } : null,
  ].filter(Boolean);

  const scars = [
    mostUnluckySeason ? {
      label: 'Most unlucky season',
      value: `${mostUnluckySeason.season}`,
      detail: unluckySeasonDetail || `Luck ${fmtSigned(mostUnluckySeason.luck, 2)}`,
    } : null,
    worstScore ? {
      label: 'Worst weekly score',
      value: `${fmtDecimal(worstScore.pf, 1)}`,
      detail: `${worstScore.game.date} vs ${worstScore.opponent}`,
    } : null,
    biggestLoss ? {
      label: 'Biggest loss',
      value: fmtSigned(biggestLoss.margin, 1),
      detail: `${biggestLoss.game.date} vs ${biggestLoss.opponent}`,
    } : null,
  ].filter(Boolean);

  return {
    achievements,
    scars,
    bestAchievement: achievements[0] || null,
    worstScar: scars[0] || null,
  };
}

function describeGameMoment(kind, row) {
  if (!row) return null;
  const scoreline = `${fmtDecimal(row.pf, 1)}-${fmtDecimal(row.pa, 1)}`;
  const note = kind === 'luck' && Number.isFinite(row.luckDelta)
    ? `Luck ${fmtSigned(row.luckDelta, 2)} vs expectation`
    : kind === 'playoff'
      ? `Playoff ${row.margin >= 0 ? 'win' : 'loss'}`
      : '';
  return {
    label: kind,
    value: kind === 'bestScore' || kind === 'worstScore' ? fmtDecimal(row.pf, 1) : fmtSigned(row.margin, 1),
    date: row.game.date,
    season: row.game.season,
    opponent: row.opponent,
    scoreline,
    note,
  };
}

function computeOwnerMoments(owner, leagueGames = []) {
  const ownerGames = leagueGames
    .filter(game => game.teamA === owner || game.teamB === owner)
    .map(game => {
      const s = sidesForTeam(game, owner);
      if (!s) return null;
      const xw = isRegularGame(game) ? computeExpectedWinForGame(leagueGames, owner, game) : null;
      return {
        game,
        opponent: s.opp,
        pf: s.pf,
        pa: s.pa,
        margin: s.pf - s.pa,
        result: s.result,
        xw,
        luckDelta: xw === null ? null : ((s.result === 'W' ? 1 : s.result === 'T' ? 0.5 : 0) - xw),
      };
    })
    .filter(Boolean)
    .sort(byDateAsc);

  const regularGames = ownerGames.filter(row => isRegularGame(row.game));

  const moments = [
    regularGames.length ? {
      label: 'Highest score',
      value: fmtDecimal(regularGames.filter(row => +row.game.season !== 2014).slice().sort((a, b) => b.pf - a.pf || byDateDesc(a.game, b.game))[0]?.pf, 1),
      item: regularGames.filter(row => +row.game.season !== 2014).slice().sort((a, b) => b.pf - a.pf || byDateDesc(a.game, b.game))[0] || null,
    } : null,
    ownerGames.length ? {
      label: 'Lowest score',
      value: fmtDecimal(ownerGames.slice().sort((a, b) => a.pf - b.pf || byDateDesc(a.game, b.game))[0].pf, 1),
      item: ownerGames.slice().sort((a, b) => a.pf - b.pf || byDateDesc(a.game, b.game))[0],
    } : null,
    ownerGames.length ? {
      label: 'Biggest win',
      value: fmtSigned(ownerGames.filter(row => row.margin > 0).slice().sort((a, b) => b.margin - a.margin || byDateDesc(a.game, b.game))[0]?.margin, 1),
      item: ownerGames.filter(row => row.margin > 0).slice().sort((a, b) => b.margin - a.margin || byDateDesc(a.game, b.game))[0] || null,
    } : null,
    ownerGames.length ? {
      label: 'Biggest loss',
      value: fmtSigned(ownerGames.filter(row => row.margin < 0).slice().sort((a, b) => a.margin - b.margin || byDateDesc(a.game, b.game))[0]?.margin, 1),
      item: ownerGames.filter(row => row.margin < 0).slice().sort((a, b) => a.margin - b.margin || byDateDesc(a.game, b.game))[0] || null,
    } : null,
  ].filter(item => item && item.item);

  return moments.slice(0, 8).map(item => {
    const row = item.item;
    const scoreline = `${fmtDecimal(row.pf, 1)}-${fmtDecimal(row.pa, 1)}`;
    return {
      label: item.label,
      value: item.value,
      date: row.game.date,
      season: row.game.season,
      opponent: row.opponent,
      scoreline,
      note: '',
    };
  });
}

function computeSeasonLedger(owner, seasonRows = [], opts = {}) {
  return seasonRows
    .slice()
    .sort(sortSeasonDesc)
    .map(row => {
      const notes = formatLedgerNotes(row);
      const finish = Number.isFinite(+row.finish) ? `${row.finish}` : '—';
      const pf = Number.isFinite(+row.points_for) ? fmtDecimal(row.points_for, 1) : '—';
      const pa = Number.isFinite(+row.points_against) ? fmtDecimal(row.points_against, 1) : '—';
      const diff = Number.isFinite(+row.points_for) && Number.isFinite(+row.points_against)
        ? fmtSigned(+row.points_for - +row.points_against, 1)
        : '—';
      return {
        season: +row.season,
        record: `${row.wins}-${row.losses}-${row.ties || 0}`,
        finish,
        pf,
        pa,
        diff,
        notes,
      };
    });
}

function buildTrophyCaseViewModel(owner, opts = {}) {
  const seasonSummaries = Array.isArray(opts.seasonSummaries) ? opts.seasonSummaries : [];
  const leagueGames = Array.isArray(opts.leagueGames) ? opts.leagueGames : [];
  const allOwners = uniquePreserveOrder([
    ...seasonSummaries.map(row => row.owner).filter(Boolean),
    ...leagueGames.flatMap(game => [game.teamA, game.teamB]).filter(Boolean),
  ]);
  const allOwnerProfiles = allOwners.map(ownerName => buildOwnerCareerProfile(ownerName, seasonSummaries, leagueGames, opts));
  const leagueRanks = computeLeagueRanks(allOwnerProfiles);
  const ownerProfile = allOwnerProfiles.find(profile => profile.owner === owner)
    || buildOwnerCareerProfile(owner, seasonSummaries, leagueGames, opts);
  const identity = computeOwnerIdentity(ownerProfile, leagueRanks);
  const hero = buildHeroView(ownerProfile, identity, leagueRanks);
  const hardwareShelf = computeHardwareShelf(ownerProfile, leagueRanks);
  const careerShape = computeCareerShape(ownerProfile.owner, ownerProfile.seasonRows);
  const achievementScar = achievementAndScarItems(ownerProfile);
  const seasonLedger = computeSeasonLedger(ownerProfile.owner, ownerProfile.seasonRows, opts);

  return {
    owner,
    identity,
    hero,
    hardwareShelf,
    leagueRanks,
    careerShape,
    achievements: achievementScar.achievements,
    scars: achievementScar.scars,
    seasonLedger,
  };
}

function trophyHeroHtml(view) {
  const highlights = Array.isArray(view.hero?.highlights) ? view.hero.highlights : [];
  const chipHtml = highlights.length
    ? `<div class="trophy-chip-row">${highlights.map(item => `
      <span class="trophy-chip">
        ${item.icon ? `<img class="trophy-chip-icon" src="${esc(hardwareArt(item.icon))}" alt="" />` : ''}
        <span>${esc(item.value)} ${esc(item.label)}</span>
        <strong>${esc(item.rankText)}</strong>
      </span>
    `).join('')}</div>`
    : '';
  return `
    <div class="trophy-hero-title">
      <div class="trophy-identity">${esc(view.hero?.identityLabel || view.identity?.label || 'Contender Profile')}</div>
      <h3>${esc(view.hero?.title || view.owner || '')}</h3>
    </div>
    <p class="trophy-hero-summary">${esc(view.hero?.summary || view.identity?.summary || 'No summary available')}</p>
    ${chipHtml}
    <div class="trophy-hero-record">${esc(view.hero?.record || '—')}</div>
    <div class="trophy-hero-rank">${esc(view.hero?.rankContext || '')}</div>
    <div class="trophy-hero-split">
      <div><strong>Best:</strong> ${esc(view.hero?.best || '—')}</div>
      <div><strong>Worst:</strong> ${esc(view.hero?.worst || '—')}</div>
    </div>
  `;
}

function trophyHardwareShelfHtml(view) {
  const items = Array.isArray(view.hardwareShelf) ? view.hardwareShelf : [];
  if (!items.length) {
    return '<div class="trophy-empty">No hardware yet.</div>';
  }
  return items.map(item => `
    <article class="trophy-hardware-card ${esc(item.tone || 'neutral')}">
      <div class="trophy-card-top">
        <div class="trophy-card-title">
          ${item.icon ? `<img class="trophy-card-art" src="${esc(hardwareArt(item.icon))}" alt="" />` : ''}
          <div class="trophy-year-chip">${esc(item.label)}</div>
        </div>
        <div class="trophy-card-rank">${Number.isFinite(item.rank) ? `#${item.rank}` : '—'}</div>
      </div>
      <div class="trophy-card-value">${fmtWhole(item.count)}</div>
      <div class="trophy-card-years">${item.years && item.years.length ? esc(joinYears(item.years)) : '—'}</div>
    </article>
  `).join('');
}

function trophyRankStripHtml(view) {
  const owner = view.owner;
  const ranks = view.leagueRanks?.byOwner.get(owner) || {};
  const strip = [
    { label: 'Championships', rank: ranks.championships?.rank, value: `${view.hardwareShelf?.[0]?.count ?? 0}` },
    { label: 'Average Finish', rank: ranks.avgFinish?.rank, value: Number.isFinite(ranks.avgFinish?.value) ? fmtDecimal(ranks.avgFinish.value, 1) : '—' },
    { label: 'Regular Titles', rank: ranks.regularTitles?.rank, value: `${view.hardwareShelf?.[1]?.count ?? 0}` },
    { label: 'Playoff Wins', rank: ranks.playoffWins?.rank, value: `${view.leagueRanks?.byOwner.get(owner)?.playoffWins?.value ?? 0}` },
    { label: 'Weekly Crowns', rank: ranks.weeklyCrowns?.rank, value: `${view.leagueRanks?.byOwner.get(owner)?.weeklyCrowns?.value ?? 0}` },
    { label: 'Sub-70 Games', rank: ranks.sub70Games?.rank, value: `${view.leagueRanks?.byOwner.get(owner)?.sub70Games?.value ?? 0}` },
    { label: 'Saunders Pain', rank: ranks.saundersPain?.rank, value: `${view.leagueRanks?.byOwner.get(owner)?.saundersPain?.value ?? 0}` },
  ];

  return strip.map(item => `
    <div class="trophy-rank-pill">
      <div class="trophy-rank-pill-label">${esc(item.label)}</div>
      <div class="trophy-rank-pill-value">${Number.isFinite(item.rank) ? `#${item.rank}` : '—'}</div>
      <div class="trophy-rank-pill-sub">${esc(item.value)}</div>
    </div>
  `).join('');
}

function trophyCareerShapeHtml(view) {
  const rows = Array.isArray(view.careerShape?.rows) ? view.careerShape.rows : [];
  if (!rows.length) {
    return '<div class="trophy-empty">No seasons recorded.</div>';
  }
  const has2014 = rows.some(row => +row.season === 2014);
  const fallbackRows = rows.map(row => `
    <li>
      <span>${esc(row.season)}</span>
      <strong>${esc(row.finish)}</strong>
      <span>${esc(row.label)} · ${esc(row.record)}</span>
    </li>
  `).join('');
  return `
    <div class="trophy-career-chart chart-shell">
      <div class="trophy-career-header">
        <div>
          <div class="trophy-career-title">Season finish trend</div>
          <div class="trophy-career-subtitle">Lower is better. Playoff cutoff is 6th, except 2014 when it was 4th.</div>
        </div>
        <div class="trophy-career-legend">
          <span><img src="${esc(hardwareArt('trophy'))}" alt="" /> Champion</span>
          <span><span class="legend-swatch playoff"></span> Playoff finish</span>
          <span><img src="${esc(hardwareArt('turd'))}" alt="" /> Saunders</span>
          <span><span class="legend-swatch miss"></span> Missed playoffs</span>
        </div>
      </div>
      <div id="trophyCareerPlot" class="chart-host trophy-career-host" aria-label="Season finish trend"></div>
      <ol class="chart-fallback trophy-career-fallback" aria-label="Season finish values">${fallbackRows}</ol>
    </div>
    <div class="trophy-career-summary">${esc(view.careerShape?.summary || '')}${has2014 ? ' 2014 used a top-4 playoff cutoff.' : ''}</div>
  `;
}

function trophySignatureSeasonsHtml(view) {
  const items = Array.isArray(view.signatureSeasons) ? view.signatureSeasons : [];
  if (!items.length) {
    return '<div class="trophy-empty">No signature seasons yet.</div>';
  }
  return items.map(item => `
    <article class="trophy-season-card">
      <div class="trophy-season-card-head">
        <div>
          <div class="trophy-year-chip">${esc(item.season)}</div>
          <div class="trophy-season-badge">${esc(item.badge)}</div>
        </div>
        <div class="trophy-season-card-reason">${esc(item.reason || 'Season highlight')}</div>
      </div>
      <div class="trophy-season-card-grid">
        <div><span>Record</span><strong>${esc(item.record)}</strong></div>
        <div><span>Finish</span><strong>${esc(item.finish)}</strong></div>
        <div><span>PF</span><strong>${esc(item.pf)}</strong></div>
        <div><span>PA</span><strong>${esc(item.pa)}</strong></div>
        <div><span>Diff</span><strong>${esc(item.diff)}</strong></div>
      </div>
    </article>
  `).join('');
}

function renderListSection(items, emptyText, tone) {
  if (!items.length) return `<div class="trophy-empty">${esc(emptyText)}</div>`;
  return `<ul class="trophy-list ${tone ? `tone-${tone}` : ''}">
    ${items.map(item => `
      <li>
        <span class="trophy-list-label">${esc(item.label)}</span>
        <span class="trophy-list-value">${esc(item.value)}</span>
        <span class="trophy-list-detail">${esc(item.detail || '')}</span>
      </li>
    `).join('')}
  </ul>`;
}

function trophyAchievementListHtml(view) {
  return renderListSection(Array.isArray(view.achievements) ? view.achievements : [], 'No highlights yet.', 'gold');
}

function trophyScarListHtml(view) {
  return renderListSection(Array.isArray(view.scars) ? view.scars : [], 'No low points yet.', 'scar');
}

function trophyMomentGridHtml(view) {
  const items = Array.isArray(view.moments) ? view.moments : [];
  if (!items.length) return '<div class="trophy-empty">No moments recorded.</div>';
  return items.map(item => `
    <article class="trophy-moment-card">
      <div class="trophy-moment-label">${esc(item.label)}</div>
      <div class="trophy-moment-value">${esc(item.value)}</div>
      <div class="trophy-moment-meta">${esc(item.date)} • ${esc(item.season)} • ${esc(item.opponent)}</div>
      <div class="trophy-moment-score">${esc(item.scoreline)}</div>
      ${item.note ? `<div class="trophy-moment-note">${esc(item.note)}</div>` : ''}
    </article>
  `).join('');
}

function trophySeasonLedgerHtml(view) {
  const items = Array.isArray(view.seasonLedger) ? view.seasonLedger : [];
  if (!items.length) {
    return '<tr><td colspan="7" class="muted">No seasons recorded for this owner.</td></tr>';
  }
  return items.map(row => `
    <tr>
      <td>${esc(row.season)}</td>
      <td>${esc(row.record)}</td>
      <td>${esc(row.finish)}</td>
      <td>${esc(row.pf)}</td>
      <td>${esc(row.pa)}</td>
      <td>${esc(row.diff)}</td>
      <td>${row.notes.length ? row.notes.map(note => `<span class="table-note-chip">${esc(note)}</span>`).join(' ') : ''}</td>
    </tr>
  `).join('');
}

function renderInto(selector, html, doc) {
  const root = docOrDefault(doc);
  if (!root) return;
  const el = root.querySelector(selector);
  if (!el) return;
  el.innerHTML = html;
}

function renderTrophyHero(view, opts = {}) {
  renderInto('#trophyHero', trophyHeroHtml(view), opts.doc);
}

function renderTrophyHardwareShelf(view, opts = {}) {
  renderInto('#trophyHardwareShelf', trophyHardwareShelfHtml(view), opts.doc);
}

function renderTrophyRankStrip(view, opts = {}) {
  renderInto('#trophyRankStrip', trophyRankStripHtml(view), opts.doc);
}

function renderTrophyCareerShape(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const el = typeof root.querySelector === 'function' ? root.querySelector('#trophyCareerShape') : null;
  if (!el) return;
  el.innerHTML = trophyCareerShapeHtml(view);
  const host = typeof root.getElementById === 'function' ? root.getElementById('trophyCareerPlot') : null;
  renderTrophyCareerPlot(host, view);
}

function renderTrophySignatureSeasons(view, opts = {}) {
  renderInto('#trophySignatureSeasons', trophySignatureSeasonsHtml(view), opts.doc);
}

function renderTrophyAchievementList(view, opts = {}) {
  renderInto('#trophyAchievementList', trophyAchievementListHtml(view), opts.doc);
}

function renderTrophyScarList(view, opts = {}) {
  renderInto('#trophyScarList', trophyScarListHtml(view), opts.doc);
}

function renderTrophyMomentGrid(view, opts = {}) {
  renderInto('#trophyMomentGrid', trophyMomentGridHtml(view), opts.doc);
}

function renderTrophySeasonLedger(view, opts = {}) {
  const root = docOrDefault(opts.doc);
  if (!root) return;
  const tbody = root.querySelector('#trophySeasonTable tbody');
  if (!tbody) return;
  tbody.innerHTML = trophySeasonLedgerHtml(view);
}

export {
  buildOwnerCareerProfile,
  computeLeagueRanks,
  computeOwnerIdentity,
  computeHardwareShelf,
  computeCareerShape,
  computeSignatureSeasons,
  achievementAndScarItems as computeAchievementAndScarLists,
  computeOwnerMoments,
  computeSeasonLedger,
  buildTrophyCaseViewModel,
  trophyHeroHtml,
  trophyHardwareShelfHtml,
  trophyRankStripHtml,
  trophyCareerShapeHtml,
  trophyAchievementListHtml,
  trophyScarListHtml,
  trophySeasonLedgerHtml,
  renderTrophyHero,
  renderTrophyHardwareShelf,
  renderTrophyRankStrip,
  renderTrophyCareerShape,
  renderTrophyAchievementList,
  renderTrophyScarList,
  renderTrophySeasonLedger,
};
