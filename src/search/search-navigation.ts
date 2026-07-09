import type { SearchAction } from './search-types';

export function navigateToSearchUrl(url: string): void {
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== url) window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function executeSearchAction(action: SearchAction): void {
  if (action.kind === 'navigate') {
    navigateToSearchUrl(action.url);
    return;
  }
  const setTheme = (preference: 'system' | 'light' | 'dark') => {
    if (window.darlingTheme?.setColorSchemePreference) {
      window.darlingTheme.setColorSchemePreference(preference);
      return;
    }
    document.querySelector(`[data-theme-preference="${preference}"]`)?.click();
  };
  if (action.command === 'theme-dark') setTheme('dark');
  if (action.command === 'theme-light') setTheme('light');
  if (action.command === 'theme-system') setTheme('system');
  if (action.command === 'export-history') document.getElementById('exportCsv')?.click();
}
