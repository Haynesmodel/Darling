import { FEATURE_NAVIGATION, FEATURE_NAVIGATION_ITEMS, featureDestinationHref } from '../app/feature-navigation';
import { FEATURE_IDS, type FeatureId } from '../app/feature-contract';

const featureIds = new Set<string>(FEATURE_IDS);

function resolveFeatureId(value: unknown): FeatureId {
  return featureIds.has(String(value)) ? value as FeatureId : 'pulse';
}

function closeNavigationGroups(root: Document, except?: HTMLDetailsElement): void {
  root.querySelectorAll<HTMLDetailsElement>('.primary-nav-group[open]').forEach(group => {
    if (group !== except) group.open = false;
  });
}

export function isEligiblePrimaryNavigationClick(
  event: Pick<MouseEvent, 'button' | 'defaultPrevented' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  anchor: HTMLAnchorElement,
  locationHref: string,
): boolean {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || anchor.hasAttribute('download')
  ) return false;
  const target = anchor.getAttribute('target');
  if (target && target.toLowerCase() !== '_self') return false;
  const destination = new URL(anchor.href, locationHref);
  return destination.origin === new URL(locationHref).origin;
}

export function syncPageState(id: string, root: Document = document): void {
  const resolvedId = resolveFeatureId(id);
  const activePanel = root.getElementById(`page-${resolvedId}`);
  const activeItem = FEATURE_NAVIGATION[resolvedId];
  let activeDestination: HTMLAnchorElement | null = null;

  root.querySelectorAll<HTMLAnchorElement>('[data-feature-id]').forEach(destination => {
    const current = destination.dataset.featureId === resolvedId;
    destination.classList.toggle('active', current);
    if (current) {
      destination.setAttribute('aria-current', 'page');
      activeDestination = destination;
    } else {
      destination.removeAttribute('aria-current');
    }
  });

  root.querySelectorAll<HTMLDetailsElement>('.primary-nav-group').forEach(group => {
    const current = group.dataset.navigationGroup === activeItem.group;
    group.classList.toggle('is-current-group', current);
    const currentLabel = group.querySelector<HTMLElement>('[data-current-group-label]');
    if (currentLabel) currentLabel.textContent = current ? `, current page: ${activeItem.label}` : '';
  });
  closeNavigationGroups(root);

  const dialogsToClose = [...root.querySelectorAll<HTMLDialogElement>('dialog[open]')]
    .filter(dialog => !activePanel?.contains(dialog));
  dialogsToClose.forEach(dialog => {
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
    const closedGroup = activeDestination?.closest<HTMLDetailsElement>('.primary-nav-group:not([open])');
    const focusTarget = closedGroup?.querySelector<HTMLElement>('summary') || activeDestination;
    focusTarget?.focus({ preventScroll: true });
  }

  root.querySelectorAll<HTMLElement>('.page').forEach(panel => {
    const visible = panel.id === `page-${resolvedId}`;
    panel.hidden = !visible;
    panel.classList.toggle('visible', visible);
  });
}

export function bindPrimaryNavigation(root: Document = document): () => void {
  const navigation = root.getElementById('primaryNavigation');
  if (!navigation) return () => {};
  const groups = [...navigation.querySelectorAll<HTMLDetailsElement>('.primary-nav-group')];
  const win = root.defaultView;

  FEATURE_NAVIGATION_ITEMS.forEach(item => {
    const destination = root.getElementById(item.destinationId);
    if (destination instanceof HTMLAnchorElement && win) {
      destination.href = featureDestinationHref(item.id, win.location.pathname);
    }
  });

  const onToggle = (event: Event) => {
    const group = event.currentTarget;
    if (group instanceof HTMLDetailsElement && group.open) closeNavigationGroups(root, group);
  };
  groups.forEach(group => group.addEventListener('toggle', onToggle));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const group = groups.find(candidate => candidate.open);
    if (!group) return;
    event.preventDefault();
    group.open = false;
    group.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  };
  navigation.addEventListener('keydown', onKeyDown);

  const onOutsideActivation = (event: PointerEvent) => {
    if (event.target instanceof Node && !navigation.contains(event.target)) closeNavigationGroups(root);
  };
  root.addEventListener('pointerdown', onOutsideActivation);

  return () => {
    groups.forEach(group => group.removeEventListener('toggle', onToggle));
    navigation.removeEventListener('keydown', onKeyDown);
    root.removeEventListener('pointerdown', onOutsideActivation);
  };
}
