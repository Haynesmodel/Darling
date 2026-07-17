import type { AppContext, AppRoute } from './app-types';

export const FEATURE_IDS = ['history', 'current', 'rivalry', 'trophy', 'dynasty', 'draft', 'gauntlet'] as const;
export type FeatureId = typeof FEATURE_IDS[number];

export interface FeatureActivation {
  route: AppRoute;
  activationId: number;
  signal: AbortSignal;
  reason: 'bootstrap' | 'tab' | 'popstate' | 'search' | 'retry';
}

export interface DarlingFeatureController {
  readonly id: FeatureId;
  mount(context: AppContext): void | Promise<void>;
  activate(input: FeatureActivation): void | Promise<void>;
  deactivate?(nextFeature: FeatureId): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

export interface DarlingFeatureModule {
  createFeatureController(): DarlingFeatureController;
}
