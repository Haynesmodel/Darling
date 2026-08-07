import './rivalry.entry.css';
import { h, render } from 'preact';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { ALL_TEAMS } from '../../app/feature-utils';
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';
import type { ShareCardActionController } from '../../share/share-card-actions';
import { mountRivalryCard } from '../../share/share-card-feature-adapters';
import { RivalryPage } from './RivalryPage';
import { buildRivalryViewModel, latestRivalrySeason } from './rivalry-model';
import { availableRivalryTeams, buildPairOptions, normalizeRivalryScope, resolveRivalryState } from './rivalry-state';
import { registerRivalryTables } from './rivalry-tables';
import type { RivalryGame, RivalryState, RivalryViewModel } from './rivalry-types';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let root: HTMLElement | null = null;
  let state: RivalryState = { teamA: '', teamB: '', scope: 'allTime' };
  let teams: string[] = [];
  let currentSeason: number | null = null;
  let activeSignal: AbortSignal | null = null;
  let initialized = false;
  let disclosure: SectionDisclosureController | null = null;
  let shareAction: ShareCardActionController | null = null;

  const isActive = () => Boolean(activeSignal && !activeSignal.aborted);
  const ensureDisclosure = () => {
    if (disclosure) return;
    const mount = context.document.getElementById('rivalrySectionNav');
    if (!mount) return;
    disclosure = createSectionDisclosure({
      doc: context.document,
      mount,
      featureId: 'rivalry',
      featureLabel: 'Head to Head',
    });
  };

  const renderCurrent = (manageResources = true) => {
    if (!root || !state.teamA || !state.teamB) return;
    const model = buildRivalryViewModel(state.teamA, state.teamB, context.data.leagueGames as RivalryGame[], {
      scope: state.scope,
      currentSeason,
    });
    shareAction?.dispose();
    shareAction = null;
    render(h(RivalryPage, {
      state,
      teams,
      model,
      active: isActive(),
      onChange(next: RivalryState) {
        if (!isActive()) return;
        state = resolveRivalryState(teams, buildPairOptions(context.data.rivalries), {
          ...next,
          scope: normalizeRivalryScope(next.scope),
        });
        renderCurrent();
      },
    }), root);
    if (!manageResources) return;
    ensureDisclosure();
    updateOwnedResources(model);
  };

  const updateOwnedResources = (model: RivalryViewModel) => {
    const instanceKey = `${model.teamA}|${model.teamB}|${model.scope}`;
    const onContextChange = (tableContext: Record<string, unknown>) => {
      if (!isActive()) return;
      state = resolveRivalryState(teams, buildPairOptions(context.data.rivalries), {
        ...state,
        teamA: typeof tableContext.rivalryA === 'string' ? tableContext.rivalryA : state.teamA,
        teamB: typeof tableContext.rivalryB === 'string' ? tableContext.rivalryB : state.teamB,
      });
      renderCurrent();
    };
    context.tables.render('rivalry-seasons', {
      rows: model.seasonRows,
      context: { rivalryA: model.teamA, rivalryB: model.teamB },
      onContextChange,
      instanceKey,
    });
    context.tables.render('rivalry-games', {
      rows: model.gameRows,
      context: { rivalryA: model.teamA, rivalryB: model.teamB },
      onContextChange,
      instanceKey,
    });
    const available = model.gameRows.length > 0;
    const sections = [
      ['rivalry-lead', 'Series Lead', 'rivalryLeadDisclosure', true],
      ['rivalry-highlights', 'Highlights', 'rivalryHighlightsDisclosure', true],
      ['rivalry-tape', 'Tale of the Tape', 'rivalryTapeDisclosure', false],
      ['rivalry-trend', 'Lead Trend', 'rivalryTrendDisclosure', false],
      ['rivalry-timeline', 'Timeline', 'rivalryTimelineDisclosure', false],
      ['rivalry-seasons', 'Season Breakdown', 'rivalrySeasonsDisclosure', false],
      ['rivalry-games', 'Game Log', 'rivalryGamesDisclosure', false],
    ] as const;
    disclosure?.update({
      signature: instanceKey,
      sections: sections.flatMap(([id, label, detailsId, defaultOpen]) => {
        const details = context.document.getElementById(detailsId);
        return details ? [{ id, label, details: details as HTMLDetailsElement, available, defaultOpen }] : [];
      }),
    });
    context.header.feature(model.teamA, model.teamA, `${model.teamA} vs ${model.teamB} — Head to Head`);
    context.theme.rivalry(model.teamA, model.teamB);
    const canonicalPath = context.router.update({
      tab: 'rivalry',
      selectedRivalryTeamA: model.teamA,
      selectedRivalryTeamB: model.teamB,
      selectedRivalryScope: model.scope,
    });
    shareAction = mountRivalryCard(
      context.document.getElementById('rivalryShareCard'),
      model,
      canonicalPath,
      context.data.dataVersion,
      context.window,
    );
  };

  return {
    id: 'rivalry',
    mount(nextContext) {
      context = nextContext;
      root = context.document.getElementById('rivalryRoot');
      if (!root) throw new Error('Head to Head root missing');
      registerRivalryTables(context.tables);
      teams = availableRivalryTeams(context.data.seasonSummaries, context.data.leagueGames as RivalryGame[]);
      currentSeason = latestRivalrySeason(
        context.data.leagueGames as RivalryGame[],
        context.data.seasonSummaries.map(row => row.season),
        context.data.currentSeason?.season || null,
      );
    },
    activate(input: FeatureActivation) {
      activeSignal = input.signal;
      if (input.signal.aborted) return;
      const preserveState = input.reason === 'tab' && initialized;
      if (!preserveState) {
        const historyTeam = input.route.team && input.route.team !== ALL_TEAMS ? input.route.team : null;
        state = resolveRivalryState(teams, buildPairOptions(context.data.rivalries), {
          teamA: input.route.rivalryTeamA || historyTeam || context.ownerPreference.getSnapshot().owner || teams[0] || '',
          teamB: input.route.rivalryTeamB || '',
          scope: normalizeRivalryScope(input.route.rivalryScope),
        });
      }
      initialized = true;
      if (input.signal.aborted || activeSignal !== input.signal) return;
      renderCurrent();
    },
    deactivate() {
      activeSignal = null;
      shareAction?.dispose();
      shareAction = null;
      renderCurrent(false);
    },
    dispose() {
      activeSignal = null;
      shareAction?.dispose();
      shareAction = null;
      disclosure?.dispose();
      disclosure = null;
      context.tables.unmount('rivalry-seasons');
      context.tables.unmount('rivalry-games');
      if (root) render(null, root);
      root = null;
    },
  };
}
