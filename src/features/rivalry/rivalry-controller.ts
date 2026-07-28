import './rivalry.entry.css';
import { buildRivalryControls } from '../../../js/rivalry-controls.js';
import { latestLeagueSeason } from '../../../js/current-season-data.js';
import {
  buildRivalryViewModel,
  renderRivalryHighlightBoard,
  renderRivalryHeadline,
  renderRivalryLeadMeter,
  renderRivalryLeadTrend,
  renderRivalryTape,
  renderRivalryTimeline,
} from '../../../js/rivalry-renderers.js';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { ALL_TEAMS } from '../../app/feature-utils';
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';
import { registerRivalryTables } from './rivalry-tables';

function scope(value: unknown): string {
  return ['allTime', 'currentSeason', 'historic'].includes(String(value)) ? String(value) : 'allTime';
}

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let teamA = '';
  let teamB: string | null = null;
  let selectedScope = 'allTime';
  let active = false;
  let initialized = false;
  let disclosure: SectionDisclosureController | null = null;

  const render = () => {
    if (!active || !teamA || !teamB) return;
    const year = latestLeagueSeason(context.data.leagueGames, context.data.seasonSummaries, context.data.currentSeason);
    const view = buildRivalryViewModel(teamA, teamB, context.data.leagueGames, { scope: selectedScope, currentSeason: year });
    context.header.feature(teamA, teamA, `${teamA} vs ${teamB} — Head to Head`);
    context.theme.rivalry(teamA, teamB);
    renderRivalryHeadline(view, { doc: context.document });
    renderRivalryLeadMeter(view, { doc: context.document });
    renderRivalryHighlightBoard(view, { doc: context.document });
    renderRivalryTape(view, { doc: context.document });
    renderRivalryLeadTrend(view, { doc: context.document, renderChart: false });
    renderRivalryTimeline(view, { doc: context.document });
    const onContextChange = (tableContext: Record<string, unknown>) => {
      teamA = String(tableContext.rivalryA || teamA);
      teamB = String(tableContext.rivalryB || teamB);
      const teamASelect = context.document.getElementById('rivalryTeamA') as HTMLSelectElement | null;
      const teamBSelect = context.document.getElementById('rivalryTeamB') as HTMLSelectElement | null;
      if (teamASelect) teamASelect.value = teamA;
      if (teamBSelect) teamBSelect.value = teamB;
      render();
    };
    context.tables.render('rivalry-seasons', { rows: view.seasonRows, context: { rivalryA: view.teamA, rivalryB: view.teamB }, onContextChange, instanceKey: `${view.teamA}|${view.teamB}|${view.scope}` });
    context.tables.render('rivalry-games', { rows: view.gameRows, context: { rivalryA: view.teamA, rivalryB: view.teamB }, onContextChange, instanceKey: `${view.teamA}|${view.teamB}|${view.scope}` });
    const available = view.gameRows.length > 0;
    const sections = [
      ['rivalry-lead', 'Series Lead', 'rivalryLeadDisclosure', true, undefined],
      ['rivalry-highlights', 'Highlights', 'rivalryHighlightsDisclosure', true, undefined],
      ['rivalry-tape', 'Tale of the Tape', 'rivalryTapeDisclosure', false, undefined],
      ['rivalry-trend', 'Lead Trend', 'rivalryTrendDisclosure', false, () => renderRivalryLeadTrend(view, { doc: context.document })],
      ['rivalry-timeline', 'Timeline', 'rivalryTimelineDisclosure', false, undefined],
      ['rivalry-seasons', 'Season Breakdown', 'rivalrySeasonsDisclosure', false, undefined],
      ['rivalry-games', 'Game Log', 'rivalryGamesDisclosure', false, undefined],
    ] as const;
    disclosure?.update({
      signature: `${view.teamA}|${view.teamB}|${view.scope}`,
      sections: sections.flatMap(([id, label, detailsId, defaultOpen, onVisible]) => {
        const details = context.document.getElementById(detailsId) as HTMLDetailsElement | null;
        return details ? [{ id, label, details, available, defaultOpen, onVisible }] : [];
      }),
    });
    context.router.update({ tab: 'rivalry', selectedRivalryTeamA: teamA, selectedRivalryTeamB: teamB, selectedRivalryScope: selectedScope });
  };

  return {
    id: 'rivalry',
    mount(nextContext) {
      context = nextContext;
      registerRivalryTables(context.tables);
      const mount = context.document.getElementById('rivalrySectionNav');
      if (mount) {
        disclosure = createSectionDisclosure({
          doc: context.document,
          mount,
          featureId: 'rivalry',
          featureLabel: 'Head to Head',
        });
      }
      const scopeSelect = context.document.getElementById('rivalryScopeSelect') as HTMLSelectElement | null;
      scopeSelect?.addEventListener('change', () => {
        if (!active) return;
        selectedScope = scope(scopeSelect.value);
        render();
      });
    },
    activate(input: FeatureActivation) {
      active = !input.signal.aborted;
      const preserveState = input.reason === 'tab' && initialized;
      if (!preserveState) {
        const historyTeam = input.route.team && input.route.team !== ALL_TEAMS ? input.route.team : null;
        teamA = input.route.rivalryTeamA
          || historyTeam
          || context.ownerPreference.getSnapshot().owner
          || context.ownerPreference.validOwners()[0]
          || '';
        teamB = input.route.rivalryTeamB || null;
        selectedScope = scope(input.route.rivalryScope || 'allTime');
      }
      const scopeSelect = context.document.getElementById('rivalryScopeSelect') as HTMLSelectElement | null;
      if (scopeSelect) scopeSelect.value = selectedScope;
      const built = buildRivalryControls({
        doc: context.document,
        leagueGames: context.data.leagueGames,
        seasonSummaries: context.data.seasonSummaries,
        rivalries: context.data.rivalries,
        selectedTeamA: input.route.rivalryTeamA || teamA,
        selectedTeamB: input.route.rivalryTeamB || teamB,
        allTeams: ALL_TEAMS,
        onChange: (next: { selectedTeamA: string; selectedTeamB: string }) => {
          if (!active) return;
          teamA = next.selectedTeamA;
          teamB = next.selectedTeamB;
          render();
        },
      });
      teamA = built.selectedTeamA;
      teamB = built.selectedTeamB;
      initialized = true;
      render();
    },
    deactivate() { active = false; },
    dispose() {
      disclosure?.dispose();
      disclosure = null;
    },
  };
}
