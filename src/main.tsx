import './styles/app.css';

import { render } from 'preact';
import ThemeToggle from './components/theme/ThemeToggle';
import GlobalSearch from './components/search/GlobalSearch';
import DataFreshnessBadge, { createDataFreshnessRuntime } from './components/data-freshness/DataFreshnessBadge';
import { createDarlingThemeRuntime, type DarlingThemeRuntime } from './theme/apply-theme';
import { createSearchRuntime } from './search/search-runtime';
import type { DarlingSearchRuntime } from './search/search-types';
import { createTableRuntime } from './tables/table-runtime';
import type { DarlingTableRuntime } from './tables/table-types';
import type { DataDiagnostics } from './data/load-league-assets';
import { bootstrapDarlingApp } from './app/app-controller';
import { createLazyLoreService } from './lore/lore-lazy';
import { bindDropdownChecklists } from './accessibility/dropdown-checklist';
import { focusableElements } from './accessibility/focus';
import { prefersReducedMotion, subscribeToReducedMotion } from './accessibility/motion';
import { bindPrimaryNavigation, syncPageState } from './accessibility/primary-navigation';

type DarlingDataLoader = typeof import('./data/load-league-assets').loadLeagueAssets;

interface BrowserWindow {
  darlingTheme?: DarlingThemeRuntime;
  darlingSearch?: DarlingSearchRuntime;
  darlingTables?: DarlingTableRuntime;
  darlingDataLoader?: DarlingDataLoader;
  darlingDataDiagnostics?: DataDiagnostics;
  darlingAccessibility?: {
    prefersReducedMotion: typeof prefersReducedMotion;
    focusableElements: typeof focusableElements;
    syncPageState: typeof syncPageState;
  };
}

interface BrowserDocument {
  readyState: string;
  getElementById(id: string): unknown;
  addEventListener(type: 'DOMContentLoaded', listener: () => void, options?: { once?: boolean }): void;
}

const themeRuntime = createDarlingThemeRuntime();
const loreRuntime = createLazyLoreService();
const searchRuntime = createSearchRuntime({ loreAction: action => void loreRuntime.reveal(action.targetType, action.targetId) });
const tableRuntime = createTableRuntime();
const freshnessRuntime = createDataFreshnessRuntime();
const browser = globalThis as unknown as {
  window: BrowserWindow;
  document?: BrowserDocument;
};

browser.window.darlingTheme = themeRuntime;
browser.window.darlingSearch = searchRuntime;
browser.window.darlingTables = tableRuntime;
browser.window.darlingDataLoader = async options => {
  const { loadLeagueAssets } = await import('./data/load-league-assets');
  return loadLeagueAssets(options);
};
browser.window.darlingAccessibility = {
  prefersReducedMotion,
  focusableElements,
  syncPageState,
};

function mountThemeControls() {
  const mount = browser.document!.getElementById('themeControls');
  render(<ThemeToggle runtime={themeRuntime} />, mount as Parameters<typeof render>[1]);
}

function mountGlobalSearch() {
  const mount = browser.document!.getElementById('globalSearchRoot');
  const portal = browser.document!.getElementById('globalSearchPortal');
  render(<GlobalSearch runtime={searchRuntime} portal={portal as any} />, mount as Parameters<typeof render>[1]);
}

function mountDataFreshness() {
  const mount = browser.document!.getElementById('dataFreshnessRoot');
  render(<DataFreshnessBadge runtime={freshnessRuntime} />, mount as Parameters<typeof render>[1]);
}

function mountShell() {
  mountThemeControls();
  mountGlobalSearch();
  mountDataFreshness();
  bindPrimaryNavigation(document);
  bindDropdownChecklists(document);
  document.addEventListener('click', event => {
    const source = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-lore-trigger]') : null;
    const data = source?.dataset;
    const trigger = data?.loreTrigger;
    if (!trigger) return;
    loreRuntime.trigger(trigger, {
      owner: data.loreOwner,
      season: data.loreSeason,
      value: data.loreValue,
      owners: data.loreOwners?.split(',').map(owner => owner.trim()).filter(Boolean),
      opener: source,
    });
  });
  window.addEventListener('darling:theme-selection', event => {
    const value = (event as CustomEvent<{ preference?: string }>).detail?.preference;
    if (value) loreRuntime.trigger('theme-sunday-night', { value });
  });
  subscribeToReducedMotion((reduced) => {
    document.documentElement.dataset.reducedMotion = reduced ? 'reduce' : 'no-preference';
    window.dispatchEvent(new CustomEvent('darling:motionchange', { detail: { reduced } }));
    loreRuntime.setReducedMotion(reduced);
  });
  void bootstrapDarlingApp({ tableRuntime, searchRuntime, freshnessRuntime, lore: loreRuntime });
}

if (browser.document?.readyState === 'loading') {
  browser.document.addEventListener('DOMContentLoaded', mountShell, { once: true });
} else {
  mountShell();
}
