import '../css/style.css';
import '../css/easter-eggs.css';
import '../js/app.js';

import { render } from 'preact';
import ThemeToggle from './components/theme/ThemeToggle';
import GlobalSearch from './components/search/GlobalSearch';
import { createDarlingThemeRuntime, type DarlingThemeRuntime } from './theme/apply-theme';
import { createSearchRuntime } from './search/search-runtime';
import type { DarlingSearchRuntime } from './search/search-types';

interface BrowserWindow {
  darlingTheme?: DarlingThemeRuntime;
  darlingSearch?: DarlingSearchRuntime;
}

interface BrowserDocument {
  readyState: string;
  getElementById(id: string): unknown;
  addEventListener(type: 'DOMContentLoaded', listener: () => void, options?: { once?: boolean }): void;
}

const themeRuntime = createDarlingThemeRuntime();
const searchRuntime = createSearchRuntime();
const browser = globalThis as unknown as {
  window?: BrowserWindow;
  document?: BrowserDocument;
};

if (browser.window) {
  browser.window.darlingTheme = themeRuntime;
  browser.window.darlingSearch = searchRuntime;
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
