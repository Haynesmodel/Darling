import type { RivalryLeadChartRow } from '../../charting/chart-types';
import type {
  RivalryGame,
  RivalryGameRow,
  RivalryHighlight,
  RivalryMeeting,
  RivalryRecord,
  RivalryRecordSummary,
  RivalryResult,
  RivalryRun,
  RivalryScope,
  RivalrySeasonRow,
  RivalrySummary,
  RivalryTapeItem,
  RivalryViewModel,
} from './rivalry-types';

interface TeamSide {
  pf: number;
  pa: number;
  result: RivalryResult;
}

function byDateAsc(a: RivalryGame, b: RivalryGame): number {
  return a.date.localeCompare(b.date);
}

function byDateDesc(a: RivalryGame, b: RivalryGame): number {
  return b.date.localeCompare(a.date);
}

function nfmt(value: number, digits = 2): string {
  return Number(value).toFixed(digits);
}

function normType(value: string): string {
  return value.trim() || 'Regular';
}

function normRound(value: string | null): string {
  return value || '';
}

function sidesForTeam(game: RivalryGame, team: string): TeamSide | null {
  const isA = game.teamA === team;
  const isB = game.teamB === team;
  if (!isA && !isB) return null;
  const pf = isA ? game.scoreA : game.scoreB;
  const pa = isA ? game.scoreB : game.scoreA;
  return { pf, pa, result: pf > pa ? 'W' : pf < pa ? 'L' : 'T' };
}

function isSaundersGame(game: RivalryGame): boolean {
  return normType(game.type).toLowerCase() === 'saunders' || normRound(game.round).toLowerCase().includes('saunders');
}

function isRegularGame(game: RivalryGame): boolean {
  return normType(game.type) === 'Regular';
}

function isPlayoffGame(game: RivalryGame): boolean {
  return !isRegularGame(game) && !isSaundersGame(game);
}

export function pairMatches(teamA: string, teamB: string, game: RivalryGame): boolean {
  return (game.teamA === teamA && game.teamB === teamB) || (game.teamA === teamB && game.teamB === teamA);
}

export function formatRecord(wins: number, losses: number, ties = 0): string {
  return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function formatScoreline(a: number, b: number): string {
  return `${nfmt(a)} - ${nfmt(b)}`;
}

export function formatLeaderText(teamA: string, teamB: string, result: RivalryResult, length: number): string {
  if (!length) return '—';
  if (result === 'T') return `Tie T${length}`;
  return `${result === 'W' ? teamA : teamB} W${length}`;
}

export function displayRoundName(round: string): string {
  const value = round.trim();
  return /^final$/i.test(value) ? 'Championship' : value;
}

export function rivalryGames(teamA: string, teamB: string, games: readonly RivalryGame[]): RivalryGame[] {
  if (!teamA || !teamB || teamA === teamB) return [];
  return games.filter(game => pairMatches(teamA, teamB, game)).slice().sort(byDateAsc);
}

function emptyRecord(): RivalryRecord {
  return { w: 0, l: 0, t: 0, g: 0, pf: 0, pa: 0 };
}

function updateRecord(record: RivalryRecord, result: RivalryResult, pf: number, pa: number): void {
  record.g += 1;
  record.pf += pf;
  record.pa += pa;
  if (result === 'W') record.w += 1;
  else if (result === 'L') record.l += 1;
  else record.t += 1;
}

export function recordFromGames(teamA: string, games: readonly RivalryGame[]): RivalryRecord {
  const record = emptyRecord();
  games.forEach(game => {
    const side = sidesForTeam(game, teamA);
    if (side) updateRecord(record, side.result, side.pf, side.pa);
  });
  return record;
}

function resultLabel(result: RivalryResult, teamA: string, teamB: string): string {
  return result === 'W' ? teamA : result === 'L' ? teamB : 'Tie';
}

export function computeBestRun(teamA: string, games: readonly RivalryGame[], resultType: RivalryResult): RivalryRun | null {
  let best: RivalryRun | null = null;
  let current: RivalryRun | null = null;
  for (const game of games.slice().sort(byDateAsc)) {
    const side = sidesForTeam(game, teamA);
    if (!side) continue;
    if (side.result === resultType) {
      if (!current) current = { result: resultType, len: 0, start: game, end: game };
      current.len += 1;
      current.end = game;
    } else if (current) {
      if (!best || current.len > best.len || (current.len === best.len && current.end.date > best.end.date)) best = current;
      current = null;
    }
  }
  if (current && (!best || current.len > best.len || (current.len === best.len && current.end.date > best.end.date))) best = current;
  return best;
}

export function computeCurrentRun(teamA: string, teamB: string, games: readonly RivalryGame[]): RivalryRun | null {
  const ordered = games.slice().sort(byDateAsc);
  const end = ordered.at(-1);
  if (!end) return null;
  const endSide = sidesForTeam(end, teamA);
  if (!endSide) return null;
  let length = 1;
  let start = end;
  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    const side = sidesForTeam(ordered[index], teamA);
    if (!side || side.result !== endSide.result) break;
    length += 1;
    start = ordered[index];
  }
  return { result: endSide.result, len: length, start, end, leader: resultLabel(endSide.result, teamA, teamB) };
}

