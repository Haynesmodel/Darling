import '../css/style.css';
import '../css/easter-eggs.css';
import '../js/app.js';

import { render } from 'preact';
import ThemeToggle from './components/theme/ThemeToggle';
import { createDarlingThemeRuntime, type DarlingThemeRuntime } from './theme/apply-theme';

interface BrowserWindow {
  darlingTheme?: DarlingThemeRuntime;
}

interface BrowserDocument {
  readyState: string;
  getElementById(id: string): unknown;
  addEventListener(type: 'DOMContentLoaded', listener: () => void, options?: { once?: boolean }): void;
}

const themeRuntime = createDarlingThemeRuntime();
const browser = globalThis as unknown as {
  window?: BrowserWindow;
  document?: BrowserDocument;
};

if (browser.window) {
  browser.window.darlingTheme = themeRuntime;
}

function mountThemeControls() {
  const mount = browser.document?.getElementById('themeControls');
  if (!mount) return;
  render(<ThemeToggle runtime={themeRuntime} />, mount as Parameters<typeof render>[1]);
}

if (browser.document?.readyState === 'loading') {
  browser.document.addEventListener('DOMContentLoaded', mountThemeControls, { once: true });
} else {
  mountThemeControls();
}
