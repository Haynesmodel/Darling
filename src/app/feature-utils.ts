export const ALL_TEAMS = '__ALL__';
export const DEFAULT_TEAM = 'Joe';

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
    standings: '#currentStandings',
    'playoff-picture': '#currentPlayoffPicture',
  };
  const target = focus ? doc.querySelector<HTMLElement>(targets[focus]) : null;
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start' });
}