function recordSummary(record: RivalryRecord): RivalryRecordSummary {
  return {
    ...record,
    diff: record.pf - record.pa,
    pct: record.g ? (record.w + (0.5 * record.t)) / record.g : 0,
    recordText: record.g ? formatRecord(record.w, record.l, record.t) : '0-0',
  };
}

export function summarizeRivalry(teamA: string, teamB: string, games: readonly RivalryGame[]): RivalrySummary {
  const filtered = rivalryGames(teamA, teamB, games);
  const overall = emptyRecord();
  const regular = emptyRecord();
  const playoffs = emptyRecord();
  const saunders = emptyRecord();
  let biggestBlowout: RivalryMeeting | null = null;
  let closestGame: RivalryMeeting | null = null;
  let highestCombinedGame: RivalryMeeting | null = null;
  let lowestCombinedGame: RivalryMeeting | null = null;
  let highestTeamAScore: RivalryMeeting | null = null;
  let highestTeamBScore: RivalryMeeting | null = null;
  let lastMeeting: RivalryMeeting | null = null;

  filtered.forEach(game => {
    const side = sidesForTeam(game, teamA);
    if (!side) return;
    updateRecord(overall, side.result, side.pf, side.pa);
    if (isRegularGame(game)) updateRecord(regular, side.result, side.pf, side.pa);
    else if (isSaundersGame(game)) updateRecord(saunders, side.result, side.pf, side.pa);
    else if (isPlayoffGame(game)) updateRecord(playoffs, side.result, side.pf, side.pa);
    const margin = Math.abs(side.pf - side.pa);
    const total = game.scoreA + game.scoreB;
    const meeting: RivalryMeeting = {
      date: game.date,
      season: game.season,
      winner: resultLabel(side.result, teamA, teamB),
      teamA,
      teamB,
      scoreA: game.scoreA,
      scoreB: game.scoreB,
      pf: side.pf,
      pa: side.pa,
      result: side.result,
      type: normType(game.type),
      round: normRound(game.round),
    };
    if (!biggestBlowout || margin > (biggestBlowout.margin || 0) || (margin === biggestBlowout.margin && game.date > biggestBlowout.date)) biggestBlowout = { ...meeting, margin };
    if (!closestGame || margin < (closestGame.margin ?? Number.POSITIVE_INFINITY) || (margin === closestGame.margin && game.date > closestGame.date)) closestGame = { ...meeting, margin };
    if (!highestCombinedGame || total > (highestCombinedGame.total || 0) || (total === highestCombinedGame.total && game.date > highestCombinedGame.date)) highestCombinedGame = { ...meeting, total };
    if (!lowestCombinedGame || total < (lowestCombinedGame.total ?? Number.POSITIVE_INFINITY) || (total === lowestCombinedGame.total && game.date > lowestCombinedGame.date)) lowestCombinedGame = { ...meeting, total };
    if (!highestTeamAScore || side.pf > (highestTeamAScore.score || 0) || (side.pf === highestTeamAScore.score && game.date > highestTeamAScore.date)) highestTeamAScore = { ...meeting, score: side.pf };
    if (!highestTeamBScore || side.pa > (highestTeamBScore.score || 0) || (side.pa === highestTeamBScore.score && game.date > highestTeamBScore.date)) highestTeamBScore = { ...meeting, score: side.pa };
    if (!lastMeeting || game.date > lastMeeting.date) lastMeeting = meeting;
  });

  const overallSummary = recordSummary(overall);
  return {
    teamA,
    teamB,
    games: filtered,
    overall: {
      ...overallSummary,
      averageA: overall.g ? overall.pf / overall.g : 0,
      averageB: overall.g ? overall.pa / overall.g : 0,
    },
    regular: recordSummary(regular),
    playoffs: recordSummary(playoffs),
    saunders: recordSummary(saunders),
    biggestBlowout,
    closestGame,
    highestCombinedGame,
    lowestCombinedGame,
    highestTeamAScore,
    highestTeamBScore,
    currentStreak: computeCurrentRun(teamA, teamB, filtered),
    longestTeamAStreak: computeBestRun(teamA, filtered, 'W'),
    longestTeamBStreak: computeBestRun(teamA, filtered, 'L'),
    lastMeeting,
  };
}

