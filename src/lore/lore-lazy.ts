import type { LeagueLore } from '../data/generated/asset-types';
import type { LoreRevealOptions, LoreScope, LoreService } from './lore-types';

/** Keeps the presentation/registry out of the entry chunk until lore is used. */
type LorePresentation = typeof import('./lore-presentation');

export function createLazyLoreService(presenter?: () => Promise<LorePresentation>): LoreService {
  let asset: LeagueLore | null = null;
  let reducedMotion = false;
  let loading: Promise<LorePresentation> | null = null;
  const states = new Map<string, { at: number; count?: number; value: string; values?: string[] }>();
  const scopes = new Set<LoreScope>();
  const load = () => loading ||= presenter?.() || import('./lore-presentation');
  const advance = (id: string, value: string, windowMs: number, expected: string, limit: number) => {
    const at = now(); const previous = states.get(id);
    const values = previous && at - previous.at <= windowMs ? [...(previous.values || []), value] : [value];
    states.set(id, { at, value, values: values.slice(-limit) });
    if (values.slice(-limit).join('|') !== expected) return false;
    states.delete(id); return true;
  };
  const docs = () => !asset?.enabled ? [] : [
    ...asset.entries.filter(entry => entry.enabled).map(entry => ({ id: `lore:entry:${entry.id}`, category: 'lore' as const, title: entry.title, subtitle: entry.teaser, keywords: [...entry.search_terms, ...entry.owners], priority: 125, action: { kind: 'lore' as const, targetType: 'entry' as const, targetId: entry.id } })),
    ...asset.collections.filter(collection => collection.enabled).map(collection => ({ id: `lore:collection:${collection.id}`, category: 'lore' as const, title: collection.title, subtitle: collection.summary, keywords: collection.search_terms, priority: 130, action: { kind: 'lore' as const, targetType: 'collection' as const, targetId: collection.id } })),
  ];
  const makeScope = (id: string): LoreScope => {
    const timers = new Set<number>(), nodes = new Set<Node>();
    const scope: LoreScope = { id, clear() {
      timers.forEach(timer => globalThis.clearTimeout(timer));
      nodes.forEach(node => node.parentNode?.removeChild(node));
      timers.clear(); nodes.clear(); scopes.delete(scope);
    }, timer(callback, duration) {
      const timer = globalThis.setTimeout(() => { timers.delete(timer); callback(); }, Math.min(2500, Math.max(0, duration))) as unknown as number;
      timers.add(timer); return timer;
    }, add: node => void nodes.add(node) };
    scopes.add(scope); return scope;
  };
  const reveal = async (type: 'entry' | 'collection', id: string, options?: LoreRevealOptions) => {
    if (!asset?.enabled) return false;
    const target = type === 'entry' ? asset.entries.find(entry => entry.enabled && entry.id === id) : asset.collections.find(collection => collection.enabled && collection.id === id);
    if (!target) return false;
    const module = await load();
    const scope = options?.scope || makeScope(`reveal:${id}`);
    if (!asset?.enabled || !scopes.has(scope)) return false;
    module.showLore(target, new Map(asset.entries.filter(entry => entry.enabled).map(entry => [entry.id, entry])), asset.effects.find(effect => effect.id === (options?.effectId || 'lore-dialog') && effect.enabled) || null, { scope, opener: options?.opener, reducedMotion });
    return true;
  };
  const now = () => typeof performance?.now === 'function' ? performance.now() : Date.now();
  return {
    hydrate(next) { asset = next; },
    entry(id) { return asset?.entries.find(entry => entry.enabled && entry.id === id) || null; },
    collection(id) { return asset?.collections.find(collection => collection.enabled && collection.id === id) || null; },
    effect(id) { return asset?.effects.find(effect => effect.enabled && effect.id === id) || null; },
    searchDocuments: docs,
    trigger(id, context = {}) {
      if (!asset?.enabled) return false;
      const trigger = asset.triggers.find(item => item.id === id && item.enabled);
      if (!trigger) return false;
      const match = trigger.match;
      const owners = context.owners as string[] | undefined;
      if (match?.owner && context.owner !== match.owner) return false;
      if (match?.season !== undefined && Number(context.season) !== match.season) return false;
      if (match?.activation_value && String(context.activation_value ?? context.value ?? '') !== match.activation_value) return false;
      if (match?.owners && (!owners || owners.length !== match.owners.length || !match.owners.every(owner => owners.includes(owner)))) return false;
      const value = String(context.value ?? '');
      if (trigger.activation === 'theme-sequence' || id === 'dynasty-joel-elevator') {
        if (!advance(id, value, trigger.activation === 'theme-sequence' ? 5000 : 4000, trigger.activation === 'theme-sequence' ? 'system|light|dark' : '2016|2017', trigger.activation === 'theme-sequence' ? 3 : 2)) return false;
      }
      if (trigger.activation === 'triple-activate' && !advance(id, value, 4000, `${value}|${value}|${value}`, 3)) return false;
      if (trigger.once_policy === 'session' && states.has(`seen:${id}`)) return false;
      if (trigger.once_policy === 'session') states.set(`seen:${id}`, { at: now(), value });
      const collection = trigger.collection_id && asset.collections.find(item => item.id === trigger.collection_id);
      const ownerEntry = id === 'owner-emblem' && collection && context.owner
        ? asset.entries.find(entry => collection.entry_ids.includes(entry.id) && entry.enabled && entry.owners.includes(String(context.owner)))
        : null;
      const type = trigger.entry_id || ownerEntry ? 'entry' : 'collection';
      const target = trigger.entry_id || ownerEntry?.id || trigger.collection_id;
      if (!target) return false;
      void reveal(type, target, { opener: context.opener as HTMLElement | null, context, effectId: trigger.effect_id });
      return true;
    },
    reveal,
    createScope: makeScope,
    setReducedMotion(value) { reducedMotion = value; },
      dispose() { scopes.forEach(scope => scope.clear()); loading = null; asset = null; reducedMotion = false; states.clear(); },
    isEnabled() { return !!asset?.enabled; },
  };
}
