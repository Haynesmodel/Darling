import { showPage } from '../../js/render-helpers.js';
import { applyFocusTarget } from './feature-utils';
import { FeatureRegistry } from './feature-registry';
import { FEATURE_IDS, type DarlingFeatureController, type FeatureId } from './feature-contract';
import { createNavigationService, normalizeFeatureId } from './router';
import { createFeatureStatusService } from './services/feature-status';
import { createHeaderService } from './services/header-service';
import { createLeagueSelectors } from './services/league-selectors';
import { createThemeContextService } from './services/theme-context-service';
import type { AppContext, AppDiagnostics, AppRoute } from './app-types';
import type { DarlingTableRuntime } from '../tables/table-types';
import type { DarlingSearchRuntime } from '../search/search-types';

const LABELS: Record<FeatureId, string> = {
  pulse: 'League Pulse', history: 'League History', current: 'Current Season', rivalry: 'Head to Head', trophy: 'Trophy Case', dynasty: 'Dynasty Rankings', draft: 'Draft Spot', gauntlet: 'Historical Matchup',
};
const TAB_IDS: Record<string, FeatureId> = {
  tabPulseBtn: 'pulse', tabHistoryBtn: 'history', tabCurrentBtn: 'current', tabRivalryBtn: 'rivalry', tabTrophyBtn: 'trophy', tabDynastyBtn: 'dynasty', tabDraftBtn: 'draft', tabGauntletBtn: 'gauntlet',
};

export interface BootstrapOptions {
  tableRuntime: DarlingTableRuntime;
  searchRuntime: DarlingSearchRuntime;
  win?: Window;
  doc?: Document;
}

export async function bootstrapDarlingApp(options: BootstrapOptions): Promise<() => Promise<void>> {
  const win = options.win || window;
  const doc = options.doc || document;
  const registry = new FeatureRegistry();
  const router = createNavigationService(win);
  const status = createFeatureStatusService(doc);
  let activeFeature: FeatureId | null = null;
  let activeController: DarlingFeatureController | null = null;
  let activationCount = 0;
  let abortController: AbortController | null = null;
  let disposed = false;
  const diagnostics: AppDiagnostics = {
    get activeFeature() { return activeFeature; },
    get activationCount() { return activationCount; },
    get features() { return registry.diagnostics(); },
  };
  win.darlingFeatureDiagnostics = diagnostics;
  status.dataLoading();
  let dataFailed = false;
  const dataPromise = import('../data/load-league-assets').then(({ loadLeagueAssets }) => loadLeagueAssets()).catch(error => {
    dataFailed = true;
    throw error;
  });
  const contextPromise = dataPromise.then(data => {
    win.darlingDataDiagnostics = data.diagnostics;
    win.__darlingDataVersion = data.dataVersion;
    options.searchRuntime.hydrate({ leagueGames: data.leagueGames, seasonSummaries: data.seasonSummaries, rivalries: data.rivalries, currentSeason: data.currentSeason });
    return {
      data,
      selectors: createLeagueSelectors(data),
      router,
      header: createHeaderService(doc, data),
      theme: createThemeContextService(win),
      status,
      tables: options.tableRuntime,
      diagnostics,
      document: doc,
      window: win,
    } satisfies AppContext;
  });

  const request = async (route: AppRoute, reason: 'bootstrap' | 'tab' | 'popstate' | 'search' | 'retry') => {
    if (disposed) return;
    const id = normalizeFeatureId(route.tab);
    route.tab = id;
    activationCount += 1;
    const activationId = activationCount;
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;
    showPage(id, doc);
    if (activeController && activeFeature && activeFeature !== id) await activeController.deactivate?.(id);
    status.loading(id, LABELS[id]);
    const featurePromise = reason === 'retry' ? registry.retry(id) : registry.load(id);
    try {
      const [context, controller] = await Promise.all([contextPromise, featurePromise]);
      if (disposed || signal.aborted || activationId !== activationCount) return;
      await registry.mount(id, controller, context);
      if (disposed || signal.aborted || activationId !== activationCount) return;
      const activate = () => controller.activate({ route, activationId, signal, reason });
      if (reason === 'tab') await router.runReplacing(activate); else await router.runWithoutPush(activate);
      if (disposed || signal.aborted || activationId !== activationCount) return;
      activeFeature = id;
      activeController = controller;
      registry.recordActivation(id);
      status.clearGlobal();
      status.ready(id);
      applyFocusTarget(doc, route.focus);
    } catch (error) {
      if (disposed || signal.aborted || activationId !== activationCount) return;
      if (dataFailed) console.error('Failed to load league JSON', error);
      else console.error(`[Darling] Failed to activate ${id}`, error);
      if (dataFailed) {
        status.dataError(error);
        return;
      }
      const reloadForFreshModuleMap = registry.hasLoadFailure(id);
      status.error(id, LABELS[id], error, () => {
        if (reloadForFreshModuleMap) win.location.reload();
        else void request(route, 'retry');
      });
    }
  };

  const initialRoute = router.parse();
  void request(initialRoute, 'bootstrap');

  const onTabClick = (event: Event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"]') : null;
    const id = button ? TAB_IDS[button.id] : null;
    if (!id) return;
    const url = new URL(win.location.href);
    url.searchParams.set('tab', id);
    win.history.pushState(null, '', `${url.pathname}${url.search}`);
    const route = router.parse();
    route.tab = id;
    void request(route, 'tab');
  };
  const onPopState = () => void request(router.parse(), 'popstate');
  doc.getElementById('primaryTabStrip')?.addEventListener('click', onTabClick);
  win.addEventListener('popstate', onPopState);

  return async () => {
    disposed = true;
    abortController?.abort();
    doc.getElementById('primaryTabStrip')?.removeEventListener('click', onTabClick);
    win.removeEventListener('popstate', onPopState);
    await activeController?.deactivate?.('pulse');
    await registry.dispose();
  };
}