export function rivalrySeasonBreakdown(teamA: string, teamB: string, games: readonly RivalryGame[]): RivalrySeasonRow[] {
  const bySeason = new Map<number, Omit<RivalrySeasonRow, 'recordText'>>();
  rivalryGames(teamA, teamB, games).forEach(game => {
    const side = sidesForTeam(game, teamA);
    if (!side) return;
    const row = bySeason.get(game.season) || {
      season: game.season,
      games: 0,
      w: 0,
      l: 0,
      t: 0,
      pf: 0,
      pa: 0,
      diff: 0,
      notes: [],
      postseasonWinner: null,
      postseasonRounds: [],
      round: '',
    };
    row.games += 1;
    row.pf += side.pf;
    row.pa += side.pa;
    if (side.result === 'W') row.w += 1;
    else if (side.result === 'L') row.l += 1;
    else row.t += 1;
    if (isPlayoffGame(game)) {
      row.postseasonWinner = resultLabel(side.result, teamA, teamB);
      const roundName = displayRoundName(normRound(game.round));
      if (roundName && !row.postseasonRounds.includes(roundName)) row.postseasonRounds.push(roundName);
      if (!row.notes.includes('Playoff meeting')) row.notes.push('Playoff meeting');
    }
    if (isSaundersGame(game)) {
      const roundName = displayRoundName(normRound(game.round));
      if (roundName && !row.postseasonRounds.includes(roundName)) row.postseasonRounds.push(roundName);
      if (!row.notes.includes('Saunders meeting')) row.notes.push('Saunders meeting');
    }
    if (isRegularGame(game) && !row.notes.includes('Regular season')) row.notes.push('Regular season');
    bySeason.set(game.season, row);
  });

  return [...bySeason.values()].sort((a, b) => b.season - a.season).map(row => {
    const notes = [...row.notes];
    if (row.games && row.w === row.games) notes.unshift('🧹 Sweep');
    else if (row.games && row.l === row.games) notes.unshift('🧹 Swept');
    else if (row.w > 0 && row.l > 0) notes.unshift('Split');
    const rounds = [...new Set(row.postseasonRounds)].filter(Boolean);
    if (rounds.length) {
      const roundsText = rounds.join(', ');
      const playoffIndex = notes.indexOf('Playoff meeting');
      if (playoffIndex >= 0) notes[playoffIndex] = `Playoff meeting (${roundsText}) winner: ${row.postseasonWinner}`;
      const saundersIndex = notes.indexOf('Saunders meeting');
      if (saundersIndex >= 0) notes[saundersIndex] = `Saunders meeting (${roundsText})`;
    }
    if (row.t) notes.push(`${row.t} tie${row.t === 1 ? '' : 's'}`);
    return { ...row, diff: row.pf - row.pa, recordText: formatRecord(row.w, row.l, row.t), notes };
  });
}

export function rivalryGameRows(teamA: string, teamB: string, games: readonly RivalryGame[]): RivalryGameRow[] {
  return rivalryGames(teamA, teamB, games).slice().sort(byDateDesc).flatMap(game => {
    const side = sidesForTeam(game, teamA);
    if (!side) return [];
    const type = normType(game.type);
    return [{
      date: game.date,
      season: game.season,
      week: Number.isFinite(game._weekByTeam?.[teamA]) ? Number(game._weekByTeam?.[teamA]) : null,
      type,
      round: normRound(game.round),
      result: side.result,
      winner: resultLabel(side.result, teamA, teamB),
      score: formatScoreline(side.pf, side.pa),
      margin: Math.abs(side.pf - side.pa),
      rowClass: side.result === 'W' ? 'result-win' : side.result === 'L' ? 'result-loss' : 'result-tie',
      postseasonClass: type !== 'Regular' ? 'postseason' : '',
    }];
  });
}

