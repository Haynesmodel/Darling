import { motionAwareScrollBehavior } from './motion';

function menuFor(toggle: HTMLElement): HTMLElement | null {
  const id = toggle.getAttribute('aria-controls');
  return id ? document.getElementById(id) : null;
}

function optionsIn(menu: HTMLElement | null): HTMLInputElement[] {
  if (!menu) return [];
  return [...menu.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not([disabled])')];
}

function setOpen(dropdown: HTMLElement, open: boolean): void {
  dropdown.classList.toggle('open', open);
  const toggle = dropdown.querySelector<HTMLElement>('.dropdown-toggle');
  const menu = dropdown.querySelector<HTMLElement>('.dropdown-menu');
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (menu) {
    menu.hidden = !open;
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
}

function closeOthers(except: HTMLElement | null): void {
  document.querySelectorAll<HTMLElement>('.dropdown.open').forEach((dropdown) => {
    if (dropdown !== except) setOpen(dropdown, false);
  });
}

function focusOption(toggle: HTMLElement, position: 'first' | 'last'): void {
  const menu = menuFor(toggle);
  const options = optionsIn(menu);
  const target = position === 'first' ? options[0] : options.at(-1);
  target?.focus();
  target?.scrollIntoView({
    behavior: motionAwareScrollBehavior(),
    block: 'nearest',
  });
}

export function bindDropdownChecklists(root: Document = document): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const done = target.closest<HTMLElement>('[data-dropdown-done="1"]');
    if (done) {
      const dropdown = done.closest<HTMLElement>('.dropdown');
      const toggle = dropdown?.querySelector<HTMLElement>('.dropdown-toggle');
      if (dropdown) setOpen(dropdown, false);
      toggle?.focus();
      return;
    }

    const toggle = target.closest<HTMLElement>('.dropdown-toggle');
    if (toggle) {
      const dropdown = toggle.closest<HTMLElement>('.dropdown');
      if (!dropdown) return;
      const shouldOpen = !dropdown.classList.contains('open');
      closeOthers(dropdown);
      setOpen(dropdown, shouldOpen);
      return;
    }

    if (!target.closest('.dropdown')) closeOthers(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const toggle = target.closest<HTMLElement>('.dropdown-toggle');
    if (toggle && target === toggle) {
      const dropdown = toggle.closest<HTMLElement>('.dropdown');
      if (!dropdown) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        closeOthers(dropdown);
        setOpen(dropdown, true);
        focusOption(toggle, event.key === 'ArrowDown' ? 'first' : 'last');
      } else if (event.key === 'Escape' && dropdown.classList.contains('open')) {
        event.preventDefault();
        setOpen(dropdown, false);
      }
      return;
    }

    const menu = target.closest<HTMLElement>('.dropdown-menu');
    if (!menu) {
      if (event.key === 'Escape') {
        const openToggle = root.querySelector<HTMLElement>('.dropdown.open .dropdown-toggle');
        closeOthers(null);
        openToggle?.focus();
      }
      return;
    }

    const dropdown = menu.closest<HTMLElement>('.dropdown');
    const menuToggle = dropdown?.querySelector<HTMLElement>('.dropdown-toggle');
    const options = optionsIn(menu);
    const current = target instanceof HTMLInputElement ? options.indexOf(target) : -1;
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, current + 1);
    if (event.key === 'ArrowUp') nextIndex = Math.max(0, current - 1);
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;
    if (nextIndex !== null && options[nextIndex]) {
      event.preventDefault();
      options[nextIndex].focus();
      options[nextIndex].scrollIntoView({
        behavior: motionAwareScrollBehavior(),
        block: 'nearest',
      });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (dropdown) setOpen(dropdown, false);
      menuToggle?.focus();
      return;
    }
    if (event.key === 'Tab') {
      if (event.shiftKey && current === 0) {
        event.preventDefault();
        if (dropdown) setOpen(dropdown, false);
        menuToggle?.focus();
        return;
      }
      window.setTimeout(() => {
        if (dropdown && !dropdown.contains(document.activeElement)) setOpen(dropdown, false);
      }, 0);
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyDown);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKeyDown);
  };
}
