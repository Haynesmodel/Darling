import { parseUrlState, updateUrlFromState } from '../../js/state-helpers.js';
import type { AppRoute, NavigationService } from './app-types';
import { FEATURE_IDS, type FeatureId } from './feature-contract';

const ids = new Set<string>(FEATURE_IDS);

export function normalizeFeatureId(value: unknown): FeatureId {
  return ids.has(String(value)) ? value as FeatureId : 'pulse';
}

export function inferFeatureId(route: ReturnType<typeof parseUrlState>): FeatureId {
  if (route.tab !== null && route.tab !== undefined) return normalizeFeatureId(route.tab);
  if (route.hasRivalry) return 'rivalry';
  if (route.hasCurrent || route.focus === 'standings' || route.focus === 'playoff-picture') return 'current';
  if (route.hasTrophy) return 'trophy';
  if (route.hasDynasty) return 'dynasty';
  if (route.hasDraft) return 'draft';
  if (route.hasGauntlet) return 'gauntlet';
  if (
    route.team
    || route.hasGameQuery
    || route.seasons?.size
    || route.weeks?.size
    || route.opps?.size
    || route.types?.size
    || route.rounds?.size
    || ['overview', 'games', 'curses'].includes(String(route.focus || ''))
  ) return 'history';
  return 'pulse';
}

export function createNavigationService(win: Window): NavigationService {
  let suppressionDepth = 0;
  let replacementDepth = 0;
  return {
    parse(search?: string): AppRoute {
      const parsed = parseUrlState(search) as AppRoute;
      parsed.tab = inferFeatureId(parsed);
      return parsed;
    },
    update(options) {
      const next = updateUrlFromState({
        pathname: win.location.pathname,
        ...options,
        isApplyingUrlState: suppressionDepth > 0 || replacementDepth > 0,
      });
      if (replacementDepth > 0 && `${win.location.pathname}${win.location.search}` !== next) {
        win.history.replaceState(null, '', next);
      }
      return next;
    },
    async runWithoutPush<T>(callback: () => T | Promise<T>): Promise<T> {
      suppressionDepth += 1;
      try {
        return await callback();
      } finally {
        suppressionDepth -= 1;
      }
    },
    async runReplacing<T>(callback: () => T | Promise<T>): Promise<T> {
      replacementDepth += 1;
      try {
        return await callback();
      } finally {
        replacementDepth -= 1;
      }
    },
  };
}
