import { showPage } from '../../js/render-helpers.js';
import { applyFocusTarget } from './feature-utils';
import { FeatureRegistry } from './feature-registry';
import { FEATURE_IDS, type DarlingFeatureController, type FeatureId } from './feature-contract';
import { FEATURE_NAVIGATION } from './feature-navigation';
import { createNavigationService, normalizeFeatureId } from './router';
import { createFeatureStatusService } from './services/feature-status';
import { createHeaderService } from './services/header-service';
import { createLeagueSelectors } from './services/league-selectors';
import { createThemeContextService } from './services/theme-context-service';
import type { AppContext, AppDiagnostics, AppRoute } from './app-types';
import type { DarlingTableRuntime } from '../tables/table-types';
import type { DarlingSearchRuntime } from '../search/search-types';
import type { DataFreshnessRuntime } from '../components/data-freshness/DataFreshnessBadge';
import { isEligiblePrimaryNavigationClick } from '../accessibility/primary-navigation';
import { buildUrlFromState } from '../../js/state-helpers.js';
import {
  canonicalOwners as normalizeOwners,
  createOwnerPreferenceService,
  type OwnerPreferenceService,
  type OwnerPreferenceSnapshot,
} from './services/owner-preference-service';

export interface BootstrapOptions {
  tableRuntime: DarlingTableRuntime;
  searchRuntime: DarlingSearchRuntime;
  freshnessRuntime?: DataFreshnessRuntime;
  win?: Window;
  doc?: Document;
}

export function createFallbackFreshness<T>(assessment: T) {
  return {
    publish() {},
    current: () => null,
    currentAssessment: () => assessment,
    subscribe: () => () => {},
  };
}

export function canonicalOwners(data: Pick<AppContext['data'], 'seasonSummaries' | 'leagueGames' | 'currentSeason'>): readonly string[] {
  return normalizeOwners([
    ...data.seasonSummaries.map(row => row.owner),
    ...data.leagueGames.flatMap(game => [game.teamA, game.teamB]),
    ...(data.currentSeason?.teams.map(team => team.owner) || []),
  ]);
}

function updateOwnerDestination(doc: Document, win: Window, snapshot: OwnerPreferenceSnapshot): void {
  const destination = doc.getElementById('tabOwnerBtn');
  if (!(destination instanceof HTMLAnchorElement)) return;
  destination.href = buildUrlFromState({
    pathname: win.location.pathname,
    tab: 'owner',
    selectedOwner: snapshot.owner,
  });
  const status = destination.querySelector<HTMLElement>('[data-owner-preference-status]');
  if (status) status.textContent = snapshot.owner ? `, current team: ${snapshot.owner}` : ', not chosen';
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
  let ownerPreference: OwnerPreferenceService | null = null;
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
    options.freshnessRuntime?.publish({
      currentSeason: data.currentSeason,
      seasonSummaries: data.seasonSummaries,
      optionalFailures: data.diagnostics.optionalFailures,
      dataVersion: data.dataVersion,
      coreVerified: ['H2H', 'SeasonSummary'].every(asset => data.diagnostics.integrity.verifiedAssets.includes(asset)),
    });
    options.searchRuntime.hydrate({ leagueGames: data.leagueGames, seasonSummaries: data.seasonSummaries, rivalries: data.rivalries, currentSeason: data.currentSeason });
    ownerPreference = createOwnerPreferenceService(canonicalOwners(data), win);
    updateOwnerDestination(doc, win, ownerPreference.getSnapshot());
    ownerPreference.subscribe(snapshot => updateOwnerDestination(doc, win, snapshot));
    if (disposed) ownerPreference.dispose();
    return {
      data,
      selectors: createLeagueSelectors(data),
      router,
      header: createHeaderService(doc, data),
      theme: createThemeContextService(win),
      status,
      tables: options.tableRuntime,
      freshness: options.freshnessRuntime || createFallbackFreshness(data.diagnostics.freshness),
      ownerPreference,
      diagnostics,
      document: doc,
      window: win,
    } satisfies AppContext;
  });

  const request = async (route: AppRoute, reason: 'bootstrap' | 'tab' | 'popstate' | 'search' | 'retry') => {
    if (disposed) return;
    const id = normalizeFeatureId(route.tab);
    route.tab = id;
    doc.documentElement.dataset.activeFeature = id;
    doc.documentElement.dataset.heroMode = FEATURE_NAVIGATION[id].heroMode;
    activationCount += 1;
    const activationId = activationCount;
    abortController?.abort();
    abortController = new AbortController();
    const signal = abortController.signal;
    showPage(id, doc);
    if (activeController && activeFeature && activeFeature !== id) await activeController.deactivate?.(id);
    status.loading(id, FEATURE_NAVIGATION[id].label);
    const featurePromise = reason === 'retry' ? registry.retry(id) : registry.load(id);
    try {
      const [context, controller] = await Promise.all([contextPromise, featurePromise]);
      if (disposed || signal.aborted || activationId !== activationCount) return;
      await registry.mount(id, controller, context);
      if (disposed || signal.aborted || activationId !== activationCount) return;
      const activate = () => controller.activate({ route, activationId, signal, reason });
      if (reason === 'tab' || id === 'pulse') await router.runReplacing(activate); else await router.runWithoutPush(activate);
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
      status.error(id, FEATURE_NAVIGATION[id].label, error, () => {
        if (reloadForFreshModuleMap) win.location.reload();
        else void request(route, 'retry');
      });
    }
  };

  const initialRoute = router.parse();
  void request(initialRoute, 'bootstrap');

  const onNavigationClick = (event: Event) => {
    const anchor = event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>('a[data-feature-id]')
      : null;
    if (!anchor || !isEligiblePrimaryNavigationClick(event as MouseEvent, anchor, win.location.href)) return;
    const id = normalizeFeatureId(anchor.dataset.featureId);
    event.preventDefault();
    const destination = new URL(anchor.href, win.location.href);
    win.history.pushState(null, '', `${destination.pathname}${destination.search}${destination.hash}`);
    const route = router.parse();
    route.tab = id;
    void request(route, 'tab');
  };
  const onPopState = () => void request(router.parse(), 'popstate');
  doc.getElementById('primaryNavigation')?.addEventListener('click', onNavigationClick);
  win.addEventListener('popstate', onPopState);

  return async () => {
    disposed = true;
    abortController?.abort();
    doc.getElementById('primaryNavigation')?.removeEventListener('click', onNavigationClick);
    win.removeEventListener('popstate', onPopState);
    await activeController?.deactivate?.('pulse');
    await registry.dispose();
    ownerPreference?.dispose();
  };
}
