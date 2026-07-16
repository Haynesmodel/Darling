import { buildIntentDocument } from './search-actions';
import { normalizeSearchText } from './search-normalize';
import type { SearchDocument, SearchHydrationData } from './search-types';

export interface BuiltSearchIndex {
  documents: SearchDocument[];
  owners: string[];
  seasons: number[];
  ownerAliases: Map<string, string[]>;
}

export function buildSearchIndex(data: SearchHydrationData): BuiltSearchIndex {
  const owners = [...new Set([
    ...data.seasonSummaries.map(row => row.owner),
    ...data.leagueGames.flatMap(game => [game.teamA, game.teamB]),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const seasons = [...new Set(data.seasonSummaries.map(row => Number(row.season)))].sort((a, b) => b - a);
  const ownerAliases = new Map<string, string[]>();
  owners.forEach(owner => {
    const sleeperTeam = data.currentSeason?.teams?.find(team => team.owner === owner);
    ownerAliases.set(owner, [
      owner,
      sleeperTeam?.display_name,
      sleeperTeam?.sleeper_team_name,
    ].filter(Boolean).map(value => normalizeSearchText(value)));
  });

  const documents: SearchDocument[] = [];
  const add = (document: SearchDocument | null) => { if (document) documents.push(document); };
  ['history', 'current', 'playoff-picture', 'trophy', 'dynasty', 'draft', 'gauntlet'].forEach(feature => {
    add(buildIntentDocument({ kind: 'feature', feature: feature as never }, data));
  });
  ['theme-system', 'theme-light', 'theme-dark', 'export-history'].forEach(command => {
    add(buildIntentDocument({ kind: 'command', command: command as never }, data));
  });
  add(buildIntentDocument({ kind: 'score-threshold', min: 150 }, data));
  ['largest-loss-margin', 'largest-win-margin', 'highest-score', 'lowest-score'].forEach(metric => {
    add(buildIntentDocument({ kind: 'game-extreme', metric: metric as never }, data));
  });
  owners.forEach(owner => {
    add(buildIntentDocument({ kind: 'owner-season', owner }, data));
    add(buildIntentDocument({ kind: 'feature', feature: 'trophy', owner }, data));
    add(buildIntentDocument({ kind: 'feature', feature: 'dynasty', owner }, data));
    add(buildIntentDocument({ kind: 'draft-owner', owner }, data));
  });
  Array.from({ length: 12 }, (_, index) => index + 1)
    .forEach(pick => add(buildIntentDocument({ kind: 'draft-pick', pick }, data)));
  (['early', 'middle', 'late'] as const)
    .forEach(zone => add(buildIntentDocument({ kind: 'draft-zone', zone }, data)));
  data.seasonSummaries.forEach(row => add(buildIntentDocument({ kind: 'owner-season', owner: row.owner, season: Number(row.season) }, data)));
  seasons.forEach(season => {
    add(buildIntentDocument({ kind: 'season-type', season, gameType: 'Playoff' }, data));
    add(buildIntentDocument({ kind: 'season-type', season, gameType: 'Saunders' }, data));
  });
  for (let a = 0; a < owners.length; a += 1) {
    for (let b = a + 1; b < owners.length; b += 1) {
      add(buildIntentDocument({ kind: 'rivalry', ownerA: owners[a], ownerB: owners[b] }, data));
    }
  }
  return { documents, owners, seasons, ownerAliases };
}
