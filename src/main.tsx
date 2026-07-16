import './styles/app.css';
import '../js/app.js';

import { render } from 'preact';
import ThemeToggle from './components/theme/ThemeToggle';
import GlobalSearch from './components/search/GlobalSearch';
import { createDarlingThemeRuntime, type DarlingThemeRuntime } from './theme/apply-theme';
import { createSearchRuntime } from './search/search-runtime';
import type { DarlingSearchRuntime } from './search/search-types';
import { createTableRuntime } from './tables/table-runtime';
import type { DarlingTableRuntime } from './tables/table-types';
import type { DataDiagnostics } from './data/load-league-assets';
import { bindDropdownChecklists } from './accessibility/dropdown-checklist';
import { focusableElements } from './accessibility/focus';
import { prefersReducedMotion, subscribeToReducedMotion } from './accessibility/motion';
import { bindTablist, syncPageState, updateTabOverflow } from './accessibility/tablist';

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
    updateTabOverflow: typeof updateTabOverflow;
  };
}

interface BrowserDocument {
  readyState: string;
  getElementById(id: string): unknown;
  addEventListener(type: 'DOMContentLoaded', listener: () => void, options?: { once?: boolean }): void;
}

const themeRuntime = createDarlingThemeRuntime();
const searchRuntime = createSearchRuntime();
const tableRuntime = createTableRuntime();
const browser = globalThis as unknown as {
  window?: BrowserWindow;
  document?: BrowserDocument;
};

if (browser.window) {
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
    updateTabOverflow,
  };
}

function mountThemeControls() {
  const mount = browser.document?.getElementById('themeControls');
  if (!mount) return;
  render(<ThemeToggle runtime={themeRuntime} />, mount as Parameters<typeof render>[1]);
}

function mountGlobalSearch() {
  const mount = browser.document?.getElementById('globalSearchRoot');
  const portal = browser.document?.getElementById('globalSearchPortal');
  if (!mount || !portal) return;
  render(<GlobalSearch runtime={searchRuntime} portal={portal as any} />, mount as Parameters<typeof render>[1]);
}

function mountShell() {
  mountThemeControls();
  mountGlobalSearch();
  bindTablist(document);
  bindDropdownChecklists(document);
  subscribeToReducedMotion((reduced) => {
    document.documentElement.dataset.reducedMotion = reduced ? 'reduce' : 'no-preference';
    window.dispatchEvent(new CustomEvent('darling:motionchange', { detail: { reduced } }));
  });
}

if (browser.document?.readyState === 'loading') {
  browser.document.addEventListener('DOMContentLoaded', mountShell, { once: true });
} else {
  mountShell();
}
