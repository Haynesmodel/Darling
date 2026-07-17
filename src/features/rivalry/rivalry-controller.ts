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
import { ALL_TEAMS, DEFAULT_TEAM } from '../../app/feature-utils';
import { registerRivalryTables } from './rivalry-tables';

function scope(value: unknown): string {
  return ['allTime', 'currentSeason', 'historic'].includes(String(value)) ? String(value) : 'allTime';
}

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let teamA = DEFAULT_TEAM;
  let teamB: string | null = null;
  let selectedScope = 'allTime';
  let active = false;

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
    renderRivalryLeadTrend(view, { doc: context.document });
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
    context.router.update({ tab: 'rivalry', selectedRivalryTeamA: teamA, selectedRivalryTeamB: teamB, selectedRivalryScope: selectedScope });
  };

  return {
    id: 'rivalry',
    mount(nextContext) {
      context = nextContext;
      registerRivalryTables(context.tables);
      const scopeSelect = context.document.getElementById('rivalryScopeSelect') as HTMLSelectElement | null;
      scopeSelect?.addEventListener('change', () => {
        if (!active) return;
        selectedScope = scope(scopeSelect.value);
        render();
      });
    },
    activate(input: FeatureActivation) {
      active = !input.signal.aborted;
      selectedScope = scope(input.route.rivalryScope || selectedScope);
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
      render();
    },
    deactivate() { active = false; },
  };
}
