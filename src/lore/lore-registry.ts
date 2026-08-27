import type { LeagueLore, Entry, Collection, Effect, Trigger } from './lore-types';
import type { LoreSearchDocument, LoreScope, LoreService } from './lore-types';

const MAX_TIMER = 2500;
const TRIPLE_WINDOW = 4000;

function pairEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(owner => b.includes(owner));
}

function createScope(id: string, scopes: Set<LoreScope>): LoreScope {
  const timers = new Set<number>();
  const nodes = new Set<Node>();
  const scope: LoreScope = {
    id,
    clear() {
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
      nodes.forEach(node => node.parentNode?.removeChild(node));
      nodes.clear();
      scopes.delete(scope);
    },
    timer(callback, duration) {
      const timer = window.setTimeout(() => { timers.delete(timer); callback(); }, Math.min(Math.max(0, duration), MAX_TIMER));
      timers.add(timer);
      return timer;
    },
    add(node) { nodes.add(node); },
  };
  scopes.add(scope);
  return scope;
}

export function createLoreRegistry(win: Window = window): LoreService {
  let asset: LeagueLore | null = null;
  let reducedMotion = false;
  const scopes = new Set<LoreScope>();
  const once = new Set<string>();
  const activations = new Map<string, { at: number; count: number; value: string }>();
  let presentation: typeof import('./lore-presentation') | null = null;
  let presentationPromise: Promise<typeof import('./lore-presentation')> | null = null;
  const now = () => (typeof win.performance?.now === 'function' ? win.performance.now() : Date.now());
  const entries = () => new Map((asset?.entries || []).filter(entry => entry.enabled).map(entry => [entry.id, entry]));
  const collections = () => new Map((asset?.collections || []).filter(collection => collection.enabled).map(collection => [collection.id, collection]));
  const effects = () => new Map((asset?.effects || []).filter(effect => effect.enabled).map(effect => [effect.id, effect]));
  const loadPresentation = async () => {
    if (presentation) return presentation;
    presentationPromise ||= import('./lore-presentation');
    presentation = await presentationPromise;
    return presentation;
  };
  const service: LoreService = {
    hydrate(next) { asset = next; once.clear(); activations.clear(); },
    entry(id) { return entries().get(id) || null; },
    collection(id) { return collections().get(id) || null; },
    effect(id) { return effects().get(id) || null; },
    searchDocuments(): LoreSearchDocument[] {
      if (!asset?.enabled) return [];
      const docs: LoreSearchDocument[] = [];
      entries().forEach(entry => docs.push({ id: `lore:entry:${entry.id}`, category: 'lore', title: entry.title, subtitle: entry.teaser, keywords: [...entry.search_terms, ...entry.owners], priority: 125, action: { kind: 'lore', targetType: 'entry', targetId: entry.id } }));
      collections().forEach(collection => docs.push({ id: `lore:collection:${collection.id}`, category: 'lore', title: collection.title, subtitle: collection.summary, keywords: collection.search_terms, priority: 130, action: { kind: 'lore', targetType: 'collection', targetId: collection.id } }));
      return docs;
    },
    trigger(id, context = {}) {
      if (!asset?.enabled) return false;
      const trigger = asset.triggers.find(item => item.id === id && item.enabled);
      if (!trigger) return false;
      const entry = trigger.entry_id ? entries().get(trigger.entry_id) : null;
      const collection = trigger.collection_id ? collections().get(trigger.collection_id) : null;
      if (!entry && !collection) return false;
      if (trigger.match?.owner && context.owner !== trigger.match.owner) return false;
      if (trigger.match?.season !== undefined && context.season !== trigger.match.season) return false;
      if (trigger.match?.owners && !pairEqual((context.owners as string[]) || [], trigger.match.owners)) return false;
      const value = String(context.value ?? context.activation_value ?? '');
      if (trigger.activation === 'triple-activate') {
        const previous = activations.get(id);
        const at = now();
        const next = previous && at - previous.at <= TRIPLE_WINDOW && previous.value === value ? { at, count: previous.count + 1, value } : { at, count: 1, value };
        activations.set(id, next);
        if (next.count < 3) return false;
        activations.delete(id);
      }
      if (trigger.once_policy === 'session' && once.has(id)) return false;
      if (trigger.once_policy === 'session') once.add(id);
      void service.reveal(entry ? 'entry' : 'collection', entry?.id || collection!.id, { context });
      return true;
    },
    async reveal(targetType, targetId, options = {}) {
      if (!asset?.enabled) return false;
      const target = targetType === 'entry' ? entries().get(targetId) : collections().get(targetId);
      if (!target) return false;
      const scope = options.scope || createScope(`reveal:${targetId}`, scopes);
      const effect = targetType === 'entry' ? effects().get('lore-dialog') || null : effects().get('lore-dialog') || null;
      const module = await loadPresentation();
      if (!asset?.enabled || !scopes.has(scope)) return false;
      module.showLore(target, entries(), effect, { scope, opener: options.opener, reducedMotion });
      return true;
    },
    createScope(id) { return createScope(id, scopes); },
    setReducedMotion(value) { reducedMotion = value; if (value) scopes.forEach(scope => scope.clear()); },
    dispose() { scopes.forEach(scope => scope.clear()); presentation?.disposeLorePresentation(); presentation = null; presentationPromise = null; once.clear(); activations.clear(); asset = null; },
    isEnabled() { return !!asset?.enabled; },
  };
  return service;
}
