export const ALL_TEAMS = '__ALL__';

export function ownerOrNull(owner: unknown): string | null {
  const value = String(owner || '').trim();
  return value && value !== ALL_TEAMS ? value : null;
}

export { seasonModeFromLabels } from '../../js/shared/season-mode.js';

export function applyFocusTarget(doc: Document, focus?: string | null): void {
  const targets: Record<string, string> = {
    top: '#mainContent',
    overview: '#teamOverview',
    games: '#historyGamesCard',
    curses: '#curseTracker',
    standings: '#currentStandings',
    'playoff-picture': '#currentPlayoffPicture',
  };
  const target = focus ? doc.querySelector<HTMLElement>(targets[focus]) : null;
  if (!target) return;
  const disclosure = target.closest<HTMLDetailsElement>('details');
  if (disclosure && !disclosure.open) disclosure.open = true;
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start' });
}
