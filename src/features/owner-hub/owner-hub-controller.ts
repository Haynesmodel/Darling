import './owner-hub.entry.css';
import { h, render } from 'preact';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { OwnerHubPage } from './OwnerHubPage';
import { buildOwnerHubModel } from './owner-hub-model';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let root: HTMLElement | null = null;
  let activeSignal: AbortSignal | null = null;
  let selectedOwner: string | null = null;
  let invalidOwner: string | null = null;
  let message = '';
  let unsubscribe: (() => void) | null = null;

  const isValid = (owner: string | null): owner is string => !!owner && context.ownerPreference.validOwners().includes(owner);
  const renderCurrent = () => {
    if (!root || !activeSignal || activeSignal.aborted) return;
    render(h(OwnerHubPage, {
      validOwners: context.ownerPreference.validOwners(),
      selectedOwner,
      invalidOwner,
      preference: context.ownerPreference.getSnapshot(),
      message,
      model: selectedOwner ? buildOwnerHubModel(context.data, {
        owner: selectedOwner,
        pathname: context.window.location.pathname,
        seasonAggregates: context.selectors.seasonAggregates(),
      }) : null,
      onPreview(owner: string) {
        if (!isValid(owner)) return;
        selectedOwner = owner;
        invalidOwner = null;
        message = '';
        context.router.update({ tab: 'owner', selectedOwner: owner });
        context.header.feature(`${owner} Owner Hub`, owner);
        context.theme.owner(owner);
        renderCurrent();
      },
      onSave() {
        if (!selectedOwner) return;
        const result = context.ownerPreference.set(selectedOwner);
        message = result.persisted
          ? `${selectedOwner} is now My Team.`
          : 'Saved for this visit; browser storage is unavailable.';
        renderCurrent();
      },
      onClear() {
        context.ownerPreference.set(null);
        message = 'My Team cleared.';
        renderCurrent();
      },
    }), root);
  };

  return {
    id: 'owner',
    mount(nextContext) {
      context = nextContext;
      root = context.document.getElementById('ownerHubRoot');
      if (!root) throw new Error('Owner Hub root missing');
      unsubscribe = context.ownerPreference.subscribe(() => renderCurrent());
    },
    activate(input: FeatureActivation) {
      activeSignal = input.signal;
      if (input.signal.aborted) return;
      const routeOwner = input.route.owner;
      if (routeOwner !== null) {
        const valid = isValid(routeOwner);
        selectedOwner = valid ? routeOwner : null;
        invalidOwner = valid ? null : routeOwner;
      } else if (!(input.reason === 'tab' && isValid(selectedOwner))) {
        selectedOwner = context.ownerPreference.getSnapshot().owner;
        invalidOwner = null;
      }
      message = '';
      if (input.signal.aborted || activeSignal !== input.signal) return;
      const title = selectedOwner ? `${selectedOwner} Owner Hub` : 'My Team';
      const heading = context.document.getElementById('page-owner-title');
      if (heading) heading.textContent = title;
      context.header.feature(title, selectedOwner);
      if (selectedOwner) context.theme.owner(selectedOwner); else context.theme.league();
      renderCurrent();
      if (input.signal.aborted || activeSignal !== input.signal) return;
      context.router.update({ tab: 'owner', selectedOwner: selectedOwner && routeOwner ? selectedOwner : null });
    },
    deactivate() { activeSignal = null; },
    dispose() {
      activeSignal = null;
      unsubscribe?.();
      unsubscribe = null;
      if (root) render(null, root);
      root = null;
    },
  };
}
