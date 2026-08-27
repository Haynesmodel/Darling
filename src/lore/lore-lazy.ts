import type { LeagueLore } from '../data/generated/asset-types';
import type { LoreRevealOptions, LoreScope, LoreSearchDocument, LoreService } from './lore-types';

/** Keeps the presentation/registry out of the entry chunk until lore is used. */
export function createLazyLoreService(): LoreService {
  let asset: LeagueLore | null = null;
  let reducedMotion = false;
  let loading: Promise<typeof import('./lore-presentation')> | null = null;
  const load = () => loading ||= import('./lore-presentation');
  const docs = () => !asset?.enabled ? [] : [
    ...asset.entries.filter(entry => entry.enabled).map(entry => ({ id: `lore:entry:${entry.id}`, category: 'lore' as const, title: entry.title, subtitle: entry.teaser, keywords: [...entry.search_terms, ...entry.owners], priority: 125, action: { kind: 'lore' as const, targetType: 'entry' as const, targetId: entry.id } })),
    ...asset.collections.filter(collection => collection.enabled).map(collection => ({ id: `lore:collection:${collection.id}`, category: 'lore' as const, title: collection.title, subtitle: collection.summary, keywords: collection.search_terms, priority: 130, action: { kind: 'lore' as const, targetType: 'collection' as const, targetId: collection.id } })),
  ];
  const noScope: LoreScope = { id: 'lazy', clear() {}, timer() { return 0; }, add() {} };
  return {
    hydrate(next) { asset = next; },
    entry(id) { return asset?.entries.find(entry => entry.enabled && entry.id === id) || null; },
    collection(id) { return asset?.collections.find(collection => collection.enabled && collection.id === id) || null; },
    effect(id) { return asset?.effects.find(effect => effect.enabled && effect.id === id) || null; },
    searchDocuments: docs,
    trigger() { return false; },
    async reveal(type, id, options?: LoreRevealOptions) {
      if (!asset?.enabled) return false;
      const target = type === 'entry' ? asset.entries.find(entry => entry.enabled && entry.id === id) : asset.collections.find(collection => collection.enabled && collection.id === id);
      if (!target) return false;
      const module = await load();
      module.showLore(target, new Map(asset.entries.filter(entry => entry.enabled).map(entry => [entry.id, entry])), asset.effects.find(effect => effect.id === 'lore-dialog' && effect.enabled) || null, { scope: options?.scope, opener: options?.opener, reducedMotion });
      return true;
    },
    createScope(id) { return { ...noScope, id }; },
    setReducedMotion(value) { reducedMotion = value; },
    dispose() { loading = null; asset = null; reducedMotion = false; },
    isEnabled() { return !!asset?.enabled; },
  };
}
