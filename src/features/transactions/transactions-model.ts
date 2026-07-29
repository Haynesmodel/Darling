import { buildUrlFromState } from '../../../js/state-helpers.js';
import type { TransactionHistory } from '../../data/generated/asset-types';
import { TRANSACTION_VIEWS, type TransactionModel, type TransactionRouteState, type TransactionView } from './transactions-types';

const viewSet = new Set<string>(TRANSACTION_VIEWS);

export function transactionHref(
  pathname: string,
  state: Partial<TransactionRouteState>,
): string {
  return buildUrlFromState({
    pathname,
    tab: 'transactions',
    selectedTransactionSeason: state.season,
    selectedTransactionView: state.view,
    selectedTransactionOwner: state.owner,
    selectedTransactionPlayer: state.player,
    selectedTransactionId: state.transactionId,
  });
}

export function resolveTransactionState(
  asset: TransactionHistory,
  requested: {
    transactionSeason?: number | null;
    transactionView?: string | null;
    transactionOwner?: string | null;
    transactionPlayer?: string | null;
    transactionId?: string | null;
  },
): TransactionRouteState {
  const seasons = asset.seasons.map(row => row.season);
  const newest = Math.max(...seasons);
  const season = seasons.includes(Number(requested.transactionSeason))
    ? Number(requested.transactionSeason)
    : newest;
  const selected = asset.seasons.find(row => row.season === season) as TransactionHistory['seasons'][number];
  const owners = new Set(selected.teams.map(row => row.owner));
  const players = new Set(selected.player_journeys.map(row => row.player_id));
  const transactions = new Map(selected.transactions.map(row => [row.id, row]));
  const transactionId = requested.transactionId && transactions.has(requested.transactionId)
    ? requested.transactionId
    : null;
  const player = requested.transactionPlayer && players.has(requested.transactionPlayer)
    ? requested.transactionPlayer
    : null;
  const owner = requested.transactionOwner && owners.has(requested.transactionOwner)
    ? requested.transactionOwner
    : null;
  let view: TransactionView = viewSet.has(String(requested.transactionView))
    ? requested.transactionView as TransactionView
    : 'overview';
  if (player) view = 'players';
  if (transactionId) {
    const source = transactions.get(transactionId);
    if (source?.type === 'trade') view = 'trades';
    else if (source && ['waiver', 'free_agent'].includes(source.type)) view = 'waivers';
  }
  return { season, view, owner, player, transactionId };
}

export function buildTransactionModel(
  asset: TransactionHistory,
  requested: Parameters<typeof resolveTransactionState>[1],
  options: { pathname: string; favoriteOwner?: string | null },
): TransactionModel {
  const state = resolveTransactionState(asset, requested);
  const season = asset.seasons.find(row => row.season === state.season);
  if (!season) throw new Error('Transaction history does not contain an available season.');
  return {
    asset,
    season,
    seasons: asset.seasons.map(row => row.season).sort((a, b) => b - a),
    state,
    favoriteOwner: options.favoriteOwner && season.teams.some(row => row.owner === options.favoriteOwner)
      ? options.favoriteOwner
      : null,
    playerNames: new Map(asset.players.map(row => [row.id, row.name || `Player ${row.id}`])),
    pathname: options.pathname,
  };
}
