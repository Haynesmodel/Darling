import { buildUrlFromState } from '../../js/state-helpers.js';
import { buildHistoryGameRows } from '../../js/history-game-query.js';
import type { SearchDocument, SearchHydrationData, SearchIntent } from './search-types';

const ALL_TEAMS = '__ALL__';

function searchUniverse(data: SearchHydrationData) {
  return {
    seasons: [...new Set(data.leagueGames.map(game => Number(game.season)))].sort((a, b) => a - b),
    weeks: [],
    opponents: [],
    types: [...new Set(data.leagueGames.map(game => String(game.type || 'Regular')))],
    rounds: [...new Set(data.leagueGames.map(game => String(game.round || '')).filter(Boolean))],
  };
}

function historyUrl(data: SearchHydrationData, opts: Record<string, unknown> = {}): string {
  return buildUrlFromState({
    tab: 'history',
    selectedTeam: ALL_TEAMS,
    selectedSeasons: new Set(),
    selectedWeeks: new Set(),
    selectedOpponents: new Set(),
    selectedTypes: new Set(),
    selectedRounds: new Set(),
    universe: searchUniverse(data),
    allTeams: ALL_TEAMS,
    pathname: window.location.pathname,
    ...opts,
  });
}

function typeSelections(gameType?: string) {
  if (!gameType) return {};
  if (gameType === 'Championship') return { selectedRounds: new Set(['Championship']) };
  return { selectedTypes: new Set([gameType]) };
}

function recordDetails(intent: Extract<SearchIntent, { kind: 'game-extreme' }>, data: SearchHydrationData) {
  const games = intent.season ? data.leagueGames.filter(game => Number(game.season) === intent.season) : data.leagueGames;
  let rows = buildHistoryGameRows(games, { selectedTeam: intent.owner || ALL_TEAMS, allTeams: ALL_TEAMS });
  const config = {
    'largest-loss-margin': { result: 'L', sort: (a, b) => a.margin - b.margin, gameSort: 'marginAsc', title: 'Biggest loss' },
    'largest-win-margin': { result: 'W', sort: (a, b) => b.margin - a.margin, gameSort: 'marginDesc', title: 'Biggest win' },
    'highest-score': { result: null, sort: (a, b) => b.score - a.score, gameSort: 'scoreDesc', title: 'Highest score' },
    'lowest-score': { result: null, sort: (a, b) => a.score - b.score, gameSort: 'scoreAsc', title: 'Lowest score' },
  }[intent.metric];
  if (config.result) rows = rows.filter(row => row.result === config.result);
  rows.sort(config.sort);
  return { row: rows[0], ...config };
}

function gameSubtitle(count: number, owner?: string, season?: number): string {
  const scope = [owner || 'All teams', season].filter(Boolean).join(' / ');
  return `League History / ${scope} / ${count} matching ${count === 1 ? 'score' : 'scores'}`;
}

