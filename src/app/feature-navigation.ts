import { buildUrlFromState } from '../../js/state-helpers.js';
import { FEATURE_IDS, type FeatureId } from './feature-contract';

export type FeatureNavigationGroup = 'home' | 'season' | 'owners' | 'rivalries' | 'tools';

export interface FeatureNavigationItem {
  id: FeatureId;
  label: string;
  compactLabel: string;
  group: FeatureNavigationGroup;
  destinationId: string;
  heroMode: 'full' | 'compact';
}

export const FEATURE_NAVIGATION: Record<FeatureId, FeatureNavigationItem> = {
  pulse: {
    id: 'pulse',
    label: 'League Pulse',
    compactLabel: 'Home',
    group: 'home',
    destinationId: 'tabPulseBtn',
    heroMode: 'full',
  },
  owner: {
    id: 'owner',
    label: 'My Team',
    compactLabel: 'My Team',
    group: 'owners',
    destinationId: 'tabOwnerBtn',
    heroMode: 'compact',
  },
  transactions: {
    id: 'transactions',
    label: 'Transactions',
    compactLabel: 'Moves',
    group: 'owners',
    destinationId: 'tabTransactionsBtn',
    heroMode: 'compact',
  },
  history: {
    id: 'history',
    label: 'League History',
    compactLabel: 'History',
    group: 'owners',
    destinationId: 'tabHistoryBtn',
    heroMode: 'compact',
  },
  current: {
    id: 'current',
    label: 'Current Season',
    compactLabel: 'Season',
    group: 'season',
    destinationId: 'tabCurrentBtn',
    heroMode: 'compact',
  },
  rivalry: {
    id: 'rivalry',
    label: 'Head to Head',
    compactLabel: 'H2H',
    group: 'rivalries',
    destinationId: 'tabRivalryBtn',
    heroMode: 'compact',
  },
  trophy: {
    id: 'trophy',
    label: 'Trophy Case',
    compactLabel: 'Trophies',
    group: 'owners',
    destinationId: 'tabTrophyBtn',
    heroMode: 'compact',
  },
  dynasty: {
    id: 'dynasty',
    label: 'Dynasty Rankings',
    compactLabel: 'Dynasty',
    group: 'owners',
    destinationId: 'tabDynastyBtn',
    heroMode: 'compact',
  },
  draft: {
    id: 'draft',
    label: 'Draft Spot',
    compactLabel: 'Draft',
    group: 'tools',
    destinationId: 'tabDraftBtn',
    heroMode: 'compact',
  },
  gauntlet: {
    id: 'gauntlet',
    label: 'Historical Matchup',
    compactLabel: 'Matchup',
    group: 'tools',
    destinationId: 'tabGauntletBtn',
    heroMode: 'compact',
  },
};

export const FEATURE_NAVIGATION_ITEMS = FEATURE_IDS.map(id => FEATURE_NAVIGATION[id]);

export function featureDestinationHref(id: FeatureId, pathname: string): string {
  return buildUrlFromState({ pathname, tab: id });
}
