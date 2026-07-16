import '../css/style.css';
import '../css/easter-eggs.css';
import '../js/app.js';

import { render } from 'preact';
import ThemeToggle from './components/theme/ThemeToggle';
import GlobalSearch from './components/search/GlobalSearch';
import './components/tables/table.css';
import { createDarlingThemeRuntime, type DarlingThemeRuntime } from './theme/apply-theme';
import { createSearchRuntime } from './search/search-runtime';
import type { DarlingSearchRuntime } from './search/search-types';
import { createTableRuntime } from './tables/table-runtime';
import type { DarlingTableRuntime } from './tables/table-types';
import { loadLeagueAssets } from './data/load-league-assets';
import type { DataDiagnostics } from './data/load-league-assets';

interface BrowserWindow {
  darlingTheme?: DarlingThemeRuntime;
  darlingSearch?: DarlingSearchRuntime;
  darlingTables?: DarlingTableRuntime;
  darlingDataLoader?: typeof loadLeagueAssets;
  darlingDataDiagnostics?: DataDiagnostics;
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
  browser.window.darlingDataLoader = loadLeagueAssets;
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
}

if (browser.document?.readyState === 'loading') {
  browser.document.addEventListener('DOMContentLoaded', mountShell, { once: true });
} else {
  mountShell();
}
