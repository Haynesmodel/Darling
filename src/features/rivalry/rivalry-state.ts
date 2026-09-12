import type { RivalryDefinition, SeasonSummaryRow } from '../../data/generated/asset-types';
import type { RivalryGame, RivalryPairOption, RivalryScope, RivalryState } from './rivalry-types';

export function normalizeRivalryScope(value: unknown): RivalryScope {
  return value === 'currentSeason' || value === 'historic' ? value : 'allTime';
}

export function rivalryKey(teamA: string, teamB: string): string {
  return [teamA, teamB].map(value => value.trim()).sort((a, b) => a.localeCompare(b)).join('|');
}

function isPairRivalry(rivalry: RivalryDefinition): rivalry is RivalryDefinition & { members: [string, string] } {
  return rivalry.type === 'pair' && rivalry.members.length === 2;
}

export function buildPairOptions(rivalries: readonly RivalryDefinition[]): RivalryPairOption[] {
  return rivalries
    .filter(isPairRivalry)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))
    .map(rivalry => ({
      value: rivalry.slug || rivalry.members.join('|'),
      label: rivalry.note ? `${rivalry.name} - ${rivalry.note}` : rivalry.name,
      members: [rivalry.members[0], rivalry.members[1]],
    }));
}

export function availableRivalryTeams(summaries: readonly SeasonSummaryRow[], games: readonly RivalryGame[]): string[] {
  return [...new Set([
    ...summaries.map(row => row.owner),
    ...games.flatMap(game => [game.teamA, game.teamB]),
  ])].sort((a, b) => a.localeCompare(b));
}

export function firstDifferentTeam(team: string, teams: readonly string[]): string {
  return teams.find(candidate => candidate !== team) || teams[0] || team;
}

export function choosePreferredOpponent(teamA: string, pairOptions: readonly RivalryPairOption[]): string | null {
  const match = pairOptions.find(option => option.members.includes(teamA));
  return match?.members.find(member => member !== teamA) || null;
}

export function resolveRivalryState(
  teams: readonly string[],
  pairOptions: readonly RivalryPairOption[],
  requested: Partial<RivalryState>,
): RivalryState {
  const teamA = requested.teamA && teams.includes(requested.teamA) ? requested.teamA : (teams[0] || requested.teamA || '');
  const preferred = choosePreferredOpponent(teamA, pairOptions) || firstDifferentTeam(teamA, teams);
  let teamB = requested.teamB && teams.includes(requested.teamB) && requested.teamB !== teamA
    ? requested.teamB
    : preferred;
  if (!teamB || teamB === teamA) teamB = firstDifferentTeam(teamA, teams);
  return { teamA, teamB, scope: normalizeRivalryScope(requested.scope) };
}
