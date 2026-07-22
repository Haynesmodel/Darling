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

  return {
    id: 'pulse',
    mount(nextContext) {
      context = nextContext;
      root = context.document.getElementById('leaguePulseRoot');
      if (!root) throw new Error('League Pulse mount #leaguePulseRoot is missing');
    },
    activate(input: FeatureActivation) {
      activeSignal = input.signal;
      if (input.signal.aborted || !root) return;
      const model = buildLeaguePulseModel(context.data, { pathname: context.window.location.pathname });
      if (input.signal.aborted || activeSignal !== input.signal) return;
      render(h(LeaguePulsePage, { model }), root);
      if (input.signal.aborted || activeSignal !== input.signal) return;
      context.header.feature('League Pulse', null, model.hero.title);
      context.theme.league(model.state.phase === 'postseason' ? 'postseason' : 'regular');
      context.router.update({ tab: 'pulse' });
    },
    deactivate() { activeSignal = null; },
    dispose() {
      activeSignal = null;
      if (root) render(null, root);
      root = null;
    },
  };
}
