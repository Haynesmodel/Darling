import { buildCurseTrackerModel } from '../../../js/curse-tracker.js';
import { buildCurrentSeasonStandings, isCompletedGame } from '../../../js/current-season-data.js';
import { buildLiveMovement, buildProjectedStandings, resolveCurrentSeasonRules } from '../../../js/current-season-command-data.js';
import { buildUrlFromState } from '../../../js/state-helpers.js';
import type { CurrentSeasonData, CurrentSeasonGame, H2HGame, RivalryDefinition, SeasonSummaryRow } from '../../data/generated/asset-types';
import type {
  LeaguePulseViewModel,
  PulseCurseModel,
  PulseFeaturedMatchup,
  PulseHeroModel,
  PulseLink,
  PulseMatchupModel,
  PulseModelData,
  PulsePhase,
  PulseRecordModel,
  PulseSeasonState,
  PulseStandingsSection,
  PulseSuperlative,
  PulseYearInReview,
} from './league-pulse-types';

type Game = H2HGame | CurrentSeasonGame;

const statusOrder = { live: 0, scheduled: 1, final: 2 } as const;
const typeOrder: Record<string, number> = { Championship: 0, Playoff: 1, Saunders: 2, Regular: 3 };

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function gameStatus(game: Game): 'scheduled' | 'live' | 'final' {
  const status = 'status' in game ? game.status : 'final';
  return status === 'live' || status === 'scheduled' ? status : 'final';
}

function canonicalPair(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join('|');
}

function completedSummaryRows(rows: SeasonSummaryRow[], season: number): { rows: SeasonSummaryRow[]; complete: boolean } {
  const matching = rows.filter(row => Number(row.season) === season);
  return {
    rows: matching,
    complete: matching.filter(row => row.champion).length === 1 && matching.filter(row => row.saunders).length === 1,
  };
}

function latestCompleteSeason(rows: SeasonSummaryRow[]): number | null {
  const seasons = [...new Set(rows.map(row => Number(row.season)).filter(Number.isFinite))].sort((a, b) => b - a);
  return seasons.find(season => completedSummaryRows(rows, season).complete) ?? null;
}