function scopedGames(games: readonly RivalryGame[], scope: RivalryScope, currentSeason: number | null): RivalryGame[] {
  if (scope === 'currentSeason' && currentSeason !== null) return games.filter(game => game.season === currentSeason);
  if (scope === 'historic' && currentSeason !== null) return games.filter(game => game.season < currentSeason);
  return games.slice();
}

function summarizeMargins(games: readonly RivalryGame[], teamA: string, teamB: string) {
  const margins: number[] = [];
  const blowoutCounts: Record<string, number> = { [teamA]: 0, [teamB]: 0 };
  games.forEach(game => {
    const side = sidesForTeam(game, teamA);
    if (!side) return;
    const margin = Math.abs(side.pf - side.pa);
    margins.push(margin);
    if (margin >= 30) {
      const winner = side.result === 'W' ? teamA : teamB;
      blowoutCounts[winner] = (blowoutCounts[winner] || 0) + 1;
    }
  });
  const sorted = margins.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    average: margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : null,
    median: margins.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : null,
    blowoutCounts,
  };
}

function buildTape(summary: RivalrySummary, teamA: string, teamB: string): RivalryTapeItem[] {
  const margins = summarizeMargins(summary.games, teamA, teamB);
  const leader = summary.overall.w > summary.overall.l ? `${teamA} leads` : summary.overall.l > summary.overall.w ? `${teamB} leads` : 'Series tied';
  const scoreLeader = summary.overall.averageA > summary.overall.averageB ? `${teamA} leads` : summary.overall.averageB > summary.overall.averageA ? `${teamB} leads` : 'Even';
  return [
    { label: 'Series Record', value: summary.overall.recordText, sub: summary.overall.g ? leader : '' },
    { label: 'Point Differential', value: `${summary.overall.diff >= 0 ? '+' : ''}${nfmt(summary.overall.diff)}`, sub: summary.overall.g ? leader : '' },
    { label: 'Average Score', value: `${nfmt(summary.overall.averageA)} - ${nfmt(summary.overall.averageB)}`, sub: summary.overall.g ? scoreLeader : '' },
    { label: 'Regular Season', value: summary.regular.recordText, sub: '' },
    { label: 'Playoffs', value: summary.playoffs.recordText, sub: '' },
    { label: 'Saunders', value: summary.saunders.recordText, sub: '' },
    { label: 'Current Streak', value: formatLeaderText(teamA, teamB, summary.currentStreak?.result || 'T', summary.currentStreak?.len || 0), sub: summary.currentStreak ? `${summary.currentStreak.start.date} to ${summary.currentStreak.end.date}` : '' },
    { label: `Longest ${teamA} Run`, value: formatLeaderText(teamA, teamB, summary.longestTeamAStreak?.result || 'T', summary.longestTeamAStreak?.len || 0), sub: summary.longestTeamAStreak ? `${summary.longestTeamAStreak.start.date} to ${summary.longestTeamAStreak.end.date}` : '' },
    { label: `Longest ${teamB} Run`, value: formatLeaderText(teamA, teamB, summary.longestTeamBStreak?.result || 'T', summary.longestTeamBStreak?.len || 0), sub: summary.longestTeamBStreak ? `${summary.longestTeamBStreak.start.date} to ${summary.longestTeamBStreak.end.date}` : '' },
    { label: 'Margin Avg / Median', value: margins.average === null ? '—' : `${nfmt(margins.average)} / ${nfmt(margins.median || 0)}`, sub: '' },
    { label: '30+ Point Wins', value: `${teamA} ${margins.blowoutCounts[teamA] || 0} / ${teamB} ${margins.blowoutCounts[teamB] || 0}`, sub: '' },
    { label: 'Last Meeting', value: summary.lastMeeting ? `${summary.lastMeeting.winner === 'Tie' ? 'Tied' : summary.lastMeeting.winner} ${formatScoreline(summary.lastMeeting.pf, summary.lastMeeting.pa)}` : '—', sub: summary.lastMeeting?.date || '' },
  ];
}

