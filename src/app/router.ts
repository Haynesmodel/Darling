import { parseUrlState, updateUrlFromState } from '../../js/state-helpers.js';
import type { AppRoute, NavigationService } from './app-types';
import { FEATURE_IDS, type FeatureId } from './feature-contract';

const ids = new Set<string>(FEATURE_IDS);

export function normalizeFeatureId(value: unknown): FeatureId {
  return ids.has(String(value)) ? value as FeatureId : 'history';
}

export function createNavigationService(win: Window): NavigationService {
  let suppressionDepth = 0;
  let replacementDepth = 0;
  return {
    parse(search?: string): AppRoute {
      const parsed = parseUrlState(search) as AppRoute;
      parsed.tab = normalizeFeatureId(parsed.tab);
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
