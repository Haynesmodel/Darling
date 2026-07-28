import { buildUrlFromState } from '../../../js/state-helpers.js';
import { buildCurseTrackerModel } from '../../../js/curse-tracker.js';
import { dedupeGames, sidesForTeam } from '../../../js/core-helpers.js';
import { computeHeadToHeadPairs } from '../../../js/stats-helpers.js';
import { buildTeamCurrentSeasonSnapshot } from '../../../js/current-season-data.js';
import { resolveSeasonPresentation } from '../../data/season-presentation';
import type { LeagueDataSnapshot } from '../../app/app-types';
import type { H2HGame, CurrentSeasonGame, SeasonSummaryRow } from '../../data/generated/asset-types';
import type { OwnerHubModel } from './owner-hub-types';

interface OwnerHubModelOptions {
  owner: string;
  pathname: string;
  seasonAggregates?: unknown[];
}

type HubGame = H2HGame | CurrentSeasonGame;
type TeamSnapshotBuilder = (options: {
  owner: string;
  leagueGames: H2HGame[];
  seasonSummaries: SeasonSummaryRow[];
  currentSeason: LeagueDataSnapshot['currentSeason'];
}) => { standing?: { games: number; wins: number; losses: number; ties: number; rank: number } };

function url(pathname: string, state: Record<string, unknown>): string {
  return buildUrlFromState({ pathname, ...state });
}

function completed(game: HubGame): boolean {
  if ('status' in game) return game.status === 'final' && game.scoreA !== null && game.scoreB !== null;
  return Number.isFinite(game.scoreA) && Number.isFinite(game.scoreB);
}

function legacy(rows: SeasonSummaryRow[]) {
  if (!rows.length) return null;
  const sum = (field: keyof SeasonSummaryRow) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  const wins = sum('wins');
  const losses = sum('losses');
  const ties = sum('ties');
  const games = wins + losses + ties;
  const finishes = rows.map(row => Number(row.finish)).filter(Number.isFinite);
  return {
    record: `${wins}-${losses}-${ties}`,
    winPct: games ? (wins + (ties * 0.5)) / games : null,
    championships: rows.filter(row => row.champion).length,
    saundersTitles: rows.filter(row => row.saunders).length,
    playoffRecord: `${sum('playoff_wins')}-${sum('playoff_losses')}`,
    bestFinish: finishes.length ? Math.min(...finishes) : null,
    averageFinish: finishes.length ? finishes.reduce((a, b) => a + b, 0) / finishes.length : null,
  };
}

function direction(rows: SeasonSummaryRow[]) {
  const finishes = rows
    .slice()
    .sort((a, b) => b.season - a.season)
    .slice(0, 3)
    .map(row => ({ season: Number(row.season), finish: Number(row.finish) }))
    .filter(row => Number.isFinite(row.finish));
  if (finishes.length < 3) return { direction: 'insufficient history' as const, finishes };
  const chronological = finishes.slice().reverse();
  const changes = chronological.slice(1).map((row, index) => row.finish - chronological[index].finish);
  const improved = changes.every(change => change <= 0) && changes.some(change => change < 0);
  const declined = changes.every(change => change >= 0) && changes.some(change => change > 0);
  return { direction: improved ? 'improving' as const : declined ? 'declining' as const : 'mixed' as const, finishes };
}

function buildActions(pathname: string, owner: string, opponent: string | null) {
  return [
    { label: 'Moves', href: url(pathname, { tab: 'transactions', selectedTransactionView: 'owners', selectedTransactionOwner: owner }) },
    { label: 'History', href: url(pathname, { tab: 'history', selectedTeam: owner }) },
    { label: 'Current', href: url(pathname, { tab: 'current', selectedCurrentOwner: owner }) },
    { label: 'Trophy', href: url(pathname, { tab: 'trophy', selectedTrophyOwner: owner }) },
    { label: 'Dynasty', href: url(pathname, { tab: 'dynasty', selectedDynastyMode: 'calculator', selectedDynastyOwner: owner }) },
    { label: 'Draft', href: url(pathname, { tab: 'draft', selectedDraftMode: 'owner', selectedDraftOwner: owner }) },
    ...(opponent ? [{
      label: `Rivalry vs ${opponent}`,
      href: url(pathname, { tab: 'rivalry', selectedRivalryTeamA: owner, selectedRivalryTeamB: opponent }),
    }] : []),
  ];
}

