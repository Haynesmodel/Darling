import type { H2HGame, LeagueLore, SeasonSummaryRow } from '../data/generated/asset-types';
import type { LoreRevealOptions, LoreScope, LoreService } from './lore-types';

/** Keeps the presentation/registry out of the entry chunk until lore is used. */
type LorePresentation = typeof import('./lore-presentation');

export function createLazyLoreService(presenter?: () => Promise<LorePresentation>, clock?: () => number): LoreService {
  let asset: LeagueLore | null = null;
  let canonical: { leagueGames: H2HGame[]; seasonSummaries: SeasonSummaryRow[] } | null = null;
  let reducedMotion = false;
  let loading: Promise<LorePresentation> | null = null;
  let presentation: LorePresentation | null = null;
  const states = new Map<string, { at: number; values?: string[] }>();
  const tripleSignatures = new Map<string, string>();
  const sessionSeen = new Set<string>();
  const scopeSeen = new Set<string>();
  const pendingSession = new Map<string, number>();
  const pendingScope = new Map<string, number>();
  const scopes = new Set<LoreScope>();
  let pendingToken = 0;
  let generation = 0;
  const load = () => loading ||= presenter?.() || import('./lore-presentation');
  const advance = (id: string, value: string, windowMs: number, expected: string, limit: number) => {
    const at = now(); const previous = states.get(id);
    const values = previous && at - previous.at <= windowMs ? [...(previous.values || []), value] : [value];
    states.set(id, { at, values: values.slice(-limit) });
    if (values.slice(-limit).join('|') !== expected) return false;
    states.delete(id); return true;
  };
  const docs = () => !asset?.enabled ? [] : [
    ...asset.entries.filter(entry => entry.enabled).map(entry => ({ id: `lore:entry:${entry.id}`, category: 'lore' as const, title: entry.title, subtitle: entry.teaser, keywords: [...entry.search_terms, ...entry.owners, ...asset!.owners.filter(owner => entry.owners.includes(owner.owner)).flatMap(owner => owner.aliases)], priority: 125, action: { kind: 'lore' as const, targetType: 'entry' as const, targetId: entry.id } })),
    ...asset.collections.filter(collection => collection.enabled).map(collection => ({ id: `lore:collection:${collection.id}`, category: 'lore' as const, title: collection.title, subtitle: collection.summary, keywords: collection.search_terms, priority: 130, action: { kind: 'lore' as const, targetType: 'collection' as const, targetId: collection.id } })),
  ];
  const makeScope = (id: string): LoreScope => {
    const timers = new Set<number>(), nodes = new Set<Node>(), cleanups = new Set<() => void>();
    let cleared = false;
    const scope: LoreScope = { id, clear() {
      if (cleared) return;
      cleared = true;
      cleanups.forEach(callback => callback());
      cleanups.clear();
      timers.forEach(timer => globalThis.clearTimeout(timer));
      nodes.forEach(node => node.parentNode?.removeChild(node));
      timers.clear(); nodes.clear(); scopes.delete(scope);
    }, timer(callback, duration) {
      if (cleared) return -1;
      const timer = globalThis.setTimeout(() => { timers.delete(timer); callback(); }, Math.min(2500, Math.max(0, duration))) as unknown as number;
      timers.add(timer); return timer;
    }, add: node => { if (!cleared) nodes.add(node); }, onClear: callback => { if (cleared) callback(); else cleanups.add(callback); } };
    scopes.add(scope); return scope;
  };
  const canonicalFacts = (target: LeagueLore['entries'][number] | null, context?: Record<string, unknown>): Record<string, unknown> => {
    if (!canonical || !target) return {};
    const rawAnchor = target.anchors.find(item => item.type === 'game' || item.type === 'record') as any;
    const gameAnchor = rawAnchor?.type === 'record' ? rawAnchor.game : rawAnchor;
    const gameFor = (anchor: any) => canonical!.leagueGames.find(item => item.season === anchor.season && item.week === anchor.week && (item.round || item.type) === anchor.game_type && item.teamA !== item.teamB && anchor.owners.includes(item.teamA) && anchor.owners.includes(item.teamB));
    if (target.id === 'record-42' && gameAnchor) {
      const game = gameFor(gameAnchor);
      if (!game) return {};
      const preferredOwner = typeof context?.owner === 'string' && [game.teamA, game.teamB].includes(context.owner) ? context.owner : target.owners.find(owner => [game.teamA, game.teamB].includes(owner));
      const subject = preferredOwner || game.teamA;
      const score = game.teamA === subject ? game.scoreA : game.scoreB;
      const opponent = game.teamA === subject ? game.teamB : game.teamA;
      return { score: `${subject} ${score.toFixed(2)}`, opponent, season: game.season, week: game.week, game_type: game.type };
    }
    if (target.id === '2022-championship-context' && gameAnchor) {
      const game = gameFor(gameAnchor);
      const requestedOwner = typeof context?.owner === 'string' && game && [game.teamA, game.teamB].includes(context.owner) ? context.owner : null;
      const owner = requestedOwner || (game && target.owners.find(candidate => [game.teamA, game.teamB].includes(candidate))) || 'Zubs';
      const summary = canonical.seasonSummaries.find(item => item.owner === owner && item.season === gameAnchor.season);
      if (!game || !summary) return {};
      const ownerScore = game.teamA === owner ? game.scoreA : game.scoreB;
      const opponent = game.teamA === owner ? game.teamB : game.teamA;
      const opponentScore = game.teamA === owner ? game.scoreB : game.scoreA;
      return { record: `${summary.wins}-${summary.losses}${summary.ties ? `-${summary.ties}` : ''}`, finish: summary.finish, champion: summary.champion, team_count: canonical.seasonSummaries.filter(item => item.season === gameAnchor.season).length, championship_score: `${owner} ${ownerScore.toFixed(2)} – ${opponent} ${opponentScore.toFixed(2)}` };
    }
    const ownerAnchor = target.anchors.find(item => item.type === 'owner-season') as { owner?: string; season?: number } | undefined;
    const owner = ownerAnchor?.owner || (typeof context?.owner === 'string' ? context.owner : undefined);
    const season = ownerAnchor?.season ?? (owner ? Number(context?.season) : Number.NaN);
    const summary = owner && Number.isFinite(season) ? canonical.seasonSummaries.find(item => item.owner === owner && item.season === season) : null;
    return summary ? { record: `${summary.wins}-${summary.losses}${summary.ties ? `-${summary.ties}` : ''}`, finish: summary.finish, champion: summary.champion, saunders: summary.saunders, points_for: summary.points_for, points_against: summary.points_against, team_count: canonical.seasonSummaries.filter(item => item.season === season).length } : {};
  };
  const reveal = async (type: 'entry' | 'collection', id: string, options?: LoreRevealOptions) => {
    if (!asset?.enabled) return false;
    const target = type === 'entry' ? asset.entries.find(entry => entry.enabled && entry.id === id) : asset.collections.find(collection => collection.enabled && collection.id === id);
    if (!target) return false;
    const scope = options?.scope || makeScope(`reveal:${id}`);
    const revealGeneration = generation;
    let module: LorePresentation;
    try {
      module = await load();
    } catch {
      loading = null;
      if (!options?.scope) scope.clear();
      return false;
    }
    if (revealGeneration !== generation || !asset?.enabled || !scopes.has(scope)) {
      if (!options?.scope) scope.clear();
      return false;
    }
    presentation = module;
    const context = { ...options?.context, facts: { ...(options?.context?.facts as Record<string, unknown> | undefined), ...canonicalFacts(type === 'entry' ? target as LeagueLore['entries'][number] : null, options?.context) } };
    module.showLore(target, new Map(asset.entries.filter(entry => entry.enabled).map(entry => [entry.id, entry])), asset.effects.find(effect => effect.id === (options?.effectId || 'lore-dialog') && effect.enabled) || null, { scope, opener: options?.opener, context, reducedMotion });
    return true;
  };
  const now = clock || (() => typeof performance?.now === 'function' ? performance.now() : Date.now());
  return {
    hydrate(next, nextCanonical) { asset = next; canonical = nextCanonical || null; },
    entry(id) { return !asset?.enabled ? null : asset.entries.find(entry => entry.enabled && entry.id === id) || null; },
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
      const signature = [id, context.owner, context.season, context.activation_value, value, ...(owners || []).slice().sort()].join('|');
      if (trigger.activation === 'theme-sequence' || id === 'dynasty-joel-elevator') {
        const sequenceId = id === 'dynasty-joel-elevator' ? [id, context.owner, context.season, context.activation_value, ...(owners || []).slice().sort()].join('|') : id;
        if (!advance(sequenceId, value, trigger.activation === 'theme-sequence' ? 5000 : 4000, trigger.activation === 'theme-sequence' ? 'system|light|dark|system|light|dark' : '2016|2017', trigger.activation === 'theme-sequence' ? 6 : 2)) return false;
      }
      if (trigger.activation === 'triple-activate') {
        const previousSignature = tripleSignatures.get(id);
        if (previousSignature && previousSignature !== signature) states.delete(previousSignature);
        tripleSignatures.set(id, signature);
        if (!advance(signature, value, 4000, `${value}|${value}|${value}`, 3)) return false;
        tripleSignatures.delete(id);
      }
      const onceId = id.startsWith('dynasty-') ? `${id}:${[context.owner, context.season, context.activation_value, value, ...(owners || []).slice().sort()].join('|')}` : id;
      const scopedId = `${id}:${signature}`;
      if (trigger.once_policy === 'session' && sessionSeen.has(onceId)) return false;
      if (trigger.once_policy === 'scope' && scopeSeen.has(scopedId)) return false;
      const collection = trigger.collection_id && asset.collections.find(item => item.id === trigger.collection_id);
      const ownerEntry = id === 'owner-emblem' && collection && context.owner
        ? asset.entries.find(entry => collection.entry_ids.includes(entry.id) && entry.enabled && entry.owners.includes(String(context.owner)))
        : null;
      if (id === 'owner-emblem' && !ownerEntry) return false;
      const type = trigger.entry_id || ownerEntry ? 'entry' : 'collection';
      const target = trigger.entry_id || ownerEntry?.id || trigger.collection_id;
      if (!target) return false;
      const token = ++pendingToken;
      if (trigger.once_policy === 'session') { sessionSeen.add(onceId); pendingSession.set(onceId, token); }
      if (trigger.once_policy === 'scope') { scopeSeen.add(scopedId); pendingScope.set(scopedId, token); }
      const settle = (success: boolean) => {
        if (pendingSession.get(onceId) === token) { pendingSession.delete(onceId); if (!success) sessionSeen.delete(onceId); }
        if (pendingScope.get(scopedId) === token) { pendingScope.delete(scopedId); if (!success) scopeSeen.delete(scopedId); }
      };
      void reveal(type, target, { opener: context.opener as HTMLElement | null, context, effectId: trigger.effect_id }).then(settle, () => settle(false));
      return true;
    },
    reveal,
    createScope: makeScope,
    setReducedMotion(value) { reducedMotion = value; if (presentation) presentation.setReducedMotion?.(value); },
    clearTransient() { generation += 1; scopes.forEach(scope => scope.clear()); if (presentation) presentation.clearLoreTransient?.(); pendingSession.forEach((_token, id) => sessionSeen.delete(id)); states.clear(); tripleSignatures.clear(); scopeSeen.clear(); pendingScope.clear(); pendingSession.clear(); },
    dispose() { generation += 1; scopes.forEach(scope => scope.clear()); if (presentation) presentation.disposeLorePresentation?.(); loading = null; presentation = null; asset = null; canonical = null; reducedMotion = false; states.clear(); tripleSignatures.clear(); scopeSeen.clear(); sessionSeen.clear(); pendingScope.clear(); pendingSession.clear(); },
  };
}
