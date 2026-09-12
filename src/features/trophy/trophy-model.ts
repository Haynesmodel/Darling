// Trophy calculations are kept pure so the view and the tests share one typed boundary.
import {
  computeRegularSeasonChampYears,
  fmtPct,
  isPlayoffGame,
  isRegularGame,
  isSaundersGame,
  sidesForTeam,
} from '../../../js/core-helpers.js';
import {
  computeExpectedWinForGame,
  computeWeeklyAwards,
} from '../../../js/stats-helpers.js';
import { isLowestScoreEligible } from '../../../js/lowest-score-policy.js';

import type { H2HGame, SeasonSummaryRow } from '../../data/generated/asset-types';
import type {
  TrophyAchievementAndScarLists,
  TrophyCareerRow,
  TrophyGameRow,
  TrophyHardwareItem,
  TrophyHero,
  TrophyHeroHighlight,
  TrophyIdentity,
  TrophyLeagueRanks,
  TrophyListItem,
  TrophyMetricKey,
  TrophyModelOptions,
  TrophyOwnerCareerProfile,
  TrophyOwnerCareerSource,
  TrophyOwnerMoment,
  TrophyOwnerRanks,
  TrophyRankMetric,
  TrophyRankRow,
  TrophyRankValue,
  TrophyRecord,
  TrophySeasonAggregate,
  TrophySeasonGameLog,
  TrophySeasonLedgerRow,
  TrophySeasonLuckRow,
  TrophySignatureSeason,
  TrophyViewModel,
  TrophyWeeklyAwards,
} from './trophy-types';

interface ModelOptions {
  seasonSummaries: readonly SeasonSummaryRow[];
  leagueGames: readonly H2HGame[];
  weeklyAwards: TrophyWeeklyAwards | null;
  seasonAggregates: readonly TrophySeasonAggregate[];
  ownerCareers: readonly TrophyOwnerCareerSource[];
}

const EMPTY_MODEL_OPTIONS: ModelOptions = Object.freeze({
  seasonSummaries: [],
  leagueGames: [],
  weeklyAwards: null,
  seasonAggregates: [],
  ownerCareers: [],
});

interface GameSide {
  pf: number;
  pa: number;
  opp: string;
  result: 'W' | 'L' | 'T';
}

interface SignatureSeasonCandidate {
  season: number;
  badge: string;
  reasons: string[];
  priority: number;
}

interface OwnerMomentCandidate {
  label: string;
  value: string;
  item: TrophyGameRow;
}

