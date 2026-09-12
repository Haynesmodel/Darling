import type { Season as TransactionSeason, TransactionHistory } from '../../data/generated/asset-types';

export const TRANSACTION_VIEWS = ['overview', 'trades', 'waivers', 'players', 'owners', 'draft'] as const;
export type TransactionView = typeof TRANSACTION_VIEWS[number];

export interface TransactionRouteState {
  season: number;
  view: TransactionView;
  owner: string | null;
  player: string | null;
  transactionId: string | null;
}

export interface TransactionModel {
  asset: TransactionHistory;
  season: TransactionSeason;
  seasons: number[];
  state: TransactionRouteState;
  favoriteOwner: string | null;
  playerNames: ReadonlyMap<string, string>;
  pathname: string;
}
