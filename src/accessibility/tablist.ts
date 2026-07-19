import { motionAwareScrollBehavior } from './motion';

const TAB_IDS: Record<string, string> = {
  pulse: 'tabPulseBtn',
  history: 'tabHistoryBtn',
  current: 'tabCurrentBtn',
  rivalry: 'tabRivalryBtn',
  trophy: 'tabTrophyBtn',
  dynasty: 'tabDynastyBtn',
  draft: 'tabDraftBtn',
  gauntlet: 'tabGauntletBtn',
};

function tabsIn(root: ParentNode): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

export function updateTabOverflow(root: Document = document): void {
  const strip = root.getElementById('primaryTabStrip');
  const previous = root.getElementById('tabScrollPrev') as HTMLButtonElement | null;
  const next = root.getElementById('tabScrollNext') as HTMLButtonElement | null;
  if (!(strip instanceof HTMLElement) || !previous || !next) return;

  const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth);
  const overflow = maxScroll > 2;
  const atStart = !overflow || strip.scrollLeft <= 2;
  const atEnd = !overflow || strip.scrollLeft >= maxScroll - 2;
  const compact = root.defaultView?.matchMedia('(max-width:420px)').matches ?? false;
  previous.disabled = atStart;
  next.disabled = atEnd;
  previous.hidden = !overflow || (compact && atStart);
  next.hidden = !overflow || (compact && atEnd);
  strip.classList.toggle('has-overflow-start', overflow && !atStart);
  strip.classList.toggle('has-overflow-end', overflow && !atEnd);
}

export function revealActiveTab(tab: HTMLElement, root: Document = document): void {
  const strip = root.getElementById('primaryTabStrip');
  if (!(strip instanceof HTMLElement)) return;
  const align = (behavior: ScrollBehavior) => {
    const tabBox = tab.getBoundingClientRect();
    const stripBox = strip.getBoundingClientRect();
    let left = strip.scrollLeft;
    if (tabBox.left < stripBox.left) left += tabBox.left - stripBox.left;
    else if (tabBox.right > stripBox.right) left += tabBox.right - stripBox.right;
    strip.scrollTo({ left, behavior });
  };
  align(motionAwareScrollBehavior());
  requestAnimationFrame(() => {
    updateTabOverflow(root);
    // Compact overflow controls change the strip width as they appear. Align
    // once more after that layout settles so the selected tab is not obscured.
    align('auto');
    requestAnimationFrame(() => updateTabOverflow(root));
  });
}

export function syncPageState(id: string, root: Document = document): void {
  const resolvedId = Object.hasOwn(TAB_IDS, id) ? id : 'pulse';
  const activeTabId = TAB_IDS[resolvedId];
  let activeTab: HTMLElement | null = null;
  const activePanel = root.getElementById(`page-${resolvedId}`);

  root.querySelectorAll<HTMLElement>('[role="tab"]').forEach((tab) => {
    const selected = tab.id === activeTabId;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
    if (selected) activeTab = tab;
  });

  const dialogsToClose = [...root.querySelectorAll<HTMLDialogElement>('dialog[open]')]
    .filter(dialog => !activePanel?.contains(dialog));
  dialogsToClose.forEach((dialog) => {
    const request = new CustomEvent('darling:dialog-navigation-close', {
      bubbles: true,
      cancelable: true,
      detail: { nextPage: resolvedId },
    });
    dialog.dispatchEvent(request);
    if (!request.defaultPrevented) {
      dialog.close();
      dialog.replaceChildren();
      root.body.classList.remove('no-scroll');
    }
  });
  if (dialogsToClose.length) {
    activeTab?.focus({ preventScroll: true });
  }

  root.querySelectorAll<HTMLElement>('[role="tabpanel"]').forEach((panel) => {
    const visible = panel.id === `page-${resolvedId}`;
    panel.hidden = !visible;
    panel.classList.toggle('visible', visible);
  });

  if (activeTab) revealActiveTab(activeTab, root);
}

export function bindTablist(root: Document = document): () => void {
  const tablist = root.getElementById('primaryTabStrip');
  const previous = root.getElementById('tabScrollPrev') as HTMLButtonElement | null;
  const next = root.getElementById('tabScrollNext') as HTMLButtonElement | null;
  if (!tablist) return () => {};

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || target.getAttribute('role') !== 'tab') return;
    const tabs = tabsIn(tablist);
    const index = tabs.indexOf(target);
    if (index < 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      tabs[nextIndex]?.focus();
      revealActiveTab(tabs[nextIndex], root);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      target.click();
    }
  };

  const scrollByPage = (direction: -1 | 1) => {
    tablist.scrollBy({
      left: direction * Math.max(160, tablist.clientWidth * 0.72),
      behavior: motionAwareScrollBehavior(),
    });
  };

  const onPrevious = () => scrollByPage(-1);
  const onNext = () => scrollByPage(1);
  const onScroll = () => requestAnimationFrame(() => updateTabOverflow(root));
  const observer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => updateTabOverflow(root))
    : null;

  tablist.addEventListener('keydown', onKeyDown);
  tablist.addEventListener('scroll', onScroll, { passive: true });
  previous?.addEventListener('click', onPrevious);
  next?.addEventListener('click', onNext);
  observer?.observe(tablist);
  updateTabOverflow(root);

  return () => {
    tablist.removeEventListener('keydown', onKeyDown);
    tablist.removeEventListener('scroll', onScroll);
    previous?.removeEventListener('click', onPrevious);
    next?.removeEventListener('click', onNext);
    observer?.disconnect();
  };
}
