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

interface BrowserWindow {
  darlingTheme?: DarlingThemeRuntime;
  darlingSearch?: DarlingSearchRuntime;
  darlingTables?: DarlingTableRuntime;
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
const searchRuntime = createSearchRuntime({ loreAction: action => {
  requestAnimationFrame(() => window.setTimeout(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void loreRuntime.reveal(action.targetType, action.targetId, { opener });
  }, 0));
} });
const tableRuntime = createTableRuntime();
const freshnessRuntime = createDataFreshnessRuntime();
const browser = globalThis as unknown as {
  window: BrowserWindow;
  document?: BrowserDocument;
};

browser.window.darlingTheme = themeRuntime;
browser.window.darlingSearch = searchRuntime;
browser.window.darlingTables = tableRuntime;
browser.window.darlingAccessibility = {
  prefersReducedMotion,
  focusableElements,
  syncPageState,
};

function mountShell() {
  const themeMount = browser.document!.getElementById('themeControls');
  render(<ThemeToggle runtime={themeRuntime} />, themeMount as Parameters<typeof render>[1]);
  const searchMount = browser.document!.getElementById('globalSearchRoot');
  const searchPortal = browser.document!.getElementById('globalSearchPortal');
  render(<GlobalSearch runtime={searchRuntime} portal={searchPortal as any} />, searchMount as Parameters<typeof render>[1]);
  const freshnessMount = browser.document!.getElementById('dataFreshnessRoot');
  render(<DataFreshnessBadge runtime={freshnessRuntime} />, freshnessMount as Parameters<typeof render>[1]);
  bindPrimaryNavigation(document);
  bindDropdownChecklists(document);
  document.addEventListener('click', event => {
    const source = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-lore-trigger]') : null;
    const attr = (name: string) => source?.getAttribute(`data-lore-${name}`) || undefined;
    const trigger = attr('trigger');
    if (!trigger) return;
    loreRuntime.trigger(trigger, {
      owner: attr('owner'),
      season: attr('season'),
      value: attr('value'),
      owners: attr('owners')?.split(',').map(owner => owner.trim()).filter(Boolean),
      facts: (() => { try { const value = attr('facts'); return value ? JSON.parse(value) : undefined; } catch { return undefined; } })(),
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
