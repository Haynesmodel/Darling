import './transactions.entry.css';
import { h, render } from 'preact';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import type { TransactionHistory } from '../../data/generated/asset-types';
import { formatValidatorErrors } from '../../data/generated/asset-validators';
import {
  getTransactionHistoryValidatorErrors,
  isTransactionHistory,
} from '../../data/generated/transaction-history-validator';
import { fetchVerifiedJson, versionedAssetUrl } from '../../data/verified-json-fetch';
import TransactionsPage from './TransactionsPage';
import { buildTransactionModel } from './transactions-model';
import type { TransactionRouteState } from './transactions-types';

const cache = new Map<string, Promise<TransactionHistory>>();

function fetchAsset(context: AppContext): Promise<TransactionHistory> {
  const entry = context.data.manifest.assets.TransactionHistory;
  if (!entry) throw new Error('TransactionHistory is not present in the data manifest.');
  const basePath = new URL('.', context.document.baseURI).pathname;
  const url = versionedAssetUrl(entry.path, basePath, entry.sha256);
  if (!cache.has(url)) {
    const request = fetchVerifiedJson<TransactionHistory>({
      name: 'TransactionHistory',
      path: entry.path,
      sha256: entry.sha256,
      bytes: entry.bytes,
      dataVersion: context.data.dataVersion,
    }, { basePath }).then(result => {
      if (!isTransactionHistory(result.value)) {
        throw new Error(formatValidatorErrors('TransactionHistory', getTransactionHistoryValidatorErrors()));
      }
      return result.value;
    });
    cache.set(url, request);
    void request.catch(() => {
      if (cache.get(url) === request) cache.delete(url);
    });
  }
  return cache.get(url) as Promise<TransactionHistory>;
}

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let root: HTMLElement | null = null;
  let activeSignal: AbortSignal | null = null;
  let asset: TransactionHistory | null = null;
  let state: TransactionRouteState | null = null;

  const paint = (requested: Partial<TransactionRouteState> = {}) => {
    if (!root || !asset || !activeSignal || activeSignal.aborted) return;
    const model = buildTransactionModel(asset, {
      transactionSeason: requested.season ?? state?.season,
      transactionView: requested.view ?? state?.view,
      transactionOwner: Object.prototype.hasOwnProperty.call(requested, 'owner') ? requested.owner : state?.owner,
      transactionPlayer: Object.prototype.hasOwnProperty.call(requested, 'player') ? requested.player : state?.player,
      transactionId: Object.prototype.hasOwnProperty.call(requested, 'transactionId') ? requested.transactionId : state?.transactionId,
    }, {
      pathname: context.window.location.pathname,
      favoriteOwner: context.ownerPreference.getSnapshot().owner,
    });
    state = model.state;
    render(h(TransactionsPage, {
      model,
      onStateChange: (next: Partial<TransactionRouteState>) => {
        if (!activeSignal || activeSignal.aborted) return;
        paint(next);
        if (!state) return;
        context.router.update({
          tab: 'transactions',
          selectedTransactionSeason: state.season,
          selectedTransactionView: state.view,
          selectedTransactionOwner: state.owner,
          selectedTransactionPlayer: state.player,
          selectedTransactionId: state.transactionId,
        });
      },
    }), root);
    context.header.feature(state.owner ? `${state.owner} Transactions` : 'Transactions', state.owner, 'Transactions');
    context.theme.owner(state.owner);
  };

  return {
    id: 'transactions',
    mount(nextContext) {
      context = nextContext;
      root = context.document.getElementById('transactionHistoryRoot');
      if (!root) throw new Error('Transactions mount #transactionHistoryRoot is missing.');
    },
    async activate(input: FeatureActivation) {
      const signal = input.signal;
      activeSignal = signal;
      if (!root || signal.aborted) return;
      render(h('div', { class: 'status-banner status-loading', role: 'status' }, 'Loading transaction history…'), root);
      const loaded = await fetchAsset(context);
      if (signal.aborted || activeSignal !== signal || !root) return;
      asset = loaded;
      state = null;
      const requested = {
        season: input.route.transactionSeason,
        view: input.route.transactionView,
        owner: input.route.transactionOwner,
        player: input.route.transactionPlayer,
        transactionId: input.route.transactionId,
      } as Partial<TransactionRouteState>;
      paint(requested);
      if (!state || signal.aborted || activeSignal !== signal) return;
      context.router.update({
        tab: 'transactions',
        selectedTransactionSeason: state.season,
        selectedTransactionView: state.view,
        selectedTransactionOwner: state.owner,
        selectedTransactionPlayer: state.player,
        selectedTransactionId: state.transactionId,
      });
      const focusDeepLink = () => {
        if (signal.aborted || activeSignal !== signal || !root) return;
        const target = state?.transactionId
          ? root.querySelector<HTMLElement>(`#transaction-${CSS.escape(state.transactionId)}`)
          : state?.player
            ? root.querySelector<HTMLElement>(`#transaction-player-${CSS.escape(state.player)}`)
            : root.querySelector<HTMLElement>(`[data-transaction-view="${state?.view}"]`);
        if (target) {
          if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }
      };
      if (typeof context.window.requestAnimationFrame === 'function') {
        context.window.requestAnimationFrame(focusDeepLink);
      } else {
        queueMicrotask(focusDeepLink);
      }
    },
    deactivate() {
      activeSignal = null;
    },
    dispose() {
      activeSignal = null;
      asset = null;
      state = null;
      if (root) render(null, root);
      root = null;
    },
  };
}
