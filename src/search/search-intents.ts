import { normalizeSearchText } from './search-normalize';
import type { SearchCommand, SearchIntent } from './search-types';

export interface SearchIntentContext {
  owners: string[];
  ownerAliases: Map<string, string[]>;
  seasons: number[];
}

function phraseIndex(query: string, phrase: string): number {
  return (` ${query} `).indexOf(` ${phrase} `);
}

interface OwnerQueryMatch {
  owner: string;
  alias: string;
  index: number;
}

function ownersInQuery(query: string, context: SearchIntentContext): OwnerQueryMatch[] {
  return context.owners.flatMap(owner => {
    const aliases = context.ownerAliases.get(owner) || [owner];
    const matches = aliases
      .map(alias => normalizeSearchText(alias))
      .map(alias => ({ alias, index: phraseIndex(query, alias) }))
      .filter(match => match.index >= 0)
      .sort((a, b) => a.index - b.index || b.alias.length - a.alias.length);
    return matches.length ? [{ owner, ...matches[0] }] : [];
  });
}

function rivalryOwnersInQuery(query: string, matches: OwnerQueryMatch[]): [string, string] | null {
  if (matches.length !== 2 || matches[0].owner === matches[1].owner) return null;
  const ordered = matches.slice().sort((a, b) => a.index - b.index);
  const [first, second] = ordered;
  const before = query.slice(0, first.index).trim();
  const between = query.slice(first.index + first.alias.length, second.index).trim();
  const after = query.slice(second.index + second.alias.length).trim();
  const infixSeparator = /^(?:vs|v|versus|against|head to head|h2h)$/;
  const suffixSeparator = /^(?:head to head|h2h)$/;
  const isInfix = before === '' && after === '' && infixSeparator.test(between);
  const isSuffix = before === '' && between === '' && suffixSeparator.test(after);
  return isInfix || isSuffix ? [first.owner, second.owner] : null;
}

function removePhrase(query: string, phrase: string): string {
  return (` ${query} `)
    .replace(` ${phrase} `, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeYear(query: string, year?: number): string {
  return year ? removePhrase(query, `${year}`) : query;
}

function removeGameType(query: string, gameType?: string): string {
  const patterns: Record<string, RegExp> = {
    Playoff: /\b(?:playoff|playoffs|postseason)\b/,
    Saunders: /\bsaunders(?: bowl)?\b/,
    Championship: /\bchampionship\b/,
    Regular: /\bregular(?: season)?\b/,
  };
  const pattern = gameType ? patterns[gameType] : null;
  return pattern ? query.replace(pattern, ' ').replace(/\s+/g, ' ').trim() : query;
}

function scoreThresholdInQuery(query: string): { min?: number; max?: number } | null {
  const number = '(\\d+(?:\\.\\d+)?)';
  const minPatterns = [
    new RegExp(`^(?:games?|scores?)\\s+(?:over|above|at least)\\s+${number}(?:\\s+(?:points?|scores?))?$`),
    new RegExp(`^${number}\\s*(?:\\+|plus|point games?|points? games?|scores?)$`),
  ];
  const maxPatterns = [
    new RegExp(`^(?:games?|scores?)\\s+(?:under|below|at most)\\s+${number}(?:\\s+(?:points?|scores?))?$`),
    new RegExp(`^${number}\\s+(?:points?\\s+)?(?:or less|or fewer)$`),
  ];
  for (const pattern of minPatterns) {
    const match = query.match(pattern);
    if (match) return { min: Number(match[1]) };
  }
  for (const pattern of maxPatterns) {
    const match = query.match(pattern);
    if (match) return { max: Number(match[1]) };
  }
  return null;
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
  const ownerMatches = ownersInQuery(query, context);
  const owners = ownerMatches.map(match => match.owner);
  const year = yearInQuery(query, context.seasons);
  const gameType = gameTypeInQuery(query);
  const command = commandInQuery(query);
  if (command) return [{ kind: 'command', command }];

  const rivalryOwners = rivalryOwnersInQuery(query, ownerMatches);
  if (rivalryOwners) return [{ kind: 'rivalry', ownerA: rivalryOwners[0], ownerB: rivalryOwners[1] }];

  const owner = owners.length === 1 ? owners[0] : undefined;
  const scopedQuery = owners.length <= 1
    ? ownerMatches.reduce((value, match) => removePhrase(value, match.alias), query)
    : null;
  if (scopedQuery && /^(?:trophy|trophies|hardware|trophy case)$/.test(scopedQuery)) return [{ kind: 'feature', feature: 'trophy', owner }];
  if (scopedQuery && /^dynasty(?: rankings?)?$/.test(scopedQuery)) return [{ kind: 'feature', feature: 'dynasty', owner }];
  if (!owners.length && /^(?:historical matchup|gauntlet)$/.test(query)) return [{ kind: 'feature', feature: 'gauntlet' }];
  if (!owners.length && query === 'playoff picture') return [{ kind: 'feature', feature: 'playoff-picture' }];
  if (!owners.length && query === 'current season') return [{ kind: 'feature', feature: 'current' }];
  if (query === 'league history' || query === 'history') return [{ kind: 'feature', feature: 'history' }];

  const recordQuery = scopedQuery === null ? null : removeYear(scopedQuery, year);
  let metric: 'largest-loss-margin' | 'largest-win-margin' | 'highest-score' | 'lowest-score' | undefined;
  if (recordQuery && /^(?:biggest|largest|worst) loss$/.test(recordQuery)) metric = 'largest-loss-margin';
  else if (recordQuery && /^(?:biggest|largest) win$/.test(recordQuery)) metric = 'largest-win-margin';
  else if (recordQuery && /^(?:highest|top|most) (?:score|scoring)$/.test(recordQuery)) metric = 'highest-score';
  else if (recordQuery && /^(?:lowest|bottom|least) (?:score|scoring)$/.test(recordQuery)) metric = 'lowest-score';
  if (metric) return [{ kind: 'game-extreme', metric, owner, season: year }];

  const gameQuery = scopedQuery === null ? null : removeYear(scopedQuery, year);
  const threshold = gameQuery ? scoreThresholdInQuery(gameQuery) : null;
  if (threshold) {
    return [{ kind: 'score-threshold', owner, season: year, ...threshold }];
  }

  const ownerQuery = scopedQuery === null ? null : removeGameType(removeYear(scopedQuery, year), gameType);
  const ownerResultQuery = scopedQuery === null ? null : removeYear(scopedQuery, year);
  if (owner && ownerResultQuery && /^loss(?:es)?$/.test(ownerResultQuery)) return [{ kind: 'game-filter', owner, season: year, result: 'L' }];
  if (owner && ownerResultQuery && /^wins?$/.test(ownerResultQuery)) return [{ kind: 'game-filter', owner, season: year, result: 'W' }];
  if (owner && ownerQuery === '' && (year || gameType || scopedQuery === '')) {
    return [{ kind: 'owner-season', owner, season: year, gameType }];
  }
  if (!owner && owners.length === 0 && year && gameType && ownerQuery === '') return [{ kind: 'season-type', season: year, gameType }];
  return [];
}
