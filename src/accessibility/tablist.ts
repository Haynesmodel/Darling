import { motionAwareScrollBehavior } from './motion';

const TAB_IDS: Record<string, string> = {
  history: 'tabHistoryBtn',
  current: 'tabCurrentBtn',
  rivalry: 'tabRivalryBtn',
  trophy: 'tabTrophyBtn',
  dynasty: 'tabDynastyBtn',
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
  previous.hidden = !overflow;
  next.hidden = !overflow;
  previous.disabled = !overflow || strip.scrollLeft <= 2;
  next.disabled = !overflow || strip.scrollLeft >= maxScroll - 2;
  strip.classList.toggle('has-overflow-start', overflow && !previous.disabled);
  strip.classList.toggle('has-overflow-end', overflow && !next.disabled);
}

export function revealActiveTab(tab: HTMLElement, root: Document = document): void {
  const strip = root.getElementById('primaryTabStrip');
  if (!(strip instanceof HTMLElement)) return;
  const tabBox = tab.getBoundingClientRect();
  const stripBox = strip.getBoundingClientRect();
  let left = strip.scrollLeft;
  if (tabBox.left < stripBox.left) left += tabBox.left - stripBox.left;
  else if (tabBox.right > stripBox.right) left += tabBox.right - stripBox.right;
  strip.scrollTo({ left, behavior: motionAwareScrollBehavior() });
  requestAnimationFrame(() => updateTabOverflow(root));
}

export function syncPageState(id: string, root: Document = document): void {
  const resolvedId = Object.hasOwn(TAB_IDS, id) ? id : 'history';
  const activeTabId = TAB_IDS[resolvedId];
  let activeTab: HTMLElement | null = null;

  root.querySelectorAll<HTMLElement>('[role="tab"]').forEach((tab) => {
    const selected = tab.id === activeTabId;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
    if (selected) activeTab = tab;
  });

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
    if (event.key === 'ArrowLeft') nextIndex = Math.max(0, index - 1);
    if (event.key === 'ArrowRight') nextIndex = Math.min(tabs.length - 1, index + 1);
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
