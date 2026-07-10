import { buildIntentDocument, rebuildSearchDocument } from './search-actions';
import { buildSearchIndex, type BuiltSearchIndex } from './search-index';
import { parseSearchIntents } from './search-intents';
import { executeSearchAction } from './search-navigation';
import { rankSearchDocuments } from './search-rank';
import type { DarlingSearchRuntime, SearchDocument, SearchHydrationData, SearchResult, SearchRuntimeSnapshot } from './search-types';

const RECENT_KEY = 'darling.search.recent';
const MAX_RECENT = 8;

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function createSearchRuntime(): DarlingSearchRuntime {
  let data: SearchHydrationData | null = null;
  let index: BuiltSearchIndex = { documents: [], owners: [], seasons: [], ownerAliases: new Map() };
  let recentIds = readRecent();
  const listeners = new Set<(snapshot: SearchRuntimeSnapshot) => void>();
  const snapshot = () => ({ hydrated: !!data, documents: index.documents, recentCount: recentIds.length });
  const publish = () => listeners.forEach(listener => listener(snapshot()));

  function recentDocuments(): SearchDocument[] {
    const byId = new Map(index.documents.map(document => [document.id, document]));
    const documents = recentIds
      .map(id => byId.get(id) || (data ? rebuildSearchDocument(id, data) : null))
      .filter(Boolean) as SearchDocument[];
    recentIds = documents.map(document => document.id);
    return documents;
  }

  return {
    getSnapshot: snapshot,
    hydrate(nextData) {
      data = nextData;
      index = buildSearchIndex(nextData);
      recentDocuments();
      publish();
    },
    search(query) {
      if (!data) return [];
      if (!query.trim()) {
        const recent = recentDocuments();
        const defaults = ['feature:current:all', 'feature:history:all', 'feature:trophy:all']
          .map(id => index.documents.find(document => document.id === id))
          .filter(Boolean) as SearchDocument[];
        return [...recent, ...defaults.filter(document => !recent.some(item => item.id === document.id))]
          .slice(0, 10)
          .map((document, position) => ({ ...document, score: 100 - position, matchedTerms: [] }));
      }
      const structured = parseSearchIntents(query, index)
        .map(intent => buildIntentDocument(intent, data as SearchHydrationData))
        .filter(Boolean)
        .map((document, position) => ({ ...(document as SearchDocument), score: 1100 - position, matchedTerms: [], interpretation: (document as SearchDocument).subtitle }));
      const ranked = rankSearchDocuments(query, index.documents);
      const seen = new Set<string>();
      return [...structured, ...ranked].filter(result => {
        if (seen.has(result.id)) return false;
        seen.add(result.id);
        return true;
      }).slice(0, 10) as SearchResult[];
    },
    execute(result) {
      recentIds = [result.id, ...recentIds.filter(id => id !== result.id)].slice(0, MAX_RECENT);
      try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds)); } catch { /* Storage is optional. */ }
      publish();
      executeSearchAction(result.action);
    },
    clearRecent() {
      recentIds = [];
      try { window.localStorage.removeItem(RECENT_KEY); } catch { /* Storage is optional. */ }
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
  };
}