export function buildIntentDocument(intent: SearchIntent, data: SearchHydrationData): SearchDocument | null {
  if (intent.kind === 'owner-season') {
    const url = historyUrl(data, {
      selectedTeam: intent.owner,
      selectedSeasons: intent.season ? new Set([intent.season]) : new Set(),
      ...typeSelections(intent.gameType),
    });
    const labelParts = [intent.owner, intent.season ? `${intent.season} season` : 'League History'];
    return {
      id: `owner-season:${intent.owner}:${intent.season || 'all'}:${intent.gameType || 'all'}`,
      category: intent.season ? 'season' : 'owner',
      title: labelParts.join(' - '),
      subtitle: ['League History', intent.owner, intent.season, intent.gameType].filter(Boolean).join(' / '),
      keywords: [intent.owner, `${intent.season || ''}`, intent.gameType || ''],
      priority: 80,
      action: { kind: 'navigate', url },
    };
  }
  if (intent.kind === 'rivalry') {
    const url = buildUrlFromState({
      tab: 'rivalry',
      selectedRivalryTeamA: intent.ownerA,
      selectedRivalryTeamB: intent.ownerB,
      pathname: window.location.pathname,
    });
    return {
      id: `rivalry:${intent.ownerA}:${intent.ownerB}`,
      category: 'rivalry',
      title: `${intent.ownerA} vs ${intent.ownerB}`,
      subtitle: 'Head to Head / All-time series',
      keywords: [intent.ownerA, intent.ownerB, 'versus', 'head to head', 'h2h'],
      priority: 90,
      action: { kind: 'navigate', url },
    };
  }
  if (intent.kind === 'season-type') {
    return {
      id: `season-type:${intent.season}:${intent.gameType}`,
      category: 'season',
      title: `${intent.season} ${intent.gameType === 'Playoff' ? 'playoff games' : `${intent.gameType} games`}`,
      subtitle: `League History / ${intent.season} / ${intent.gameType} / Games`,
      keywords: [`${intent.season}`, intent.gameType, 'games'],
      priority: 85,
      action: {
        kind: 'navigate',
        url: historyUrl(data, {
          selectedSeasons: new Set([intent.season]),
          ...typeSelections(intent.gameType),
          selectedFocus: 'games',
        }),
        focus: 'games',
      },
    };
  }
  if (intent.kind === 'score-threshold') {
    const scopedGames = intent.season ? data.leagueGames.filter(game => Number(game.season) === intent.season) : data.leagueGames;
    const rows = buildHistoryGameRows(scopedGames, { selectedTeam: intent.owner || ALL_TEAMS, allTeams: ALL_TEAMS });
    const matches = rows.filter(row => (intent.min === undefined || row.score >= intent.min) && (intent.max === undefined || row.score <= intent.max));
    const label = intent.min !== undefined ? `${intent.min}+ point games` : `${intent.max} or fewer point games`;
    return {
      id: `score:${intent.owner || 'all'}:${intent.season || 'all'}:${intent.min ?? ''}:${intent.max ?? ''}`,
      category: 'game-query',
      title: label,
      subtitle: gameSubtitle(matches.length, intent.owner, intent.season),
      keywords: [label, intent.owner || '', `${intent.season || ''}`, 'scores'],
      priority: 95,
      action: {
        kind: 'navigate',
        url: historyUrl(data, {
          selectedTeam: intent.owner || ALL_TEAMS,
          selectedSeasons: intent.season ? new Set([intent.season]) : new Set(),
          selectedGameMinScore: intent.min,
          selectedGameMaxScore: intent.max,
          selectedGameSort: intent.min !== undefined ? 'scoreDesc' : 'scoreAsc',
          selectedFocus: 'games',
        }),
        focus: 'games',
      },
    };
  }
  if (intent.kind === 'game-filter') {
    return {
      id: `games:${intent.owner || 'all'}:${intent.season || 'all'}:${intent.result}`,
      category: 'game-query',
      title: `${intent.owner ? `${intent.owner} ` : ''}${intent.result === 'W' ? 'wins' : intent.result === 'L' ? 'losses' : 'ties'}`,
      subtitle: ['League History', intent.owner || 'All teams', intent.season, 'Games'].filter(Boolean).join(' / '),
      keywords: [intent.owner || '', `${intent.season || ''}`, intent.result],
      priority: 90,
      action: {
        kind: 'navigate',
        url: historyUrl(data, {
          selectedTeam: intent.owner || ALL_TEAMS,
          selectedSeasons: intent.season ? new Set([intent.season]) : new Set(),
          selectedGameResult: intent.result,
          selectedFocus: 'games',
        }),
        focus: 'games',
      },
    };
  }
  if (intent.kind === 'game-extreme') {
    const details = recordDetails(intent, data);
    if (!details.row) return null;
    return {
      id: `record:${intent.metric}:${intent.owner || 'all'}:${intent.season || 'all'}`,
      category: 'record',
      title: `${intent.owner ? `${intent.owner} ` : ''}${details.title}${intent.season ? ` - ${intent.season}` : ''}`,
      subtitle: `${details.row.team} ${details.row.score.toFixed(2)} - ${details.row.opponentScore.toFixed(2)} ${details.row.opponent} / ${details.row.date}`,
      keywords: [details.title, intent.owner || '', `${intent.season || ''}`],
      priority: 100,
      action: {
        kind: 'navigate',
        url: historyUrl(data, {
          selectedTeam: intent.owner || ALL_TEAMS,
          selectedSeasons: intent.season ? new Set([intent.season]) : new Set(),
          selectedGameResult: details.result,
          selectedGameSort: details.gameSort,
          selectedGameLimit: 1,
          selectedFocus: 'games',
        }),
        focus: 'games',
      },
    };
  }
  if (intent.kind === 'feature') {
    const definitions = {
      history: ['League History', 'Browse every season and matchup', 'history'],
      current: ['Current Season', 'Open the current-season command center', 'current'],
      'playoff-picture': ['Playoff picture', 'Current Season / Playoff picture', 'current'],
      trophy: [`${intent.owner ? `${intent.owner} ` : ''}Trophy Case`, 'Championships, finishes, and league hardware', 'trophy'],
      dynasty: [`${intent.owner ? `${intent.owner} ` : ''}Dynasty Rankings`, 'Compare long-term league performance', 'dynasty'],
      gauntlet: ['Historical Matchup', 'Simulate two owner-seasons', 'gauntlet'],
    } as const;
    const [title, subtitle, tab] = definitions[intent.feature];
    const url = buildUrlFromState({
      tab,
      selectedTrophyOwner: intent.feature === 'trophy' ? intent.owner : null,
      selectedDynastyOwner: intent.feature === 'dynasty' ? intent.owner : null,
      selectedFocus: intent.feature === 'playoff-picture' ? 'playoff-picture' : null,
      pathname: window.location.pathname,
    });
    return {
      id: `feature:${intent.feature}:${intent.owner || 'all'}`,
      category: 'navigate',
      title,
      subtitle,
      keywords: [title, subtitle, intent.owner || ''],
      priority: 70,
      action: { kind: 'navigate', url, focus: intent.feature === 'playoff-picture' ? 'playoff-picture' : undefined },
    };
  }
  if (intent.kind === 'command') {
    const labels = {
      'theme-dark': ['Dark mode', 'Use the dark color scheme'],
      'theme-light': ['Light mode', 'Use the light color scheme'],
      'theme-system': ['System theme', 'Follow the device color scheme'],
      'export-history': ['Export history', 'Download the current History view as CSV'],
    };
    const [title, subtitle] = labels[intent.command];
    return {
      id: `command:${intent.command}`,
      category: 'command',
      title,
      subtitle,
      keywords: [title, subtitle],
      priority: 60,
      action: { kind: 'command', command: intent.command },
    };
  }
  return null;
}