const STINKER_SCORE_LIMIT = 70;

function isStinkerMeeting(game: RivalryGame): boolean {
  return game.scoreA < STINKER_SCORE_LIMIT && game.scoreB < STINKER_SCORE_LIMIT;
}

function buildHighlights(summary: RivalrySummary, teamA: string, teamB: string): RivalryHighlight[] {
  if (!summary.overall.g) return [];
  const highlights: RivalryHighlight[] = [];
  if (summary.biggestBlowout) highlights.push({ icon: '💥', label: 'Biggest Blowout', value: formatScoreline(summary.biggestBlowout.pf, summary.biggestBlowout.pa), sub: `${summary.biggestBlowout.winner} on ${summary.biggestBlowout.date}`, tone: 'blowout' });
  if (summary.highestCombinedGame) highlights.push({ icon: '🔥', label: 'Highest Combined', value: `${nfmt(summary.highestCombinedGame.total || 0)} total`, sub: `${summary.highestCombinedGame.winner} on ${summary.highestCombinedGame.date}`, tone: 'heat' });
  const first = summary.longestTeamAStreak;
  const second = summary.longestTeamBStreak;
  const longest = !second ? first : !first ? second : first.len > second.len || (first.len === second.len && first.end.date >= second.end.date) ? first : second;
  if (longest) highlights.push({ icon: '🎯', label: 'Longest Run', value: formatLeaderText(teamA, teamB, longest.result, longest.len), sub: `${longest.start.date} to ${longest.end.date}`, tone: 'run' });
  highlights.push({ icon: '⚡', label: 'Shootouts', value: String(summary.games.filter(game => game.scoreA >= 130 && game.scoreB >= 130).length), sub: 'Both teams 130+', tone: 'spark' });
  highlights.push({ icon: '💩', label: 'Stinkers', value: String(summary.games.filter(isStinkerMeeting).length), sub: 'Both teams below 70', tone: 'stinker' });
  return highlights;
}

export function buildLeadTrendPoints(view: Pick<RivalryViewModel, 'teamA' | 'teamB' | 'summary'>): RivalryLeadChartRow[] {
  let lead = 0;
  return view.summary.games.slice().sort(byDateAsc).flatMap((game, offset) => {
    const side = sidesForTeam(game, view.teamA);
    if (!side) return [];
    if (side.result === 'W') lead += 1;
    else if (side.result === 'L') lead -= 1;
    const spread = lead > 0 ? `${view.teamA} + ${lead}` : lead < 0 ? `${view.teamB} + ${Math.abs(lead)}` : 'Tied';
    return [{
      date: game.date,
      season: game.season,
      index: offset + 1,
      lead,
      result: side.result,
      winner: resultLabel(side.result, view.teamA, view.teamB),
      score: formatScoreline(side.pf, side.pa),
      type: normType(game.type),
      round: normRound(game.round),
      spread,
      teamA: view.teamA,
      teamB: view.teamB,
      title: `${game.date} | ${resultLabel(side.result, view.teamA, view.teamB)} ${formatScoreline(side.pf, side.pa)} | Series spread: ${spread}`,
    }];
  });
}

export function latestRivalrySeason(games: readonly RivalryGame[], summarySeasons: readonly number[], currentSeason: number | null): number | null {
  const values = [...games.map(game => game.season), ...summarySeasons, ...(currentSeason === null ? [] : [currentSeason])];
  return values.length ? Math.max(...values) : null;
}

export function buildRivalryViewModel(
  teamA: string,
  teamB: string,
  games: readonly RivalryGame[],
  options: { scope: RivalryScope; currentSeason: number | null },
): RivalryViewModel {
  const selectedGames = scopedGames(games, options.scope, options.currentSeason);
  const summary = summarizeRivalry(teamA, teamB, selectedGames);
  const base = {
    teamA,
    teamB,
    scope: options.scope,
    currentSeason: options.currentSeason,
    summary,
    tape: buildTape(summary, teamA, teamB),
    highlights: buildHighlights(summary, teamA, teamB),
    seasonRows: rivalrySeasonBreakdown(teamA, teamB, selectedGames),
    gameRows: rivalryGameRows(teamA, teamB, selectedGames),
  };
  return { ...base, leadPoints: buildLeadTrendPoints(base) };
}