function spotlightWeek(currentSeason: CurrentSeasonData): number | null {
  const games = currentSeason.games || [];
  const weeks = [...new Set(games.map(game => numeric(game.week)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!weeks.length) return null;
  const live = games.filter(game => game.status === 'live').map(game => game.week);
  if (live.length) return Math.max(...live);
  if (numeric(currentSeason.current_week) !== null && weeks.includes(Number(currentSeason.current_week))) return Number(currentSeason.current_week);
  const finals = games.filter(game => game.status === 'final').map(game => game.week);
  const latestFinal = finals.length ? Math.max(...finals) : null;
  const future = games.filter(game => game.status === 'scheduled' && (latestFinal === null || game.week > latestFinal)).map(game => game.week);
  if (future.length) return Math.min(...future);
  if (finals.length) return Math.max(...finals);
  return Math.min(...weeks);
}

export function resolvePulseSeasonState(input: {
  currentSeason: CurrentSeasonData | null;
  seasonSummaries: SeasonSummaryRow[];
  leagueGames: H2HGame[];
}): PulseSeasonState {
  const { currentSeason, seasonSummaries, leagueGames } = input;
  if (!currentSeason) {
    const completeSeason = latestCompleteSeason(seasonSummaries);
    const historicalSeason = leagueGames.length ? Math.max(...leagueGames.map(game => Number(game.season)).filter(Number.isFinite)) : null;
    return { phase: completeSeason !== null ? 'offseason' : 'historical-fallback', season: completeSeason ?? historicalSeason, spotlightWeek: null, isLive: false, summaryComplete: completeSeason !== null };
  }
  const games = currentSeason.games || [];
  const season = Number(currentSeason.season);
  const week = spotlightWeek(currentSeason);
  const hasLive = games.some(game => game.status === 'live');
  const hasFinal = games.some(game => game.status === 'final');
  const hasScheduled = games.some(game => game.status === 'scheduled');
  const summary = completedSummaryRows(seasonSummaries, season);
  if (!games.length) {
    const fallback = latestCompleteSeason(seasonSummaries);
    return { phase: fallback !== null ? 'offseason' : 'historical-fallback', season: fallback ?? season, spotlightWeek: null, isLive: false, summaryComplete: fallback !== null };
  }
  if (hasScheduled && !hasFinal && !hasLive) return { phase: 'preseason', season, spotlightWeek: week, isLive: false, summaryComplete: summary.complete };
  if (hasScheduled || hasLive) {
    const spotlightGames = games.filter(game => game.week === week);
    const maxRegular = numeric(currentSeason.playoff_rules?.regular_season_max_week ?? currentSeason.regular_season_max_week);
    const postseason = (week !== null && maxRegular !== null && week > maxRegular)
      || spotlightGames.some(game => game.type !== 'Regular' || String(game.round || '').trim());
    return { phase: postseason ? 'postseason' : 'regular-season', season, spotlightWeek: week, isLive: hasLive, summaryComplete: summary.complete };
  }
  if (games.every(game => game.status === 'final')) {
    return { phase: summary.complete ? 'offseason' : 'finalizing', season, spotlightWeek: week, isLive: false, summaryComplete: summary.complete };
  }
  return { phase: 'historical-fallback', season, spotlightWeek: week, isLive: hasLive, summaryComplete: summary.complete };
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

function historyLink(data: PulseModelData, pathname: string, options: Record<string, unknown> = {}): string {
  return pathUrl(pathname, {
    tab: 'history', allTeams: '__ALL__', selectedTeam: '__ALL__', universe: historyUniverse(data),
    selectedSeasons: new Set(), selectedWeeks: new Set(), selectedOpponents: new Set(), selectedTypes: new Set(), selectedRounds: new Set(),
    ...options,
  });
}

function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(2).replace(/\.00$/, '');
}

function matchupModels(data: PulseModelData, state: PulseSeasonState, pathname: string): PulseMatchupModel[] {
  if (!data.currentSeason || state.spotlightWeek === null || Number(data.currentSeason.season) !== state.season) return [];
  return data.currentSeason.games
    .filter(game => game.week === state.spotlightWeek && game.teamA && game.teamB && game.teamA !== game.teamB)
    .slice()
    .sort((a, b) => {
      const status = statusOrder[a.status] - statusOrder[b.status];
      const type = (typeOrder[a.round === 'Championship' ? 'Championship' : a.type] ?? 9) - (typeOrder[b.round === 'Championship' ? 'Championship' : b.type] ?? 9);
      const marginA = numeric(a.scoreA) !== null && numeric(a.scoreB) !== null ? Math.abs(Number(a.scoreA) - Number(a.scoreB)) : Number.POSITIVE_INFINITY;
      const marginB = numeric(b.scoreA) !== null && numeric(b.scoreB) !== null ? Math.abs(Number(b.scoreA) - Number(b.scoreB)) : Number.POSITIVE_INFINITY;
      return status || type || marginA - marginB || canonicalPair(a.teamA, a.teamB).localeCompare(canonicalPair(b.teamA, b.teamB));
    })
    .map(game => {
      const scoreA = numeric(game.scoreA);
      const scoreB = numeric(game.scoreB);
      const status = gameStatus(game);
      const result = status !== 'final' || scoreA === null || scoreB === null
        ? status === 'live' ? 'In progress' : 'Kickoff pending'
        : scoreA === scoreB ? 'Final — tie' : `Final — ${scoreA > scoreB ? game.teamA : game.teamB} won`;
      return {
        ownerA: game.teamA, ownerB: game.teamB, scoreA, scoreB,
        status: status === 'live' ? 'Live' : status === 'scheduled' ? 'Scheduled' : 'Final',
        type: game.type, round: game.round || '', result,
        currentHref: pathUrl(pathname, { tab: 'current', selectedCurrentSeason: state.season, selectedCurrentWeek: state.spotlightWeek }),
        rivalryHref: pathUrl(pathname, { tab: 'rivalry', selectedRivalryTeamA: game.teamA, selectedRivalryTeamB: game.teamB }),
      };
    });
}

function standingsSection(data: PulseModelData, state: PulseSeasonState, pathname: string): PulseStandingsSection | null {
  if (!data.currentSeason || !['regular-season', 'postseason', 'finalizing'].includes(state.phase)) return null;
  const base = { leagueGames: data.leagueGames, seasonSummaries: data.seasonSummaries, currentSeason: data.currentSeason, season: state.season, week: state.spotlightWeek };
  const href = pathUrl(pathname, { tab: 'current', selectedCurrentSeason: state.season, selectedCurrentWeek: state.spotlightWeek, selectedFocus: 'standings' });
  if (state.phase === 'postseason') {
    const standings = buildCurrentSeasonStandings(base);
    const activeOwners = new Set(data.currentSeason.games
      .filter(game => game.week === state.spotlightWeek)
      .flatMap(game => [game.teamA, game.teamB]));
    return {
      mode: 'current-table', heading: 'Road to the trophies', href,
      rows: standings.filter((row: any) => activeOwners.has(row.owner)).map((row: any) => ({ owner: row.owner, seed: row.rank, record: row.record })),
    };
  }
  if (state.isLive) {
    const rules = resolveCurrentSeasonRules(data.currentSeason, data.currentSeason.teams.length);
    const projected = buildProjectedStandings({ ...base, rules, projectionMode: 'ifScoresHold' });
    const movement = buildLiveMovement({ ...base, rules, projectedStandings: projected });
    return {
      mode: 'live-projection', heading: 'If scores hold', href,
      rows: movement.map((row: any) => ({ owner: row.owner, seed: row.projectedSeed, previousSeed: row.previousSeed, change: row.seedChange, record: row.projectedRecord, movementLabel: row.seedChange > 0 ? `up ${row.seedChange}` : row.seedChange < 0 ? `down ${Math.abs(row.seedChange)}` : 'no change' })),
    };
  }
  const standings = buildCurrentSeasonStandings(base);
  return { mode: 'current-table', heading: state.phase === 'finalizing' ? 'Available final standings' : 'Current standings', href, rows: standings.map((row: any) => ({ owner: row.owner, seed: row.rank, record: row.record })) };
}

function seasonGames(data: PulseModelData, state: PulseSeasonState): H2HGame[] {
  return data.leagueGames.filter(game => Number(game.season) === state.season);
}

function seriesFor(games: H2HGame[], ownerA: string, ownerB: string) {
  const matching = games.filter(game => canonicalPair(game.teamA, game.teamB) === canonicalPair(ownerA, ownerB));
  let winsA = 0; let winsB = 0; let ties = 0;
  matching.forEach(game => {
    const aScore = game.teamA === ownerA ? game.scoreA : game.scoreB;
    const bScore = game.teamA === ownerA ? game.scoreB : game.scoreA;
    if (aScore > bScore) winsA += 1; else if (bScore > aScore) winsB += 1; else ties += 1;
  });
  return { matching, winsA, winsB, ties };
}

function matchingRivalry(rivalries: RivalryDefinition[], ownerA: string, ownerB: string): RivalryDefinition | null {
  return rivalries
    .filter(rivalry => rivalry.members.includes(ownerA) && rivalry.members.includes(ownerB))
    .sort((a, b) => Number(b.type === 'pair') - Number(a.type === 'pair') || a.slug.localeCompare(b.slug))[0] || null;
}

function featuredMatchup(data: PulseModelData, state: PulseSeasonState, matchups: PulseMatchupModel[], pathname: string): PulseFeaturedMatchup | null {
  const currentCandidates = matchups.map(matchup => ({ ownerA: matchup.ownerA, ownerB: matchup.ownerB, margin: matchup.scoreA !== null && matchup.scoreB !== null ? Math.abs(matchup.scoreA - matchup.scoreB) : Number.POSITIVE_INFINITY, postseason: matchup.type !== 'Regular' }));
  const recentGames = seasonGames(data, state);
  const historicalCandidates = recentGames.map(game => ({ ownerA: game.teamA, ownerB: game.teamB, margin: Math.abs(game.scoreA - game.scoreB), postseason: game.type !== 'Regular' }));
  const candidates = currentCandidates.length ? currentCandidates : historicalCandidates;
  const ranked = candidates.map(candidate => {
    const rivalry = matchingRivalry(data.rivalries, candidate.ownerA, candidate.ownerB);
    const series = seriesFor(data.leagueGames, candidate.ownerA, candidate.ownerB);
    const total = series.matching.length;
    const balance = total ? Math.abs((series.winsA + series.ties * 0.5) / total - 0.5) : 1;
    return { ...candidate, rivalry, series, balance };
  }).sort((a, b) => Number(!!b.rivalry && b.postseason) - Number(!!a.rivalry && a.postseason) || Number(!!b.rivalry) - Number(!!a.rivalry) || a.balance - b.balance || b.series.matching.length - a.series.matching.length || a.margin - b.margin || canonicalPair(a.ownerA, a.ownerB).localeCompare(canonicalPair(b.ownerA, b.ownerB)));
  const chosen = ranked[0];
  if (!chosen) return null;
  const latest = chosen.series.matching.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const latestResult = latest ? `${latest.teamA} ${formatScore(latest.scoreA)}–${formatScore(latest.scoreB)} ${latest.teamB}` : 'No completed meeting yet';
  return {
    heading: chosen.rivalry ? 'Featured rivalry' : 'Matchup to watch',
    name: chosen.rivalry?.name || `${chosen.ownerA} vs ${chosen.ownerB}`,
    note: chosen.rivalry ? chosen.rivalry.note || 'A configured league rivalry.' : 'Selected from the closest all-time series in this snapshot.',
    ownerA: chosen.ownerA, ownerB: chosen.ownerB,
    series: `${chosen.ownerA} ${chosen.series.winsA}–${chosen.series.winsB}${chosen.series.ties ? `–${chosen.series.ties}` : ''} ${chosen.ownerB}`,
    latestResult,
    href: pathUrl(pathname, { tab: 'rivalry', selectedRivalryTeamA: chosen.ownerA, selectedRivalryTeamB: chosen.ownerB, selectedRivalryScope: 'allTime' }),
  };
}

function curseModel(data: PulseModelData, pathname: string): PulseCurseModel | null {
  const model = buildCurseTrackerModel(data.leagueGames, data.seasonSummaries);
  const cards = model.cards.filter((card: any) => !card.developmentCandidate);
  const active = cards.filter((card: any) => card.status === 'Active').sort((a: any, b: any) => (numeric(b.severity) ?? -1) - (numeric(a.severity) ?? -1) || String(b.lastOccurrence?.date || '').localeCompare(String(a.lastOccurrence?.date || '')) || (numeric(b.sampleSize) ?? 0) - (numeric(a.sampleSize) ?? 0) || String(a.id).localeCompare(String(b.id)))[0];
  const fallback = cards.slice().sort((a: any, b: any) => String(b.lastOccurrence?.date || '').localeCompare(String(a.lastOccurrence?.date || '')) || String(a.id).localeCompare(String(b.id)))[0];
  const chosen = active || fallback;
  if (!chosen) return null;
  return {
    heading: active ? 'Active curse' : 'Curse watch', title: String(chosen.title || 'Curse watch'),
    summary: String(chosen.summary || 'No active curse in the current snapshot.'), status: String(chosen.status || 'Cold'),
    severity: numeric(chosen.severity) === 3 ? 'High severity' : numeric(chosen.severity) === 2 ? 'Medium severity' : numeric(chosen.severity) === 1 ? 'Watch' : 'Unrated',
    sample: numeric(chosen.sampleSize) !== null ? `${chosen.sampleSize} observations` : 'Sample unavailable',
    href: pathUrl(pathname, { tab: 'history', selectedFocus: 'curses' }),
  };
}

interface RecordCandidate { order: number; title: string; value: number; game: H2HGame; owner: string; opponent: string; sort: string }

function recordModel(data: PulseModelData, state: PulseSeasonState, pathname: string): PulseRecordModel | null {
  const games = data.leagueGames.filter(game => [game.scoreA, game.scoreB].every(value => Number.isFinite(Number(value))));
  if (!games.length) return null;
  const sideRows = games.flatMap(game => [
    { game, owner: game.teamA, opponent: game.teamB, score: game.scoreA, opponentScore: game.scoreB },
    { game, owner: game.teamB, opponent: game.teamA, score: game.scoreB, opponentScore: game.scoreA },
  ]);
  const maxScore = Math.max(...sideRows.map(row => row.score));
  const minScore = Math.min(...sideRows.map(row => row.score));
  const maxMargin = Math.max(...games.map(game => Math.abs(game.scoreA - game.scoreB)));
  const maxCombined = Math.max(...games.map(game => game.scoreA + game.scoreB));
  const records: RecordCandidate[] = [
    ...sideRows.filter(row => row.score === maxScore).map(row => ({ order: 0, title: 'Highest individual score', value: row.score, ...row, sort: 'scoreDesc' })),
    ...sideRows.filter(row => row.score === minScore).map(row => ({ order: 1, title: 'Lowest individual score', value: row.score, ...row, sort: 'scoreAsc' })),
    ...games.filter(game => Math.abs(game.scoreA - game.scoreB) === maxMargin).map(game => ({ order: 2, title: 'Largest winning margin', value: maxMargin, game, owner: game.scoreA >= game.scoreB ? game.teamA : game.teamB, opponent: game.scoreA >= game.scoreB ? game.teamB : game.teamA, sort: 'marginDesc' })),
    ...games.filter(game => game.scoreA + game.scoreB === maxCombined).map(game => ({ order: 3, title: 'Highest combined score', value: maxCombined, game, owner: game.teamA, opponent: game.teamB, sort: 'combinedDesc' })),
  ];
  const chosen = records.sort((a, b) => String(b.game.date).localeCompare(String(a.game.date)) || a.order - b.order || canonicalPair(a.owner, a.opponent).localeCompare(canonicalPair(b.owner, b.opponent)))[0];
  const ownerScore = chosen.game.teamA === chosen.owner ? chosen.game.scoreA : chosen.game.scoreB;
  const opponentScore = chosen.game.teamA === chosen.owner ? chosen.game.scoreB : chosen.game.scoreA;
  return {
    label: Number(chosen.game.season) === state.season ? `New in ${state.season}` : `Still standing since ${chosen.game.date}`,
    title: chosen.title, owner: chosen.owner, opponent: chosen.opponent,
    scoreline: `${formatScore(ownerScore)}–${formatScore(opponentScore)}`, value: formatScore(chosen.value), date: chosen.game.date,
    href: historyLink(data, pathname, { selectedTeam: chosen.owner, selectedSeasons: new Set([Number(chosen.game.season)]), selectedGameSort: chosen.sort, selectedGameLimit: 1, selectedFocus: 'games' }),
  };
}

function longestWinStreak(games: H2HGame[]) {
  const owners = [...new Set(games.flatMap(game => [game.teamA, game.teamB]))];
  const results = owners.map(owner => {
    let current = 0; let best = 0; let ended = '';
    games.slice().sort((a, b) => Number(a.week) - Number(b.week) || String(a.date).localeCompare(String(b.date))).forEach(game => {
      if (game.teamA !== owner && game.teamB !== owner) return;
      const won = game.teamA === owner ? game.scoreA > game.scoreB : game.scoreB > game.scoreA;
      current = won ? current + 1 : 0;
      if (current >= best) { best = current; ended = game.date; }
    });
    return { owner, best, ended };
  });
  return results.sort((a, b) => b.best - a.best || String(b.ended).localeCompare(String(a.ended)) || a.owner.localeCompare(b.owner))[0] || null;
}

function yearInReview(data: PulseModelData, state: PulseSeasonState, pathname: string): PulseYearInReview | null {
  if (!['offseason', 'preseason'].includes(state.phase) || state.season === null) return null;
  const reviewSeason = state.phase === 'preseason'
    ? latestCompleteSeason(data.seasonSummaries.filter(row => Number(row.season) < state.season))
    : state.season;
  if (reviewSeason === null) return null;
  const rows = completedSummaryRows(data.seasonSummaries, reviewSeason).rows.slice().sort((a, b) => a.finish - b.finish || a.owner.localeCompare(b.owner));
  const champion = rows.find(row => row.champion);
  const saunders = rows.find(row => row.saunders);
  if (!champion || !saunders) return null;
  const runnerUp = rows.find(row => row.finish === 2) || null;
  const games = data.leagueGames.filter(game => Number(game.season) === reviewSeason);
  const sideRows = games.flatMap(game => [{ owner: game.teamA, opponent: game.teamB, score: game.scoreA, opponentScore: game.scoreB, game }, { owner: game.teamB, opponent: game.teamA, score: game.scoreB, opponentScore: game.scoreA, game }]);
  const points = rows.slice().sort((a, b) => b.points_for - a.points_for || a.owner.localeCompare(b.owner))[0];
  const bestRecord = rows.slice().sort((a, b) => ((b.wins + 0.5 * b.ties) / Math.max(1, b.wins + b.losses + b.ties)) - ((a.wins + 0.5 * a.ties) / Math.max(1, a.wins + a.losses + a.ties)) || b.points_for - a.points_for || a.owner.localeCompare(b.owner))[0];
  const high = sideRows.slice().sort((a, b) => b.score - a.score || a.owner.localeCompare(b.owner))[0];
  const close = games.slice().sort((a, b) => Math.abs(a.scoreA - a.scoreB) - Math.abs(b.scoreA - b.scoreB) || String(a.date).localeCompare(String(b.date)))[0];
  const streak = longestWinStreak(games);
  const seasonHref = historyLink(data, pathname, { selectedSeasons: new Set([reviewSeason]) });
  const superlatives: PulseSuperlative[] = [];
  if (points) superlatives.push({ label: 'Points leader', value: points.owner, detail: `${formatScore(points.points_for)} points`, href: seasonHref });
  if (bestRecord) superlatives.push({ label: 'Best regular-season record', value: bestRecord.owner, detail: `${bestRecord.wins}-${bestRecord.losses}${bestRecord.ties ? `-${bestRecord.ties}` : ''}`, href: seasonHref });
  if (high) superlatives.push({ label: 'Highest weekly score', value: high.owner, detail: `${formatScore(high.score)} vs ${high.opponent}`, href: historyLink(data, pathname, { selectedTeam: high.owner, selectedSeasons: new Set([reviewSeason]), selectedGameSort: 'scoreDesc', selectedGameLimit: 1, selectedFocus: 'games' }) });
  if (close) superlatives.push({ label: 'Closest game', value: `${close.teamA} vs ${close.teamB}`, detail: `${formatScore(close.scoreA)}–${formatScore(close.scoreB)}`, href: seasonHref });
  if (streak?.best) superlatives.push({ label: 'Longest win streak', value: streak.owner, detail: `${streak.best} games`, href: seasonHref });
  const championship = games
    .filter(game => String(game.round || '').toLowerCase().includes('championship'))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  return {
    season: reviewSeason, champion: champion.owner, runnerUp: runnerUp?.owner || null, saunders: saunders.owner,
    championshipResult: championship ? `${championship.teamA} ${formatScore(championship.scoreA)}–${formatScore(championship.scoreB)} ${championship.teamB}` : null,
    finalStandings: rows.map(row => ({ finish: row.finish, owner: row.owner, record: `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`, pointsFor: row.points_for })),
    superlatives,
  };
}

function heroModel(data: PulseModelData, state: PulseSeasonState, year: PulseYearInReview | null, pathname: string): PulseHeroModel {
  const season = state.season;
  const historyHref = season === null ? pathUrl(pathname, { tab: 'history' }) : historyLink(data, pathname, { selectedSeasons: new Set([season]) });
  if (state.phase === 'offseason' && year) return {
    phase: state.phase, season, eyebrow: 'League Pulse · Offseason', title: `${season} Year in Review`,
    summary: `${year.champion} claimed the championship${year.runnerUp ? ` over ${year.runnerUp}` : ''}${year.championshipResult ? ` — ${year.championshipResult}` : ''}. ${year.saunders} won the Saunders Bowl.`,
    badge: 'Offseason', generatedAt: data.currentSeason?.generated_at || null,
    primaryAction: { label: `Open ${year.champion}'s Trophy Case`, href: pathUrl(pathname, { tab: 'trophy', selectedTrophyOwner: year.champion }) },
    secondaryAction: { label: `Explore ${season} history`, href: historyHref },
  };
  if (state.phase === 'preseason' && year) return {
    phase: state.phase, season, eyebrow: 'League Pulse · Preseason', title: `${season} Preview`,
    summary: `The schedule is available and competition has not started. ${year.champion} enters as the defending champion; ${year.saunders} holds the latest Saunders title.`,
    badge: 'Scheduled', generatedAt: data.currentSeason?.generated_at || null,
    primaryAction: { label: 'Open Week 1 matchups', href: pathUrl(pathname, { tab: 'current', selectedCurrentSeason: season, selectedCurrentWeek: state.spotlightWeek }) },
    secondaryAction: { label: `Review ${year.season}`, href: historyLink(data, pathname, { selectedSeasons: new Set([year.season]) }) },
  };
  const details: Record<PulsePhase, [string, string, string, PulseHeroModel['badge']]> = {
    preseason: ['Season starts soon', `${season} Preview`, 'The schedule is available; competition has not started yet.', 'Scheduled'],
    'regular-season': [`Week ${state.spotlightWeek ?? ''}`, state.isLive ? 'League action in progress' : 'This week in the league', 'Scores, standings movement, and the matchup that matters most.', state.isLive ? 'Live' : 'Scheduled'],
    postseason: [`${season} Postseason`, state.isLive ? 'The trophy paths are live' : 'Road to the trophies', 'Championship and Saunders paths are separated by the validated bracket data.', state.isLive ? 'Live' : 'Scheduled'],
    finalizing: ['League Pulse', 'Season complete — recap pending', 'Final results are available while authoritative season honors await the finalized summary.', 'Final'],
    offseason: ['League Pulse', `${season} Year in Review`, 'The latest finalized season at a glance.', 'Offseason'],
    'historical-fallback': ['League Pulse', season ? `${season} league snapshot` : 'League history', 'Current-season data is unavailable, so this page is using the latest completed history.', 'Data limited'],
  };
  const [eyebrow, title, summary, badge] = details[state.phase];
  return { phase: state.phase, season, eyebrow, title, summary, badge, generatedAt: data.currentSeason?.generated_at || null, primaryAction: { label: 'Open Current Season', href: pathUrl(pathname, { tab: 'current', selectedCurrentSeason: season, selectedCurrentWeek: state.spotlightWeek }) }, secondaryAction: { label: 'Explore League History', href: historyHref } };
}

function quickLinks(data: PulseModelData, state: PulseSeasonState, featured: PulseFeaturedMatchup | null, year: PulseYearInReview | null, pathname: string): PulseLink[] {
  return [
    { label: 'Current Season', href: pathUrl(pathname, { tab: 'current', selectedCurrentSeason: state.season, selectedCurrentWeek: state.spotlightWeek }) },
    { label: 'League History', href: state.season === null ? pathUrl(pathname, { tab: 'history' }) : historyLink(data, pathname, { selectedSeasons: new Set([state.season]) }) },
    { label: 'Head to Head', href: featured?.href || pathUrl(pathname, { tab: 'rivalry' }) },
    { label: 'Trophy Case', href: pathUrl(pathname, { tab: 'trophy', selectedTrophyOwner: year?.champion || null }) },
    { label: 'Dynasty Rankings', href: pathUrl(pathname, { tab: 'dynasty' }) },
    { label: 'Draft Spot', href: pathUrl(pathname, { tab: 'draft' }) },
    { label: 'Historical Matchup', href: pathUrl(pathname, { tab: 'gauntlet' }) },
  ];
}

export function buildLeaguePulseModel(data: PulseModelData, options: { pathname?: string } = {}): LeaguePulseViewModel {
  const pathname = options.pathname || '/';
  const state = resolvePulseSeasonState(data);
  const matchups = matchupModels(data, state, pathname);
  const year = yearInReview(data, state, pathname);
  const featured = featuredMatchup(data, state, matchups, pathname);
  const usedFallbacks = [];
  if (!data.currentSeason) usedFallbacks.push('CurrentSeason');
  if (!data.rivalries.length) usedFallbacks.push('Rivalries');
  if (!data.derivedStats) usedFallbacks.push('DerivedStats');
  if (state.phase === 'finalizing') usedFallbacks.push('SeasonSummary');
  return {
    state, hero: heroModel(data, state, year, pathname), matchups,
    standings: standingsSection(data, state, pathname), yearInReview: year,
    featuredMatchup: featured, curse: curseModel(data, pathname), record: recordModel(data, state, pathname),
    quickLinks: quickLinks(data, state, featured, year, pathname),
    dataNote: { generatedAt: data.currentSeason?.generated_at || null, dataVersion: data.dataVersion, usedFallbacks },
  };
}
