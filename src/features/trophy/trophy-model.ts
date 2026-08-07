import type { H2HGame, SeasonSummaryRow } from '../../data/generated/asset-types';
import type { TrophyModelOptions, TrophyViewModel } from './trophy-types';
import * as legacyModel from './trophy-model-legacy.js';

type TrophyModelExports = {
  buildTrophyCaseViewModel: (owner: string, options: TrophyModelOptions) => TrophyViewModel;
  buildOwnerCareerProfile: (owner: string, seasonSummaries: readonly SeasonSummaryRow[], leagueGames: readonly H2HGame[], options?: TrophyModelOptions) => unknown;
  computeLeagueRanks: (profiles: readonly unknown[]) => unknown;
  computeOwnerIdentity: (profile: unknown, ranks: unknown) => unknown;
  computeHardwareShelf: (profile: unknown, ranks: unknown) => unknown;
  computeCareerShape: (owner: string, rows: readonly SeasonSummaryRow[]) => TrophyViewModel['careerShape'];
  computeSignatureSeasons: (profile: unknown) => unknown;
  computeAchievementAndScarLists: (profile: unknown) => unknown;
  computeOwnerMoments: (owner: string, leagueGames: readonly H2HGame[]) => unknown;
  computeSeasonLedger: (owner: string, rows: readonly SeasonSummaryRow[], options?: TrophyModelOptions) => TrophyViewModel['seasonLedger'];
};

const model = legacyModel as unknown as TrophyModelExports;

export const {
  buildOwnerCareerProfile,
  computeLeagueRanks,
  computeOwnerIdentity,
  computeHardwareShelf,
  computeCareerShape,
  computeSignatureSeasons,
  computeAchievementAndScarLists,
  computeOwnerMoments,
  computeSeasonLedger,
} = model;

export const buildTrophyCaseViewModel = (
  owner: string,
  options: TrophyModelOptions = {},
): TrophyViewModel => model.buildTrophyCaseViewModel(owner, options);
