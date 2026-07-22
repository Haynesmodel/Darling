import './league-pulse.entry.css';
import { h, render } from 'preact';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { LeaguePulsePage } from './LeaguePulsePage';
import { buildLeaguePulseModel } from './league-pulse-model';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let root: HTMLElement | null = null;
  let activeSignal: AbortSignal | null = null;
  let unsubscribeFreshness: (() => void) | null = null;

  const renderCurrent = () => {
    if (!root || !activeSignal || activeSignal.aborted) return null;
    const model = buildLeaguePulseModel(context.data, {
      pathname: context.window.location.pathname,
      freshness: context.freshness.currentAssessment() || context.data.diagnostics.freshness,
    });
    render(h(LeaguePulsePage, { model }), root);
    return model;
  };

  return {
    id: 'pulse',
    mount(nextContext) {
      context = nextContext;
      root = context.document.getElementById('leaguePulseRoot');
      if (!root) throw new Error('League Pulse mount #leaguePulseRoot is missing');
      unsubscribeFreshness = context.freshness.subscribe(() => { renderCurrent(); });
    },
    activate(input: FeatureActivation) {
      activeSignal = input.signal;
      if (input.signal.aborted || !root) return;
      const model = renderCurrent();
      if (!model) return;
      if (input.signal.aborted || activeSignal !== input.signal) return;
      context.header.feature('League Pulse', null, model.hero.title);
      context.theme.league(model.state.phase === 'postseason' ? 'postseason' : 'regular');
      context.router.update({ tab: 'pulse' });
    },
    deactivate() { activeSignal = null; },
    dispose() {
      activeSignal = null;
      unsubscribeFreshness?.();
      unsubscribeFreshness = null;
      if (root) render(null, root);
      root = null;
    },
  };
}
