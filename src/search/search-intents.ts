import { normalizeSearchText } from './search-normalize';
import type { SearchCommand, SearchIntent } from './search-types';

export interface SearchIntentContext {
  owners: string[];
  ownerAliases: Map<string, string[]>;
  seasons: number[];
}

function includesPhrase(query: string, phrase: string): boolean {
  return (` ${query} `).includes(` ${phrase} `);
}

function ownersInQuery(query: string, context: SearchIntentContext): string[] {
  return context.owners.filter(owner => {
    const aliases = context.ownerAliases.get(owner) || [owner];
    return aliases.some(alias => includesPhrase(query, normalizeSearchText(alias)));
  });
}

function yearInQuery(query: string, seasons: number[]): number | undefined {
  const match = query.match(/\b(20\d{2}|19\d{2})\b/);
  if (!match) return undefined;
  const year = Number(match[1]);
  return seasons.includes(year) ? year : undefined;
}

function gameTypeInQuery(query: string): string | undefined {
  if (/\b(playoff|playoffs|postseason)\b/.test(query)) return 'Playoff';
  if (/\bsaunders(?: bowl)?\b/.test(query)) return 'Saunders';
  if (/\bchampionship\b/.test(query)) return 'Championship';
  if (/\bregular(?: season)?\b/.test(query)) return 'Regular';
  return undefined;
}

function commandInQuery(query: string): SearchCommand | undefined {
  if (query === 'dark mode' || query === 'dark theme') return 'theme-dark';
  if (query === 'light mode' || query === 'light theme') return 'theme-light';
  if (query === 'system theme' || query === 'auto theme') return 'theme-system';
  if (query === 'export history' || query === 'export csv') return 'export-history';
  return undefined;
}

export function parseSearchIntents(rawQuery: string, context: SearchIntentContext): SearchIntent[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];
  const owners = ownersInQuery(query, context);
  const year = yearInQuery(query, context.seasons);
  const gameType = gameTypeInQuery(query);
  const command = commandInQuery(query);
  if (command) return [{ kind: 'command', command }];

  const versus = /\b(vs|v|versus|against|head to head|h2h)\b/.test(query);
  if (versus && owners.length === 2 && owners[0] !== owners[1]) {
    const marker = query.match(/\b(?:vs|v|versus|against|head to head|h2h)\b/);
    const markerIndex = marker?.index ?? -1;
    const ordered = owners.slice().sort((a, b) => {
      const aIndex = query.indexOf(normalizeSearchText(a));
      const bIndex = query.indexOf(normalizeSearchText(b));
      return aIndex - bIndex;
    });
    if (markerIndex >= 0) return [{ kind: 'rivalry', ownerA: ordered[0], ownerB: ordered[1] }];
  }

  const owner = owners.length === 1 ? owners[0] : undefined;
  if (/\b(trophy|trophies|hardware|trophy case)\b/.test(query)) return [{ kind: 'feature', feature: 'trophy', owner }];
  if (/\bdynasty(?: rankings?)?\b/.test(query)) return [{ kind: 'feature', feature: 'dynasty', owner }];
  if (/\b(historical matchup|gauntlet)\b/.test(query)) return [{ kind: 'feature', feature: 'gauntlet' }];
  if (/\bplayoff picture\b/.test(query)) return [{ kind: 'feature', feature: 'playoff-picture' }];
  if (/\bcurrent season\b/.test(query)) return [{ kind: 'feature', feature: 'current' }];
  if (query === 'league history' || query === 'history') return [{ kind: 'feature', feature: 'history' }];

  let metric: 'largest-loss-margin' | 'largest-win-margin' | 'highest-score' | 'lowest-score' | undefined;
  if (/\b(biggest|largest|worst) loss\b/.test(query)) metric = 'largest-loss-margin';
  else if (/\b(biggest|largest) win\b/.test(query)) metric = 'largest-win-margin';
  else if (/\b(highest|top|most) (?:score|scoring)\b/.test(query)) metric = 'highest-score';
  else if (/\b(lowest|bottom|least) (?:score|scoring)\b/.test(query)) metric = 'lowest-score';
  if (metric) return [{ kind: 'game-extreme', metric, owner, season: year }];

  const thresholdNumber = [...query.matchAll(/\b(\d+(?:\.\d+)?)\b/g)]
    .map(match => Number(match[1]))
    .find(value => value < 1900 || value > 2100);
  if (thresholdNumber !== undefined && /\b(point|points|score|scores|game|games|over|above|under|below|least|most|less|plus)\b/.test(query)) {
    const isMax = /\b(under|below|at most|or less)\b/.test(query);
    const isMin = /\b(over|above|at least|plus|point games?|scores?)\b/.test(query);
    if (isMax || isMin) {
      return [{ kind: 'score-threshold', owner, season: year, ...(isMax ? { max: thresholdNumber } : { min: thresholdNumber }) }];
    }
  }

  if (owner && /\bloss(?:es)?\b/.test(query)) return [{ kind: 'game-filter', owner, season: year, result: 'L' }];
  if (owner && /\bwins?\b/.test(query)) return [{ kind: 'game-filter', owner, season: year, result: 'W' }];
  if (owner && (year || gameType || query === normalizeSearchText(owner))) {
    return [{ kind: 'owner-season', owner, season: year, gameType }];
  }
  if (year && gameType) return [{ kind: 'season-type', season: year, gameType }];
  return [];
}
