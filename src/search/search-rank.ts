import { normalizeSearchText, orderedSubsequence, tokenizeSearchText } from './search-normalize';
import type { SearchDocument, SearchResult } from './search-types';

export function rankSearchDocuments(query: string, documents: SearchDocument[]): SearchResult[] {
  const normalized = normalizeSearchText(query);
  const terms = tokenizeSearchText(query);
  if (!normalized) return [];
  return documents.map(document => {
    const title = normalizeSearchText(document.title);
    const haystack = normalizeSearchText([document.title, document.subtitle, ...document.keywords].join(' '));
    const matchedTerms = terms.filter(term => haystack.includes(term));
    let score = 0;
    if (title === normalized || document.keywords.some(keyword => normalizeSearchText(keyword) === normalized)) score = 800;
    else if (terms.length && matchedTerms.length === terms.length) score = 650;
    else if (terms.some(term => title.startsWith(term))) score = 500;
    else if (orderedSubsequence(normalized.replace(/\s/g, ''), haystack.replace(/\s/g, ''))) score = 300;
    return { ...document, score: score + document.priority, matchedTerms };
  }).filter(result => result.score >= 300).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