export function buildOwnerHubModel(
  data: LeagueDataSnapshot,
  options: OwnerHubModelOptions,
): OwnerHubModel {
  const { owner, pathname } = options;
  const summaries = data.seasonSummaries.filter(row => row.owner === owner);
  const seasonState = resolveSeasonPresentation({
    currentSeason: data.currentSeason,
    seasonSummaries: data.seasonSummaries,
    leagueGames: data.leagueGames,
  });
  const currentTeam = data.currentSeason?.teams.find(team => team.owner === owner) || null;
  const availability: OwnerHubModel['availability'] = {};
  const currentGame = ['preseason', 'regular-season', 'postseason'].includes(seasonState.phase)
    ? data.currentSeason?.games
    .filter(game => game.teamA === owner || game.teamB === owner)
    .filter(game => seasonState.spotlightWeek === null || game.week === seasonState.spotlightWeek)
    .sort((a, b) => a.week - b.week || a.matchup_id - b.matchup_id)[0] || null
    : null;
  const currentSide = currentGame ? sidesForTeam(currentGame, owner) : null;
  const currentSnapshot = data.currentSeason ? (buildTeamCurrentSeasonSnapshot as TeamSnapshotBuilder)({
    owner,
    leagueGames: data.leagueGames,
    seasonSummaries: data.seasonSummaries,
    currentSeason: data.currentSeason,
  }) : null;
  const standing = currentSnapshot?.standing;
  const latestSummary = summaries.slice().sort((a, b) => b.season - a.season)[0] || null;
  let rightNow: OwnerHubModel['rightNow'] = null;
  if (currentGame) {
    const scoreState = currentSide && currentGame.status !== 'scheduled'
      ? `${currentSide.pf.toFixed(2)}–${currentSide.pa.toFixed(2)} · ${currentGame.status === 'live' ? 'Live' : 'Final'}`
      : currentGame.status === 'scheduled' ? 'Scheduled · score pending' : null;
    const standingState = standing?.games
      ? `${standing.wins}-${standing.losses}-${standing.ties} · seed ${standing.rank}`
      : null;
    const score = [scoreState, standingState].filter(Boolean).join(' · ') || null;
    rightNow = {
      heading: seasonState.phase === 'preseason' ? 'First matchup' : `Week ${currentGame.week}`,
      summary: `${owner} vs ${currentSide?.opp || (currentGame.teamA === owner ? currentGame.teamB : currentGame.teamA)}`,
      detail: score,
      href: url(pathname, {
        tab: 'current',
        selectedCurrentSeason: currentGame.season,
        selectedCurrentWeek: currentGame.week,
        selectedCurrentOwner: owner,
      }),
    };
  } else if (latestSummary) {
    rightNow = {
      heading: `${latestSummary.season} season`,
      summary: `Finished No. ${latestSummary.finish} with a ${latestSummary.wins}-${latestSummary.losses}-${latestSummary.ties} record.`,
      detail: latestSummary.champion ? 'Darling champion' : latestSummary.saunders ? 'Saunders winner' : null,
      href: url(pathname, { tab: 'history', selectedTeam: owner }),
    };
  } else {
    availability.rightNow = data.currentSeason ? 'owner-not-current' : 'no-current-season';
  }

  const formGames = dedupeGames([...data.leagueGames, ...(data.currentSeason?.games || [])]
    .filter(game => completed(game) && (game.teamA === owner || game.teamB === owner))
  )
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.season - a.season || b.week - a.week)
    .slice(0, 5)
    .map(game => {
      const side = sidesForTeam(game, owner)!;
      return {
        opponent: side.opp,
        result: side.result as 'W' | 'L' | 'T',
        score: `${side.pf.toFixed(2)}–${side.pa.toFixed(2)}`,
        type: game.type,
        when: game.date || `${game.season} week ${game.week}`,
      };
    });
  const lastResult = formGames[0]?.result;
  const streakLength = lastResult ? formGames.findIndex(game => game.result !== lastResult) : -1;
  const recentForm = formGames.length
    ? { games: formGames, streak: `${lastResult}${streakLength < 0 ? formGames.length : streakLength}` }
    : null;
  if (!recentForm) availability.recentForm = 'no-history';

  const draftRows = summaries
    .filter(row => row.draft_pick !== null && row.draft_pick !== undefined && Number.isFinite(Number(row.draft_pick)))
    .sort((a, b) => b.season - a.season);
  const draftPicks = draftRows.map(row => Number(row.draft_pick));
  const draftIdentity = draftRows.length ? {
    samples: draftRows.length,
    averagePick: draftPicks.reduce((a, b) => a + b, 0) / draftPicks.length,
    earliestPick: Math.min(...draftPicks),
    latestPick: Math.max(...draftPicks),
    mostRecent: { season: draftRows[0].season, pick: Number(draftRows[0].draft_pick) },
    href: url(pathname, { tab: 'draft', selectedDraftMode: 'owner', selectedDraftOwner: owner }),
  } : null;
  if (!draftIdentity) availability.draftIdentity = 'no-draft-history';

  const mostPlayedRow = computeHeadToHeadPairs(data.leagueGames, 0)
    .filter(row => row.team === owner)
    .sort((a, b) => b.g - a.g || a.opp.localeCompare(b.opp))[0] || null;
  const mostPlayed = mostPlayedRow ? {
    opponent: mostPlayedRow.opp,
    record: `${mostPlayedRow.w}-${mostPlayedRow.l}-${mostPlayedRow.t}`,
    games: mostPlayedRow.g,
    href: url(pathname, {
      tab: 'rivalry',
      selectedRivalryTeamA: owner,
      selectedRivalryTeamB: mostPlayedRow.opp,
    }),
  } : null;
  const configured = data.rivalries.filter(rivalry => rivalry.members.includes(owner)).map(rivalry => ({
    name: rivalry.name,
    opponents: rivalry.members.filter(member => member !== owner),
  }));
  const rivalries = configured.length || mostPlayed ? { configured, mostPlayed } : null;
  if (!rivalries) availability.rivalries = 'no-rivalry';

  const ownerCurseCards = buildCurseTrackerModel(data.leagueGames, data.seasonSummaries, {
    seasonAggregates: options.seasonAggregates,
  }).cards.filter((card: { owner?: string }) => card.owner === owner);
  const topCurse = ownerCurseCards.sort((a: { severity?: number; status?: string; lastOccurrence?: { date?: string }; id: string }, b: { severity?: number; status?: string; lastOccurrence?: { date?: string }; id: string }) => (
    Number(b.severity || 0) - Number(a.severity || 0)
    || 'ActiveColdBroken'.indexOf(a.status || '') - 'ActiveColdBroken'.indexOf(b.status || '')
    || String(b.lastOccurrence?.date || '').localeCompare(String(a.lastOccurrence?.date || ''))
    || a.id.localeCompare(b.id)
  ))[0] as { title: string; status: string; severity: number | null } | undefined;
  const curses = ownerCurseCards.length ? {
    counts: {
      active: ownerCurseCards.filter((card: { status?: string }) => card.status === 'Active').length,
      cold: ownerCurseCards.filter((card: { status?: string }) => card.status === 'Cold').length,
      broken: ownerCurseCards.filter((card: { status?: string }) => card.status === 'Broken').length,
    },
    top: topCurse ? { title: topCurse.title, status: topCurse.status, severity: topCurse.severity } : null,
    href: url(pathname, { tab: 'history', selectedTeam: owner, selectedFocus: 'curses' }),
  } : null;
  if (!curses) availability.curses = 'no-curse';

  const legacyModel = legacy(summaries);
  if (!legacyModel) availability.legacy = 'no-history';
  const opponent = mostPlayed?.opponent || configured[0]?.opponents[0] || null;
  return {
    identity: {
      owner,
      displayName: currentTeam?.display_name && currentTeam.display_name !== owner ? currentTeam.display_name : null,
      teamName: currentTeam?.sleeper_team_name
        && ![owner, currentTeam.display_name].includes(currentTeam.sleeper_team_name)
        ? currentTeam.sleeper_team_name : null,
      completedSeasons: new Set(summaries.map(row => row.season)).size,
      phase: seasonState.phase,
    },
    rightNow,
    legacy: legacyModel,
    recentForm,
    dynastyDirection: direction(summaries),
    draftIdentity,
    rivalries,
    curses,
    actions: buildActions(pathname, owner, opponent),
    availability,
  };
}
