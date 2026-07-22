import type { AppContext } from './app-types';
import type { DarlingFeatureController, DarlingFeatureModule, FeatureId } from './feature-contract';

export type FeatureLoadState = 'idle' | 'loading' | 'ready' | 'error';
type Loader = () => Promise<DarlingFeatureModule>;

export const featureLoaders: Record<FeatureId, Loader> = {
  pulse: () => import('../features/league-pulse/league-pulse-controller'),
  history: () => import('../features/history/history-controller'),
  current: () => import('../features/current-season/current-season-controller'),
  rivalry: () => import('../features/rivalry/rivalry-controller'),
  trophy: () => import('../features/trophy/trophy-controller'),
  dynasty: () => import('../features/dynasty/dynasty-controller'),
  draft: () => import('../features/draft-spot/draft-spot-feature'),
  gauntlet: () => import('../features/gauntlet/gauntlet-controller'),
};

interface Entry {
  state: FeatureLoadState;
  promise?: Promise<DarlingFeatureController>;
  controller?: DarlingFeatureController;
  mounted: boolean;
  activationCount: number;
  lastError?: string;
  loadDurationMs?: number;
}

export class FeatureRegistry {
  readonly #entries = new Map<FeatureId, Entry>();
  constructor(private readonly loaders: Record<FeatureId, Loader> = featureLoaders) {}

  #entry(id: FeatureId): Entry {
    let entry = this.#entries.get(id);
    if (!entry) {
      entry = { state: 'idle', mounted: false, activationCount: 0 };
      this.#entries.set(id, entry);
    }
    return entry;
  }

  load(id: FeatureId): Promise<DarlingFeatureController> {
    const entry = this.#entry(id);
    if (entry.controller) return Promise.resolve(entry.controller);
    if (entry.promise) return entry.promise;
    entry.state = 'loading';
    entry.lastError = undefined;
    const started = performance.now();
    entry.promise = this.loaders[id]().then(module => {
      if (!module || typeof module.createFeatureController !== 'function') throw new Error(`Malformed ${id} feature module`);
      const controller = module.createFeatureController();
      if (!controller || controller.id !== id || typeof controller.mount !== 'function' || typeof controller.activate !== 'function') {
        throw new Error(`Malformed ${id} feature controller`);
      }
      entry.controller = controller;
      entry.state = 'ready';
      entry.loadDurationMs = performance.now() - started;
      return controller;
    }).catch(error => {
      entry.state = 'error';
      entry.lastError = error instanceof Error ? error.message : String(error);
      entry.loadDurationMs = performance.now() - started;
      entry.promise = undefined;
      throw error;
    });
    return entry.promise;
  }

  async mount(id: FeatureId, controller: DarlingFeatureController, context: AppContext): Promise<void> {
    const entry = this.#entry(id);
    if (entry.mounted) return;
    await controller.mount(context);
    entry.mounted = true;
  }

  recordActivation(id: FeatureId): void {
    this.#entry(id).activationCount += 1;
  }

  retry(id: FeatureId): Promise<DarlingFeatureController> {
    const entry = this.#entry(id);
    if (entry.controller) return Promise.resolve(entry.controller);
    entry.promise = undefined;
    entry.state = 'idle';
    return this.load(id);
  }

  hasLoadFailure(id: FeatureId): boolean {
    const entry = this.#entry(id);
    return entry.state === 'error' && !entry.controller;
  }

  diagnostics(): Readonly<Record<FeatureId, unknown>> {
    return Object.freeze(Object.fromEntries((Object.keys(this.loaders) as FeatureId[]).map(id => {
      const entry = this.#entry(id);
      return [id, Object.freeze({
        state: entry.state,
        mounted: entry.mounted,
        activationCount: entry.activationCount,
        lastError: entry.lastError,
        loadDurationMs: entry.loadDurationMs,
      })];
    })) as Record<FeatureId, unknown>);
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.#entries.values()].map(async entry => entry.controller?.dispose?.()));
    this.#entries.clear();
  }
}
