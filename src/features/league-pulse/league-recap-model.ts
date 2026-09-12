import { buildUrlFromState } from '../../../js/state-helpers.js';
import type { CurrentSeasonGame, H2HGame, SeasonSummaryRow } from '../../data/generated/asset-types';
import { resolveSeasonRecap, seasonSummaryRows } from '../../data/season-recap';
import type {
  LeagueEdition,
  LeagueNewspaperModel,
  PulseModelData,
  PulseSuperlative,
  PulseYearInReview,
  WeeklyRecapFacts,
} from './league-pulse-types';

type Game = H2HGame | CurrentSeasonGame;
type WeeklyIntegrityIssue = Exclude<LeagueEdition['issue'], null>['code'];

function score(value: number): string {
  return Number(value).toFixed(2).replace(/\.00$/, '');
}

function hasFiniteScore(value: unknown): boolean {
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function pair(game: Game): string {
  return [game.teamA, game.teamB].sort((a, b) => a.localeCompare(b)).join('|');
}

function pathUrl(pathname: string, options: Record<string, unknown>): string {
  return buildUrlFromState({ pathname, ...options });
}

function historyUniverse(data: PulseModelData) {
  return {
    seasons: [...new Set(data.leagueGames.map(game => Number(game.season)))],
    weeks: [...new Set(data.leagueGames.map(game => Number(game.week)))],
    opponents: [...new Set(data.leagueGames.flatMap(game => [game.teamA, game.teamB]))],
    types: [...new Set(data.leagueGames.map(game => game.type))],
    rounds: [...new Set(data.leagueGames.map(game => String(game.round || '')).filter(Boolean))],
  };
}

function historyHref(
  data: PulseModelData,
  pathname: string,
  options: Record<string, unknown>,
): string {
  return pathUrl(pathname, {
    tab: 'history',
    allTeams: '__ALL__',
    selectedTeam: '__ALL__',
    universe: historyUniverse(data),
    selectedSeasons: new Set(),
    selectedWeeks: new Set(),
    selectedOpponents: new Set(),
    selectedTypes: new Set(),
    selectedRounds: new Set(),
    ...options,
  });
}

function longestWinStreak(games: H2HGame[]) {
  const owners = [...new Set(games.flatMap(game => [game.teamA, game.teamB]))];
  return owners.map(owner => {
    let current = 0;
    let best = 0;
    let ended = '';
    games.slice().sort((a, b) => Number(a.week) - Number(b.week) || String(a.date).localeCompare(String(b.date))).forEach(game => {
      if (game.teamA !== owner && game.teamB !== owner) return;
      const won = game.teamA === owner ? game.scoreA > game.scoreB : game.scoreB > game.scoreA;
      current = won ? current + 1 : 0;
      if (current >= best) {
        best = current;
        ended = game.date;
      }
    });
    return { owner, best, ended };
  }).sort((a, b) => b.best - a.best || String(b.ended).localeCompare(String(a.ended)) || a.owner.localeCompare(b.owner))[0] || null;
}

export function buildSeasonYearInReview(
  data: PulseModelData,
  season: number,
  pathname: string,
): PulseYearInReview | null {
  const recap = resolveSeasonRecap({
    season,
    seasonSummaries: data.seasonSummaries,
    leagueGames: data.leagueGames,
  });
  if (!recap?.complete || !recap.champion || !recap.saunders || !recap.finalStandings.length) return null;
  const rows = seasonSummaryRows(data.seasonSummaries, season);
  const games = data.leagueGames.filter(game => Number(game.season) === season);
  if (!rows.length || !games.length || games.some(game => !Number.isFinite(game.scoreA) || !Number.isFinite(game.scoreB))) return null;
  const sides = games.flatMap(game => [
    { owner: game.teamA, opponent: game.teamB, score: game.scoreA },
    { owner: game.teamB, opponent: game.teamA, score: game.scoreB },
  ]);
  const points = rows.slice().sort((a, b) => b.points_for - a.points_for || a.owner.localeCompare(b.owner))[0];
  const bestRecord = rows.slice().sort((a, b) => (
    (b.wins + 0.5 * b.ties) / Math.max(1, b.wins + b.losses + b.ties)
    - (a.wins + 0.5 * a.ties) / Math.max(1, a.wins + a.losses + a.ties)
    || b.points_for - a.points_for
    || a.owner.localeCompare(b.owner)
  ))[0];
  const high = sides.slice().sort((a, b) => b.score - a.score || a.owner.localeCompare(b.owner))[0];
  const close = games.slice().sort((a, b) => (
    Math.abs(a.scoreA - a.scoreB) - Math.abs(b.scoreA - b.scoreB)
    || pair(a).localeCompare(pair(b))
    || String(a.date).localeCompare(String(b.date))
  ))[0];
  const streak = longestWinStreak(games);
  const seasonHref = historyHref(data, pathname, { selectedSeasons: new Set([season]) });
  const superlatives: PulseSuperlative[] = [];
  if (points) superlatives.push({ label: 'Points leader', value: points.owner, detail: `${score(points.points_for)} points`, href: seasonHref });
  if (bestRecord) superlatives.push({ label: 'Best regular-season record', value: bestRecord.owner, detail: `${bestRecord.wins}-${bestRecord.losses}${bestRecord.ties ? `-${bestRecord.ties}` : ''}`, href: seasonHref });
  if (high) superlatives.push({ label: 'Highest weekly score', value: high.owner, detail: `${score(high.score)} vs ${high.opponent}`, href: seasonHref });
  if (close) superlatives.push({ label: 'Closest game', value: `${close.teamA} vs ${close.teamB}`, detail: `${score(close.scoreA)}–${score(close.scoreB)}`, href: seasonHref });
  if (streak?.best) superlatives.push({ label: 'Longest win streak', value: streak.owner, detail: `${streak.best} games`, href: seasonHref });
  return {
    season,
    champion: recap.champion,
    runnerUp: recap.runnerUp,
    saunders: recap.saunders,
    championshipResult: recap.championshipResult,
    finalStandings: recap.finalStandings,
    superlatives,
  };
}

function expectedOwners(data: PulseModelData, season: number): string[] {
  if (data.currentSeason && Number(data.currentSeason.season) === season) {
    return data.currentSeason.teams.map(team => team.owner).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }
  return [...new Set(data.seasonSummaries
    .filter(row => Number(row.season) === season)
    .map(row => row.owner)
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function sourceGames(data: PulseModelData, season: number): Game[] {
  if (data.currentSeason && Number(data.currentSeason.season) === season) return data.currentSeason.games;
  return data.leagueGames.filter(game => Number(game.season) === season);
}

function weeklyIntegrityIssue(
  owners: string[],
  games: Game[],
  expectedGames: number,
): WeeklyIntegrityIssue | null {
  const counts = new Map<string, number>();
  games.forEach(game => {
    counts.set(game.teamA, (counts.get(game.teamA) || 0) + 1);
    counts.set(game.teamB, (counts.get(game.teamB) || 0) + 1);
  });
  return !owners.length ? 'MISSING_EXPECTED_OWNERS'
    : games.length !== expectedGames ? 'MISSING_GAMES'
      : new Set(games.map(pair)).size !== games.length ? 'DUPLICATE_PAIR'
        : owners.some(owner => (counts.get(owner) || 0) > 1) ? 'DUPLICATE_OWNER'
          : [...counts.keys()].some(owner => !owners.includes(owner)) ? 'UNKNOWN_OWNER'
            : owners.some(owner => counts.get(owner) !== 1) ? 'MISSING_GAMES'
              : games.some(game => !hasFiniteScore(game.scoreA) || !hasFiniteScore(game.scoreB)) ? 'INVALID_SCORE'
                : null;
}

function standingLeader(games: Game[], week: number): PulseSuperlative {
  const records = new Map<string, { wins: number; losses: number; ties: number; points: number }>();
  games.filter(game => Number(game.week) <= week && game.type === 'Regular').forEach(game => {
    const a = records.get(game.teamA) || { wins: 0, losses: 0, ties: 0, points: 0 };
    const b = records.get(game.teamB) || { wins: 0, losses: 0, ties: 0, points: 0 };
    a.points += Number(game.scoreA);
    b.points += Number(game.scoreB);
    if (game.scoreA > game.scoreB) {
      a.wins += 1;
      b.losses += 1;
    } else if (game.scoreB > game.scoreA) {
      b.wins += 1;
      a.losses += 1;
    } else {
      a.ties += 1;
      b.ties += 1;
    }
    records.set(game.teamA, a);
    records.set(game.teamB, b);
  });
  const [owner, row] = [...records].sort(([ownerA, a], [ownerB, b]) => (
    (b.wins + 0.5 * b.ties) / Math.max(1, b.wins + b.losses + b.ties)
    - (a.wins + 0.5 * a.ties) / Math.max(1, a.wins + a.losses + a.ties)
    || b.points - a.points
    || ownerA.localeCompare(ownerB)
  ))[0];
  return {
    label: 'Standings leader',
    value: owner,
    detail: `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`,
  };
}

function weeklyFacts(allGames: Game[], games: Game[], week: number): WeeklyRecapFacts {
  const sides = games.flatMap(game => [
    { owner: game.teamA, opponent: game.teamB, value: Number(game.scoreA) },
    { owner: game.teamB, opponent: game.teamA, value: Number(game.scoreB) },
  ]);
  const highValue = Math.max(...sides.map(row => row.value));
  const tied = sides.filter(row => row.value === highValue).map(row => row.owner).sort((a, b) => a.localeCompare(b));
  const tiedNames = tied.join(', ');
  const closest = games.slice().sort((a, b) => (
    Math.abs(Number(a.scoreA) - Number(a.scoreB)) - Math.abs(Number(b.scoreA) - Number(b.scoreB))
    || pair(a).localeCompare(pair(b))
  ))[0];
  const largest = games.slice().sort((a, b) => (
    Math.abs(Number(b.scoreA) - Number(b.scoreB)) - Math.abs(Number(a.scoreA) - Number(a.scoreB))
    || pair(a).localeCompare(pair(b))
  ))[0];
  const winner = Number(largest.scoreA) === Number(largest.scoreB)
    ? 'Tie'
    : Number(largest.scoreA) > Number(largest.scoreB) ? largest.teamA : largest.teamB;
  return {
    highScore: {
      label: 'Highest score',
      value: tiedNames.length <= 48 ? tiedNames : `${tied.length} owners tied`,
      detail: score(highValue),
    },
    closestGame: {
      label: 'Closest matchup',
      value: `${closest.teamA}–${closest.teamB}`,
      detail: `${score(Math.abs(Number(closest.scoreA) - Number(closest.scoreB)))}-point margin`,
    },
    largestMargin: {
      label: 'Largest margin',
      value: winner,
      detail: `${score(Math.abs(Number(largest.scoreA) - Number(largest.scoreB)))} points`,
    },
    standingsLeader: standingLeader(allGames, week),
  };
}

function weeklySourceHref(data: PulseModelData, pathname: string, season: number, week: number): string {
  if (data.currentSeason && Number(data.currentSeason.season) === season) {
    return pathUrl(pathname, { tab: 'current', selectedCurrentSeason: season, selectedCurrentWeek: week });
  }
  return historyHref(data, pathname, {
    selectedSeasons: new Set([season]),
    selectedWeeks: new Set([week]),
    selectedTypes: new Set(['Regular']),
    selectedFocus: 'games',
  });
}

function weeklyEdition(data: PulseModelData, pathname: string, season: number, week: number): LeagueEdition<WeeklyRecapFacts> {
  const owners = expectedOwners(data, season);
  const allGames = sourceGames(data, season).filter(game => game.type === 'Regular');
  const games = allGames.filter(game => Number(game.week) === week);
  const expectedGames = Math.floor(owners.length / 2);
  const href = weeklySourceHref(data, pathname, season, week);
  const base = {
    id: `weekly:${season}:${week}`,
    kind: 'weekly' as const,
    season,
    week,
    sourceHref: href,
    sourceLabel: `${season} Week ${week} source`,
    dataVersion: data.dataVersion,
  };
  const current = data.currentSeason && Number(data.currentSeason.season) === season;
  if (current && games.some(game => !('status' in game) || game.status !== 'final' || !hasFiniteScore(game.scoreA) || !hasFiniteScore(game.scoreB))) {
    return { ...base, state: 'pending', headline: `${season} Week ${week} is still in progress`, statusLabel: 'Pending', facts: null, highlights: [], issue: { code: 'LIVE_GAMES', recordedGames: games.length, expectedGames } };
  }
  const issue = weeklyIntegrityIssue(owners, games, expectedGames);
  if (issue) {
    return { ...base, state: 'partial', headline: `Partial archive — ${games.length} of ${expectedGames} games recorded`, statusLabel: 'Partial archive', facts: null, highlights: [], issue: { code: issue, recordedGames: games.length, expectedGames } };
  }
  for (let standingsWeek = 1; standingsWeek < week; standingsWeek += 1) {
    const prefixGames = allGames.filter(game => Number(game.week) === standingsWeek);
    const nonFinalCurrentGame = current && prefixGames.some(game => (
      !('status' in game)
      || game.status !== 'final'
      || !hasFiniteScore(game.scoreA)
      || !hasFiniteScore(game.scoreB)
    ));
    if (nonFinalCurrentGame || weeklyIntegrityIssue(owners, prefixGames, expectedGames)) {
      return {
        ...base,
        state: 'partial',
        headline: `Partial archive — standings history is incomplete at Week ${standingsWeek}`,
        statusLabel: 'Partial archive',
        facts: null,
        highlights: [],
        issue: {
          code: 'INCOMPLETE_STANDINGS_PREFIX',
          recordedGames: prefixGames.length,
          expectedGames,
          standingsWeek,
        },
      };
    }
  }
  const facts = weeklyFacts(allGames, games, week);
  return {
    ...base,
    state: 'complete',
    headline: `${facts.highScore.value} led ${season} Week ${week} with ${facts.highScore.detail}`,
    statusLabel: 'Final',
    facts,
    highlights: Object.values(facts),
    issue: null,
  };
}

function seasonEdition(data: PulseModelData, pathname: string, season: number): LeagueEdition<PulseYearInReview> {
  const review = buildSeasonYearInReview(data, season, pathname);
  const sourceHref = historyHref(data, pathname, { selectedSeasons: new Set([season]) });
  const base = {
    id: `season:${season}`,
    kind: 'season' as const,
    season,
    week: null,
    sourceHref,
    sourceLabel: `${season} season history`,
    dataVersion: data.dataVersion,
  };
  if (!review) {
    return { ...base, state: 'pending', headline: `${season} season recap pending`, statusLabel: 'Pending', facts: null, highlights: [], issue: { code: 'HONORS_PENDING' } };
  }
  const highlights: PulseSuperlative[] = [
    { label: 'Champion', value: review.champion, detail: review.championshipResult || 'League champion' },
    { label: 'Runner-up', value: review.runnerUp || '—', detail: review.championshipResult || 'Finalist' },
    { label: 'Saunders winner', value: review.saunders, detail: 'Saunders Bowl' },
    ...review.superlatives.slice(0, 1),
  ];
  return { ...base, state: 'complete', headline: `${review.champion} wins the ${season} Darling`, statusLabel: 'Final', facts: review, highlights, issue: null };
}

export function buildLeagueNewspaper(data: PulseModelData, pathname: string): LeagueNewspaperModel {
  const seasons = [...new Set([
    ...data.seasonSummaries.map(row => Number(row.season)),
    ...data.leagueGames.map(game => Number(game.season)),
    ...(data.currentSeason ? [Number(data.currentSeason.season)] : []),
  ].filter(Number.isFinite))].sort((a, b) => b - a);
  const weekly = seasons.flatMap(season => {
    const weeks = [...new Set(sourceGames(data, season)
      .filter(game => game.type === 'Regular')
      .map(game => Number(game.week))
      .filter(Number.isFinite))]
      .sort((a, b) => b - a);
    return weeks.map(week => weeklyEdition(data, pathname, season, week));
  });
  const yearly = seasons
    .filter(season => data.seasonSummaries.some((row: SeasonSummaryRow) => Number(row.season) === season))
    .map(season => seasonEdition(data, pathname, season));
  const currentSeason = data.currentSeason ? Number(data.currentSeason.season) : null;
  const defaultEdition = weekly.find(edition => edition.season === currentSeason && edition.state === 'complete')
    || weekly.find(edition => edition.season === currentSeason && edition.state === 'pending')
    || yearly.find(edition => edition.state === 'complete')
    || weekly.find(edition => edition.state === 'complete' || edition.state === 'partial')
    || yearly[0]
    || null;
  return {
    editions: [...weekly, ...yearly],
    defaultEditionId: defaultEdition?.id || null,
  };
}