interface TrophyListCandidate {
  item: TrophyListItem;
  sourceKey: string;
  priority: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toNumber(value: unknown, fallback: number | null = null): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isCountRow(value: unknown): value is { team: string; count: number } {
  return isRecord(value) && typeof value.team === 'string' && toNumber(value.count) !== null;
}

function normalizeWeeklyAwards(value: unknown): TrophyWeeklyAwards | null {
  if (!isRecord(value)) return null;
  const lists = ['top', 'low', 'high150'] as const;
  if (!lists.every(key => Array.isArray(value[key]))) return null;
  return {
    top: (value.top as unknown[]).filter(isCountRow).map(row => ({ team: row.team, count: Number(row.count) })),
    low: (value.low as unknown[]).filter(isCountRow).map(row => ({ team: row.team, count: Number(row.count) })),
    high150: (value.high150 as unknown[]).filter(isCountRow).map(row => ({ team: row.team, count: Number(row.count) })),
  };
}

function isSeasonAggregate(value: unknown): value is TrophySeasonAggregate {
  return isRecord(value)
    && typeof value.team === 'string'
    && toNumber(value.season) !== null
    && toNumber(value.expWins) !== null
    && toNumber(value.luck) !== null;
}

function normalizeSeasonAggregate(value: TrophySeasonAggregate): TrophySeasonAggregate {
  return {
    team: value.team,
    season: Number(value.season),
    expWins: Number(value.expWins),
    luck: Number(value.luck),
  };
}

function isOwnerCareerSource(value: unknown): value is TrophyOwnerCareerSource {
  return isRecord(value)
    && typeof value.owner === 'string'
    && ['wins', 'losses', 'ties', 'points_for', 'points_against', 'weekly_crowns']
      .every(key => toNumber(value[key]) !== null);
}

function normalizeOwnerCareerSource(value: TrophyOwnerCareerSource): TrophyOwnerCareerSource {
  return {
    owner: value.owner,
    wins: Number(value.wins),
    losses: Number(value.losses),
    ties: Number(value.ties),
    points_for: Number(value.points_for),
    points_against: Number(value.points_against),
    weekly_crowns: Number(value.weekly_crowns),
  };
}

function normalizeModelOptions(options: TrophyModelOptions): ModelOptions {
  return {
    seasonSummaries: Array.isArray(options.seasonSummaries) ? options.seasonSummaries : [],
    leagueGames: Array.isArray(options.leagueGames) ? options.leagueGames : [],
    weeklyAwards: normalizeWeeklyAwards(options.weeklyAwards),
    seasonAggregates: Array.isArray(options.seasonAggregates)
      ? options.seasonAggregates.filter(isSeasonAggregate).map(normalizeSeasonAggregate)
      : [],
    ownerCareers: Array.isArray(options.ownerCareers)
      ? options.ownerCareers.filter(isOwnerCareerSource).map(normalizeOwnerCareerSource)
      : [],
  };
}

function sideForGame(game: H2HGame, owner: string): GameSide | null {
  const candidate: unknown = sidesForTeam(game, owner);
  if (!isRecord(candidate) || typeof candidate.opp !== 'string') return null;
  const pf = toNumber(candidate.pf);
  const pa = toNumber(candidate.pa);
  const result = candidate.result;
  if (pf === null || pa === null || (result !== 'W' && result !== 'L' && result !== 'T')) return null;
  return { pf, pa, opp: candidate.opp, result };
}

function expectedWinForGame(games: readonly H2HGame[], owner: string, game: H2HGame): number | null {
  return toNumber(computeExpectedWinForGame(games, owner, game));
}

function gameIsRegular(game: H2HGame): boolean {
  return Boolean(isRegularGame(game));
}

function gameIsPlayoff(game: H2HGame): boolean {
  return Boolean(isPlayoffGame(game));
}

function gameIsSaunders(game: H2HGame): boolean {
  return Boolean(isSaundersGame(game));
}

function byGameDateAsc(a: H2HGame, b: H2HGame): number {
  return a.date.localeCompare(b.date) || stableGameKey(a).localeCompare(stableGameKey(b));
}

function byGameDateDesc(a: H2HGame, b: H2HGame): number {
  return b.date.localeCompare(a.date) || stableGameKey(a).localeCompare(stableGameKey(b));
}

function stableGameKey(game: H2HGame): string {
  return `${game.season}:${game.date}:${game.teamA}:${game.teamB}:${game.week}:${game.type}:${game.round || ''}`;
}

function byMomentDateDesc(a: TrophyGameRow, b: TrophyGameRow): number {
  return byGameDateDesc(a.game, b.game);
}

function byMomentDateAsc(a: TrophyGameRow, b: TrophyGameRow): number {
  return byGameDateAsc(a.game, b.game);
}

function regularTitleYears(owner: string, rows: readonly SeasonSummaryRow[]): number[] {
  const result: unknown = computeRegularSeasonChampYears(owner, rows);
  return Array.isArray(result)
    ? result.map(value => toNumber(value)).filter((value): value is number => value !== null)
    : [];
};

function fmtDecimal(value: unknown, digits = 1): string {
  const numeric = toNumber(value);
  return numeric === null ? '—' : numeric.toFixed(digits);
}

function fmtSigned(value: unknown, digits = 1): string {
  const n = toNumber(value);
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function joinYears(years: readonly (number | string)[]): string {
  if (!Array.isArray(years) || years.length === 0) return '—';
  return years.slice().sort((a, b) => +a - +b).join(', ');
}

function uniquePreserveOrder<T>(values: readonly T[]): T[] {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function sortSeasonDesc(a: SeasonSummaryRow, b: SeasonSummaryRow): number {
  return b.season - a.season;
}

function sortSeasonAsc(a: SeasonSummaryRow, b: SeasonSummaryRow): number {
  return a.season - b.season;
}

function regularRecordString(profile: TrophyOwnerCareerProfile): string {
  const { wins, losses, ties } = profile.totals.regular;
  return `${wins}-${losses}-${ties}`;
}

function calcPctFromRecord(record: TrophyRecord): number | null {
  const games = record.wins + record.losses + record.ties;
  if (!games) return null;
  return ((record.wins + 0.5 * record.ties) / games);
}

function finiteValues(values: readonly unknown[]): number[] {
  return values.map(value => toNumber(value)).filter((value): value is number => value !== null);
}

function calcAvg(values: readonly unknown[]): number | null {
  const nums = finiteValues(values);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function calcStdDev(values: readonly unknown[]): number {
  const nums = finiteValues(values);
  if (nums.length < 2) return 0;
  const avg = calcAvg(nums);
  const variance = nums.reduce((sum, value) => sum + ((value - (avg ?? 0)) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function ordinalText(value: unknown): string {
  const numeric = toNumber(value);
  if (numeric === null) return '—';
  const n = Math.round(numeric);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function valueRankText(rank: unknown, tied = false): string {
  const numeric = toNumber(rank);
  if (numeric === null) return '—';
  return tied && numeric > 1 ? `T-${numeric}` : ordinalText(numeric);
}

function hardwareArt(kind: string): string {
  const files: Record<string, string> = {
    trophy: 'trophy.svg',
    medal: 'medal.svg',
    bagel: 'bagel.svg',
    warning: 'warning.svg',
    football: 'football.svg',
    beachChair: 'beach-chair.svg',
    joker: 'joker.svg',
    turd: 'turd.svg',
  };
  const file = files[kind];
  return file ? `assets/trophy/${file}` : '';
}

function topStatHighlights(view: { owner: string; leagueRanks: TrophyLeagueRanks }): TrophyHeroHighlight[] {
  const owner = view.owner;
  const metrics = view.leagueRanks.metrics;
  const keys: Array<[TrophyMetricKey, string, string | null, TrophyRankMetric]> = [
    ['championships', 'Darlings', 'trophy', metrics.championships],
    ['regularTitles', 'Regular Titles', 'medal', metrics.regularTitles],
    ['weeklyCrowns', 'Weekly Crowns', 'medal', metrics.weeklyCrowns],
    ['playoffWins', 'Playoff Wins', 'football', metrics.playoffWins],
    ['top2Seeds', 'Byes', 'beachChair', metrics.top2Seeds],
    ['avgFinish', 'Avg Finish', null, metrics.avgFinish],
    ['sub70Games', 'Sub-70 Games', 'warning', metrics.sub70Games],
    ['saundersPain', 'Saunders Titles', 'warning', metrics.saundersPain],
  ];

  const items: TrophyHeroHighlight[] = [];
  for (const [key, label, icon, metric] of keys) {
    const metricRow = metric.rows.find(row => row.owner === owner) || null;
    if (!metricRow || metricRow.rank === null || metricRow.rank > 3) continue;
    const tied = metric.rows.filter(row => row.value === metricRow.value).length > 1;
    const value = metricRow.value !== null
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

function formatLedgerNotes(row: SeasonSummaryRow): string[] {
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

function competitionRankRows<T extends { owner: string }>(
  rows: readonly T[],
  accessor: (row: T) => number | null,
  { direction = 'desc' }: { direction?: 'asc' | 'desc' } = {},
): TrophyRankRow[] {
  const scored = rows.map(row => {
    const value = toNumber(accessor(row));
    return { row, value };
  });

  const filtered = scored
    .filter((item): item is { row: T; value: number } => item.value !== null)
    .sort((a, b) => {
      if (a.value === b.value) return a.row.owner.localeCompare(b.row.owner);
      return direction === 'asc' ? a.value - b.value : b.value - a.value;
    });

  const rankByValue = new Map<number, number>();
  filtered.forEach((item, index) => {
    if (!rankByValue.has(item.value)) {
      rankByValue.set(item.value, index + 1);
    }
  });

  return scored.map(item => ({
    owner: item.row.owner,
    value: item.value,
    rank: item.value === null ? null : rankByValue.get(item.value) ?? null,
  }));
}

function buildOwnerCareerProfile(
  owner: string,
  seasonSummaries: readonly SeasonSummaryRow[] = [],
  leagueGames: readonly H2HGame[] = [],
  opts: ModelOptions = EMPTY_MODEL_OPTIONS,
): TrophyOwnerCareerProfile {
  const careerBase = Array.isArray(opts.ownerCareers)
    ? opts.ownerCareers.find(row => row.owner === owner) || null
    : null;
  const seasonRows = seasonSummaries
    .filter(row => row.owner === owner)
    .sort(sortSeasonDesc);
  const ownerGames = leagueGames
    .filter(game => game.teamA === owner || game.teamB === owner)
    .sort(byGameDateAsc);
  const regularGames = ownerGames.filter(gameIsRegular);
  const playoffGames = ownerGames.filter(gameIsPlayoff);
  const saundersGames = ownerGames.filter(gameIsSaunders);

  const regularRecord = seasonRows.reduce((acc, row) => {
    acc.wins += +row.wins || 0;
    acc.losses += +row.losses || 0;
    acc.ties += +row.ties || 0;
    return acc;
  }, { wins: 0, losses: 0, ties: 0 });
  if (careerBase) {
    regularRecord.wins = careerBase.wins;
    regularRecord.losses = careerBase.losses;
    regularRecord.ties = careerBase.ties;
  }

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

  const pointsFor = careerBase?.points_for ?? seasonRows.reduce((sum, row) => sum + (Number.isFinite(+row.points_for) ? +row.points_for : 0), 0);
  const pointsAgainst = careerBase?.points_against ?? seasonRows.reduce((sum, row) => sum + (Number.isFinite(+row.points_against) ? +row.points_against : 0), 0);
  const diffTotal = pointsFor - pointsAgainst;
  const finishes = seasonRows.map(row => toNumber(row.finish)).filter(value => value !== null);
  const averageFinish = calcAvg(finishes);
  const finishStdDev = calcStdDev(finishes);
  const finishCount = finishes.length;
  const bestFinish = finishCount ? Math.min(...finishes) : null;
  const worstFinish = finishCount ? Math.max(...finishes) : null;

  const regularSeasonTitleYears = regularTitleYears(owner, seasonSummaries);
  const championYears = seasonRows.filter(row => row.champion).map(row => +row.season).sort((a, b) => a - b);
  const saundersYears = seasonRows.filter(row => row.saunders).map(row => +row.season).sort((a, b) => a - b);
  const byeYears = seasonRows.filter(row => row.bye).map(row => +row.season).sort((a, b) => a - b);
  const wildCardYears = seasonRows.filter(row => row.wild_card).map(row => +row.season).sort((a, b) => a - b);
  const saundersByeYears = seasonRows.filter(row => row.saunders_bye).map(row => +row.season).sort((a, b) => a - b);

  const weeklyAwards = opts.weeklyAwards
    || normalizeWeeklyAwards(computeWeeklyAwards(leagueGames, 150))
    || { top: [], low: [], high150: [] };
  const weeklyCrowns = careerBase?.weekly_crowns ?? (weeklyAwards.top.find(row => row.team === owner)?.count || 0);
  const lowScores = weeklyAwards.low.find(row => row.team === owner)?.count || 0;
  const highScores = weeklyAwards.high150.find(row => row.team === owner)?.count || 0;
  const sub70Games = regularGames.filter(game => {
    const s = sideForGame(game, owner);
    return s && +s.pf < 70;
  }).length;

  const aggregateBySeason = new Map((opts.seasonAggregates || [])
    .filter(row => row.team === owner)
    .map(row => [+row.season, row]));
  const seasonLuckRows: TrophySeasonLuckRow[] = seasonRows
    .map(row => {
      const games = regularGames.filter(game => +game.season === +row.season);
      const aggregate = aggregateBySeason.get(+row.season);
      const expectedWins = aggregate?.expWins ?? games.reduce((sum, game) => {
        const xw = expectedWinForGame(leagueGames, owner, game);
        return xw === null ? sum : sum + xw;
      }, 0);
      const luck = aggregate?.luck ?? games.reduce((sum, game) => {
        const xw = expectedWinForGame(leagueGames, owner, game);
        if (xw === null) return sum;
        const s = sideForGame(game, owner);
        if (!s) return sum;
        const actual = s.result === 'W' ? 1 : s.result === 'T' ? 0.5 : 0;
        return sum + (actual - xw);
      }, 0);
      return { season: +row.season, luck, games: games.length, expectedWins };
    })
    .filter(row => row.games > 0)
    .sort((a, b) => a.luck - b.luck || b.season - a.season);

  const luckySeason = seasonLuckRows.reduce<TrophySeasonLuckRow | null>((best, row) => (
    best === null
      || row.luck > best.luck
      || (row.luck === best.luck && row.season > best.season)
      ? row
      : best
  ), null);
  const unluckySeason = seasonLuckRows.length ? seasonLuckRows[0] : null;

  const singleGameRows = ownerGames
    .map((game): TrophyGameRow | null => {
      const s = sideForGame(game, owner);
      if (!s) return null;
      const xw = gameIsRegular(game) ? expectedWinForGame(leagueGames, owner, game) : null;
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
    .filter((row): row is TrophyGameRow => row !== null);

  const regularScoringRows = singleGameRows.filter(row => gameIsRegular(row.game) && row.game.season !== 2014);

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
      regularTitles: regularSeasonTitleYears.length,
      top2Seeds: byeYears.length,
      wildCards: wildCardYears.length,
      saundersTitles: saundersYears.length,
      saundersByes: saundersByeYears.length,
      weeklyCrowns,
      lowScores,
      highScores,
      sub70Games,
      bagels: seasonRows.reduce((sum, row) => sum + (toNumber(row.bagels_earned, 0) ?? 0), 0),
    },
    years: {
      champions: championYears,
      regularTitles: regularSeasonTitleYears,
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
    bestSeason: regularSeasonTitleYears[regularSeasonTitleYears.length - 1] || (championYears[championYears.length - 1] || null),
    bestPFSeason: seasonRows
      .filter(row => Number.isFinite(+row.points_for))
      .sort((a, b) => (+b.points_for) - (+a.points_for) || +b.season - +a.season)[0] || null,
    bestDiffSeason: seasonRows
      .filter(row => Number.isFinite(+row.points_for) && Number.isFinite(+row.points_against))
      .sort((a, b) => ((+b.points_for - +b.points_against) - (+a.points_for - +a.points_against)) || +b.season - +a.season)[0] || null,
    worstDiffSeason: seasonRows
      .filter(row => Number.isFinite(+row.points_for) && Number.isFinite(+row.points_against) && (+row.points_for - +row.points_against) < 0)
      .sort((a, b) => ((+a.points_for - +a.points_against) - (+b.points_for - +b.points_against)) || +b.season - +a.season)[0] || null,
    worstFinishSeason: seasonRows
      .filter(row => Number.isFinite(+row.finish))
      .sort((a, b) => (+b.finish) - (+a.finish) || +b.season - +a.season)[0] || null,
    mostUnluckySeason: unluckySeason ? seasonRows.find(row => +row.season === unluckySeason.season) || null : null,
    luckiestSeason: luckySeason ? seasonRows.find(row => +row.season === luckySeason.season) || null : null,
    bestGame: regularScoringRows
      .slice()
      .sort((a, b) => b.pf - a.pf || byMomentDateDesc(a, b))[0] || null,
    worstGame: singleGameRows
      .filter(row => isLowestScoreEligible(row.game, owner))
      .slice()
      .sort((a, b) => a.pf - b.pf || byMomentDateDesc(a, b))[0] || null,
    biggestWin: singleGameRows
      .filter(row => row.margin > 0)
      .sort((a, b) => b.margin - a.margin || byMomentDateDesc(a, b))[0] || null,
    biggestLoss: singleGameRows
      .filter(row => row.margin < 0)
      .sort((a, b) => a.margin - b.margin || byMomentDateDesc(a, b))[0] || null,
    bestPlayoffWin: playoffGames
      .map(game => {
        const s = sideForGame(game, owner);
        return s && s.result === 'W' ? { game, opponent: s.opp, margin: s.pf - s.pa, pf: s.pf, pa: s.pa } : null;
      })
      .filter((row): row is TrophyGameRow => row !== null)
      .sort((a, b) => b.margin - a.margin || byMomentDateDesc(a, b))[0] || null,
    worstPlayoffLoss: playoffGames
      .map(game => {
        const s = sideForGame(game, owner);
        return s && s.result === 'L' ? { game, opponent: s.opp, margin: s.pf - s.pa, pf: s.pf, pa: s.pa } : null;
      })
      .filter((row): row is TrophyGameRow => row !== null)
      .sort((a, b) => a.margin - b.margin || byMomentDateDesc(a, b))[0] || null,
    bestSaundersWin: saundersGames
      .map(game => {
        const s = sideForGame(game, owner);
        return s && s.result === 'W' ? { game, opponent: s.opp, margin: s.pf - s.pa, pf: s.pf, pa: s.pa } : null;
      })
      .filter((row): row is TrophyGameRow => row !== null)
      .sort((a, b) => b.margin - a.margin || byMomentDateDesc(a, b))[0] || null,
  };

  return profile;
}

function rankOwners(
  ownerProfiles: readonly TrophyOwnerCareerProfile[],
  accessor: (profile: TrophyOwnerCareerProfile) => number | null,
  { direction = 'desc' }: { direction?: 'asc' | 'desc' } = {},
): TrophyRankMetric {
  const rows = ownerProfiles.map(profile => ({
    owner: profile.owner,
    value: accessor(profile),
  }));
  const ranked = competitionRankRows(rows, row => row.value, { direction });
  const byOwner = new Map(ranked.map(row => [row.owner, row]));
  return { rows: ranked, byOwner };
}

function computeLeagueRanks(allOwnerProfiles: readonly TrophyOwnerCareerProfile[]): TrophyLeagueRanks {
  const profiles = allOwnerProfiles.slice();

  const metrics: Record<TrophyMetricKey, TrophyRankMetric> = {
    championships: rankOwners(profiles, profile => profile.counts.championships, { direction: 'desc' }),
    winPct: rankOwners(profiles, profile => profile.rates.regularWinPct, { direction: 'desc' }),
    avgFinish: rankOwners(profiles, profile => profile.rates.averageFinish, { direction: 'asc' }),
    regularTitles: rankOwners(profiles, profile => profile.counts.regularTitles, { direction: 'desc' }),
    top2Seeds: rankOwners(profiles, profile => profile.counts.top2Seeds, { direction: 'desc' }),
    playoffWins: rankOwners(profiles, profile => profile.totals.playoffs.wins, { direction: 'desc' }),
    weeklyCrowns: rankOwners(profiles, profile => profile.counts.weeklyCrowns, { direction: 'desc' }),
    sub70Games: rankOwners(profiles, profile => profile.counts.sub70Games, { direction: 'asc' }),
    saundersPain: rankOwners(profiles, profile => profile.counts.saundersTitles, { direction: 'asc' }),
    finishStdDev: rankOwners(profiles, profile => profile.rates.finishStdDev, { direction: 'asc' }),
    playoffWinPct: rankOwners(profiles, profile => profile.rates.playoffWinPct, { direction: 'desc' }),
  };

  const byOwner = new Map<string, TrophyOwnerRanks>();
  for (const profile of profiles) {
    const row: TrophyOwnerRanks = {
      owner: profile.owner,
      championships: metrics.championships.byOwner.get(profile.owner) || { rank: null, value: null },
      winPct: metrics.winPct.byOwner.get(profile.owner) || { rank: null, value: null },
      avgFinish: metrics.avgFinish.byOwner.get(profile.owner) || { rank: null, value: null },
      regularTitles: metrics.regularTitles.byOwner.get(profile.owner) || { rank: null, value: null },
      top2Seeds: metrics.top2Seeds.byOwner.get(profile.owner) || { rank: null, value: null },
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

function ownerRank(leagueRanks: TrophyLeagueRanks, owner: string, metric: TrophyMetricKey): TrophyRankValue {
  return leagueRanks.byOwner.get(owner)?.[metric] || { rank: null, value: null };
}

function computeOwnerIdentity(ownerProfile: TrophyOwnerCareerProfile, leagueRanks: TrophyLeagueRanks): TrophyIdentity {
  const ranks = leagueRanks.byOwner.get(ownerProfile.owner);
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
  const winPctRank = ranks?.winPct.rank ?? null;
  const champRank = ranks?.championships.rank ?? null;
  const regularTitleRank = ranks?.regularTitles.rank ?? null;
  const playoffWinRank = ranks?.playoffWins.rank ?? null;
  const weeklyCrownsRank = ranks?.weeklyCrowns.rank ?? null;
  const avgFinishRank = ranks?.avgFinish.rank ?? null;
  const sub70Rank = ranks?.sub70Games.rank ?? null;
  const saundersRank = ranks?.saundersPain.rank ?? null;
  const finishRank = ranks?.finishStdDev.rank ?? null;
  const dominanceSignal = [
    champRank,
    regularTitleRank,
    playoffWinRank,
    weeklyCrownsRank,
    avgFinishRank,
    sub70Rank,
  ].some(rank => rank !== null && rank <= 3);
  const identityLabel = (() => {
    if (champCount >= 2 || (champCount >= 1 && dominanceSignal)) return 'Dynasty Threat';
    if (regularTitleCount >= 2 && champCount === 0) return 'Regular Season Merchant';
    if ((saundersPain > 0 && saundersRank !== null && saundersRank <= 2) || profile.seasonLuckRows.some(row => row.luck < 0 && row.games >= 3)) return 'Snakebitten';
    if (finishStdDev > 4.5 || (finishRank !== null && finishRank <= 2)) return 'Boom/Bust';
    if ((playoffWinPct !== null && playoffWinPct > 0 && playoffWinRank !== null && playoffWinRank <= 3) || playoffWins >= 4) return 'Playoff Riser';
    if (champCount === 0 && regularTitleCount === 0 && playoffWins === 0) return 'Rebuild Resume';
    if (saundersPain === 0 && playoffWins > 0) return 'Saunders Survivor';
    if (weeklyCrowns > top2Seeds && winPct !== null && winPct >= 0.5) return 'Chaos Team';
    return 'Contender Profile';
  })();

  const summaryParts: string[] = [];
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

function buildHeroView(ownerProfile: TrophyOwnerCareerProfile, identity: TrophyIdentity, leagueRanks: TrophyLeagueRanks): TrophyHero {
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
      championshipRank !== null ? `Darlings #${championshipRank}` : null,
      regularTitleRank !== null ? `Regular titles #${regularTitleRank}` : null,
      weeklyRank !== null ? `Weekly crowns #${weeklyRank}` : null,
    ].filter((value): value is string => value !== null).join(' | '),
  };
}

function computeHardwareShelf(ownerProfile: TrophyOwnerCareerProfile, leagueRanks: TrophyLeagueRanks): TrophyHardwareItem[] {
  const rankMap = leagueRanks.byOwner.get(ownerProfile.owner);
  const items = [
    {
      label: 'Darlings',
      count: ownerProfile.counts.championships,
      years: ownerProfile.years.champions,
      rank: rankMap?.championships.rank ?? null,
      context: ownerProfile.counts.championships > 0 ? 'League title hardware' : 'Still chasing the first one',
      tone: 'gold',
      icon: 'trophy',
    },
    {
      label: 'Regular-season titles',
      count: ownerProfile.counts.regularTitles,
      years: ownerProfile.years.regularTitles,
      rank: rankMap?.regularTitles.rank ?? null,
      context: ownerProfile.counts.regularTitles > 0 ? 'Regular-season hardware' : 'Still chasing a regular-season crown',
      tone: 'gold',
      icon: 'medal',
    },
    {
      label: 'Byes',
      count: ownerProfile.counts.top2Seeds,
      years: ownerProfile.years.top2Seeds,
      rank: null,
      context: ownerProfile.counts.top2Seeds > 0 ? 'Playoff positioning' : 'No top-two seed yet',
      tone: 'neutral',
      icon: 'beachChair',
    },
    {
      label: 'Wild cards',
      count: ownerProfile.counts.wildCards,
      years: ownerProfile.years.wildCards,
      rank: null,
      context: ownerProfile.counts.wildCards > 0 ? 'Back-door playoff appearances' : 'No wild-card path yet',
      tone: 'neutral',
      icon: 'joker',
    },
    {
      label: 'Playoff wins',
      count: ownerProfile.totals.playoffs.wins,
      years: [],
      rank: rankMap?.playoffWins.rank ?? null,
      context: ownerProfile.totals.playoffs.wins > 0 ? 'Postseason wins' : 'Still waiting on a postseason win',
      tone: 'neutral',
      icon: null,
    },
    {
      label: 'Saunders titles',
      count: ownerProfile.counts.saundersTitles,
      years: ownerProfile.years.saundersTitles,
      rank: rankMap?.saundersPain.rank ?? null,
      context: ownerProfile.counts.saundersTitles > 0 ? 'Saunders hardware' : 'Clean Saunders sheet',
      tone: 'scar',
      icon: 'turd',
    },
    {
      label: 'Saunders byes',
      count: ownerProfile.counts.saundersByes,
      years: ownerProfile.years.saundersByes,
      rank: null,
      context: ownerProfile.counts.saundersByes > 0 ? 'Avoided the basement' : 'Clean Saunders sheet',
      tone: 'scar',
      icon: 'warning',
    },
    {
      label: 'Bagels',
      count: ownerProfile.counts.bagels,
      years: [],
      rank: null,
      context: ownerProfile.counts.bagels > 0 ? 'League-wide bagels earned' : 'No bagels on the ledger yet',
      tone: 'scar',
      icon: 'bagel',
    },
  ];

  return items.map(item => ({
    ...item,
    state: item.count > 0 ? 'earned' : 'empty',
  }));
}

function tierForSeason(row: SeasonSummaryRow): { tier: string; label: string } {
  if (row.champion) return { tier: 'champion', label: 'Champion' };
  if (row.saunders) return { tier: 'saunders', label: 'Saunders' };
  if (row.bye || (+row.finish <= 2)) return { tier: 'contender', label: 'Contender' };
  if (Number.isFinite(+row.finish) && +row.finish <= 4) return { tier: 'upper', label: 'Upper tier' };
  if (Number.isFinite(+row.finish) && +row.finish >= 8) return { tier: 'pain', label: 'Pain' };
  return { tier: 'mid', label: 'Mid-table' };
}

function computeCareerShape(owner: string, seasonRows: readonly SeasonSummaryRow[] = []): TrophyViewModel['careerShape'] {
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

function signatureSeasonReason(row: SeasonSummaryRow, profile: TrophyOwnerCareerProfile): string[] {
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

function computeSignatureSeasons(ownerProfile: TrophyOwnerCareerProfile): TrophySignatureSeason[] {
  const rows = ownerProfile.seasonRows.slice();
  const candidates: SignatureSeasonCandidate[] = [];
  const addCandidate = (season: unknown, badge: string, reason: string, priority: number): void => {
    const key = toNumber(season);
    if (key === null) return;
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
      const row = rows.find(candidate => candidate.season === item.season) || null;
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

function achievementAndScarItems(ownerProfile: TrophyOwnerCareerProfile): TrophyAchievementAndScarLists {
  const bestScore = ownerProfile.bestGame;
  const worstScore = ownerProfile.worstGame;
  const biggestWin = ownerProfile.biggestWin;
  const biggestLoss = ownerProfile.biggestLoss;
  const bestDiffSeason = ownerProfile.bestDiffSeason;
  const mostUnluckySeason = ownerProfile.mostUnluckySeason;
  const luckiestSeason = ownerProfile.luckiestSeason;
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
    ? ownerProfile.seasonLuckRows.find(row => row.season === mostUnluckySeason.season) || null
    : null;
  const unluckyExpectedRecord = unluckyLuckRow
    ? `${fmtDecimal(unluckyLuckRow.expectedWins, 1)}-${fmtDecimal(Math.max(0, unluckyLuckRow.games - unluckyLuckRow.expectedWins), 1)}`
    : null;
  const unluckyLuckValue = unluckyLuckRow?.luck ?? null;
  const unluckySeasonDetail = mostUnluckySeason
    ? `Record ${mostUnluckySeason.wins}-${mostUnluckySeason.losses}-${mostUnluckySeason.ties || 0} • Expected ${unluckyExpectedRecord || '—'} • Luck ${fmtSigned(unluckyLuckValue, 2)}`
    : null;

  const seasonKey = (row: SeasonSummaryRow): string => `season:${row.season}`;
  const gameKey = (row: TrophyGameRow): string => `game:${stableGameKey(row.game)}`;
  const seenSources = new Set<string>();
  const selectCandidates = (candidates: Array<TrophyListCandidate | null>): TrophyListItem[] => {
    const selected: TrophyListItem[] = [];
    const rankedCandidates = candidates
      .map((candidate, index) => candidate ? { candidate, index } : null)
      .filter((entry): entry is { candidate: TrophyListCandidate; index: number } => entry !== null)
      .sort((a, b) => a.candidate.priority - b.candidate.priority || a.index - b.index);
    for (const { candidate } of rankedCandidates) {
      if (seenSources.has(candidate.sourceKey)) continue;
      seenSources.add(candidate.sourceKey);
      selected.push(candidate.item);
      if (selected.length === 5) break;
    }
    return selected;
  };
  const item = (key: string, sourceKey: string, label: string, value: string, detail: string): TrophyListItem => ({ key, sourceKey, label, value, detail });
  const titleSeason = ownerProfile.seasonRows.find(row => row.champion)
    || ownerProfile.seasonRows.find(row => ownerProfile.years.regularTitles.includes(+row.season))
    || null;
  const saundersSeason = ownerProfile.seasonRows.find(row => row.saunders || row.saunders_bye) || null;

  const achievements = selectCandidates([
    bestSeason ? {
      priority: 0,
      sourceKey: seasonKey(bestSeason),
      item: item(`highlight:best-season:${bestSeason.season}`, seasonKey(bestSeason), 'Best regular season', `${bestSeason.season}`, bestSeasonDetail),
    } : null,
    bestScore ? {
      priority: 1,
      sourceKey: gameKey(bestScore),
      item: item(`highlight:highest-week:${gameKey(bestScore)}`, gameKey(bestScore), 'Highest weekly score', `${fmtDecimal(bestScore.pf, 1)}`, `${bestScore.game.date} vs ${bestScore.opponent}`),
    } : null,
    biggestWin ? {
      priority: 2,
      sourceKey: gameKey(biggestWin),
      item: item(`highlight:best-margin:${gameKey(biggestWin)}`, gameKey(biggestWin), 'Best win margin', fmtSigned(biggestWin.margin, 1), `${biggestWin.game.date} vs ${biggestWin.opponent}`),
    } : null,
    bestDiffSeason ? {
      priority: 3,
      sourceKey: seasonKey(bestDiffSeason),
      item: item(`highlight:best-diff:${bestDiffSeason.season}`, seasonKey(bestDiffSeason), 'Best point differential season', `${bestDiffSeason.season}`, `Diff ${fmtSigned(+bestDiffSeason.points_for - +bestDiffSeason.points_against, 1)} • PF ${fmtDecimal(bestDiffSeason.points_for, 1)} • PA ${fmtDecimal(bestDiffSeason.points_against, 1)}`),
    } : null,
    luckiestSeason ? {
      priority: 4,
      sourceKey: seasonKey(luckiestSeason),
      item: item(`highlight:luckiest-season:${luckiestSeason.season}`, seasonKey(luckiestSeason), 'Luckiest season', `${luckiestSeason.season}`, `Record ${luckiestSeason.wins}-${luckiestSeason.losses}-${luckiestSeason.ties || 0} • Luck ${fmtSigned(ownerProfile.seasonLuckRows.find(row => row.season === +luckiestSeason.season)?.luck, 2)}`),
    } : null,
    titleSeason ? {
      priority: 5,
      sourceKey: seasonKey(titleSeason),
      item: item(`highlight:title-season:${titleSeason.season}`, seasonKey(titleSeason), titleSeason.champion ? 'Championship season' : 'Regular-season title', `${titleSeason.season}`, `${titleSeason.champion ? 'Champion' : 'Regular-season title'} • Finish ${Number.isFinite(+titleSeason.finish) ? titleSeason.finish : '—'}`),
    } : null,
  ]);

  const scars = selectCandidates([
    mostUnluckySeason ? {
      priority: 0,
      sourceKey: seasonKey(mostUnluckySeason),
      item: item(`low:unlucky-season:${mostUnluckySeason.season}`, seasonKey(mostUnluckySeason), 'Most unlucky season', `${mostUnluckySeason.season}`, unluckySeasonDetail || 'Luck —'),
    } : null,
    worstScore ? {
      priority: 1,
      sourceKey: gameKey(worstScore),
      item: item(`low:worst-week:${gameKey(worstScore)}`, gameKey(worstScore), 'Worst weekly score', `${fmtDecimal(worstScore.pf, 1)}`, `${worstScore.game.date} vs ${worstScore.opponent}`),
    } : null,
    biggestLoss ? {
      priority: 2,
      sourceKey: gameKey(biggestLoss),
      item: item(`low:biggest-loss:${gameKey(biggestLoss)}`, gameKey(biggestLoss), 'Biggest loss', fmtSigned(biggestLoss.margin, 1), `${biggestLoss.game.date} vs ${biggestLoss.opponent}`),
    } : null,
    ownerProfile.worstFinishSeason ? {
      priority: 3,
      sourceKey: seasonKey(ownerProfile.worstFinishSeason),
      item: item(`low:worst-finish:${ownerProfile.worstFinishSeason.season}`, seasonKey(ownerProfile.worstFinishSeason), 'Worst finish', `${ownerProfile.worstFinishSeason.season}`, `Finished ${ordinalText(ownerProfile.worstFinishSeason.finish)} • Record ${ownerProfile.worstFinishSeason.wins}-${ownerProfile.worstFinishSeason.losses}-${ownerProfile.worstFinishSeason.ties || 0}`),
    } : null,
    ownerProfile.worstDiffSeason ? {
      priority: 4,
      sourceKey: seasonKey(ownerProfile.worstDiffSeason),
      item: item(`low:negative-diff:${ownerProfile.worstDiffSeason.season}`, seasonKey(ownerProfile.worstDiffSeason), 'Negative-differential season', `${ownerProfile.worstDiffSeason.season}`, `Diff ${fmtSigned(+ownerProfile.worstDiffSeason.points_for - +ownerProfile.worstDiffSeason.points_against, 1)} • PF ${fmtDecimal(ownerProfile.worstDiffSeason.points_for, 1)} • PA ${fmtDecimal(ownerProfile.worstDiffSeason.points_against, 1)}`),
    } : null,
    saundersSeason ? {
      priority: 5,
      sourceKey: seasonKey(saundersSeason),
      item: item(`low:saunders-season:${saundersSeason.season}`, seasonKey(saundersSeason), saundersSeason.saunders ? 'Saunders title' : 'Saunders bye', `${saundersSeason.season}`, saundersSeason.saunders ? 'Saunders title receipt' : 'Saunders bye receipt'),
    } : null,
  ]);

  return {
    achievements,
    scars,
    bestAchievement: achievements[0] || null,
    worstScar: scars[0] || null,
  };
}

function computeOwnerMoments(owner: string, leagueGames: readonly H2HGame[] = []): TrophyOwnerMoment[] {
  const ownerGames = leagueGames
    .filter(game => game.teamA === owner || game.teamB === owner)
    .map((game): TrophyGameRow | null => {
      const s = sideForGame(game, owner);
      if (!s) return null;
      const xw = gameIsRegular(game) ? expectedWinForGame(leagueGames, owner, game) : null;
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
    .filter((row): row is TrophyGameRow => row !== null)
    .sort(byMomentDateAsc);

  const regularGames = ownerGames.filter(row => gameIsRegular(row.game));
  const highestScore = regularGames
    .filter(row => row.game.season !== 2014)
    .slice()
    .sort((a, b) => b.pf - a.pf || byMomentDateDesc(a, b))[0] || null;
  const lowestScore = ownerGames
    .filter(row => isLowestScoreEligible(row.game, owner))
    .slice()
    .sort((a, b) => a.pf - b.pf || byMomentDateDesc(a, b))[0] || null;
  const biggestWin = ownerGames.filter(row => row.margin > 0).slice().sort((a, b) => b.margin - a.margin || byMomentDateDesc(a, b))[0] || null;
  const biggestLoss = ownerGames.filter(row => row.margin < 0).slice().sort((a, b) => a.margin - b.margin || byMomentDateDesc(a, b))[0] || null;

  const momentOptions: Array<OwnerMomentCandidate | null> = [
    highestScore ? {
      label: 'Highest score',
      value: fmtDecimal(highestScore.pf, 1),
      item: highestScore,
    } : null,
    lowestScore ? {
      label: 'Lowest score',
      value: fmtDecimal(lowestScore.pf, 1),
      item: lowestScore,
    } : null,
    biggestWin ? {
      label: 'Biggest win',
      value: fmtSigned(biggestWin.margin, 1),
      item: biggestWin,
    } : null,
    biggestLoss ? {
      label: 'Biggest loss',
      value: fmtSigned(biggestLoss.margin, 1),
      item: biggestLoss,
    } : null,
  ];
  const moments = momentOptions.filter((item): item is OwnerMomentCandidate => item !== null);

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

function seasonGameLog(owner: string, games: readonly H2HGame[], season: number): TrophySeasonGameLog[] {
  return games
    .filter(game => game.season === season)
    .map((game): TrophySeasonGameLog | null => {
      const side = sideForGame(game, owner);
      if (!side) return null;
      return {
        date: game.date,
        week: Number.isFinite(game.week) ? String(game.week) : '—',
        opponent: side.opp,
        scoreline: `${fmtDecimal(side.pf, 1)} - ${fmtDecimal(side.pa, 1)}`,
        result: side.result,
        type: game.type,
        round: game.round || '—',
      };
    })
    .filter((game): game is TrophySeasonGameLog => game !== null)
    .sort((a, b) => {
      const week = (value: string) => Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER;
      return a.date.localeCompare(b.date) || week(a.week) - week(b.week) || a.opponent.localeCompare(b.opponent);
    });
}

function computeSeasonLedger(owner: string, seasonRows: readonly SeasonSummaryRow[] = [], ownerGames: readonly H2HGame[] = []): TrophySeasonLedgerRow[] {
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
        games: seasonGameLog(owner, ownerGames, +row.season),
      };
    });
}

function buildTrophyCaseViewModel(owner: string, input: TrophyModelOptions = {}): TrophyViewModel {
  const opts = normalizeModelOptions(input);
  const seasonSummaries = opts.seasonSummaries;
  const leagueGames = opts.leagueGames;
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
  const seasonLedger = computeSeasonLedger(ownerProfile.owner, ownerProfile.seasonRows, ownerProfile.ownerGames);

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
  hardwareArt,
  buildTrophyCaseViewModel,
};
