export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusableElements(container: ParentNode | null): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

export function restoreFocus(target: Element | null, fallback?: HTMLElement | null): void {
  requestAnimationFrame(() => {
    if (target instanceof HTMLElement && target.isConnected) {
      target.focus();
      return;
    }
    fallback?.focus();
  });
}

export function setApplicationInert(inert: boolean): void {
  const shell = document.getElementById('appShell');
  if (shell instanceof HTMLElement) shell.inert = inert;
}

let scrollLockDepth = 0;
let previousBodyPadding = '';

export function lockBodyScroll(): void {
  scrollLockDepth += 1;
  if (scrollLockDepth !== 1) return;
  const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  previousBodyPadding = document.body.style.paddingRight;
  document.body.classList.add('no-scroll');
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
}

export function unlockBodyScroll(): void {
  scrollLockDepth = Math.max(0, scrollLockDepth - 1);
  if (scrollLockDepth !== 0) return;
  document.body.classList.remove('no-scroll');
  document.body.style.paddingRight = previousBodyPadding;
}
