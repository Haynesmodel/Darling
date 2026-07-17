import './trophy.entry.css';
import { buildTrophyControls } from '../../../js/trophy-controls.js';
import {
  buildTrophyCaseViewModel,
  renderTrophyAchievementList,
  renderTrophyCareerShape,
  renderTrophyHardwareShelf,
  renderTrophyHero,
  renderTrophyRankStrip,
  renderTrophyScarList,
} from '../../../js/trophy-renderers.js';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { ALL_TEAMS, DEFAULT_TEAM } from '../../app/feature-utils';
import { registerTrophyTables } from './trophy-tables';

const NOTES: Record<string, { champs?: Record<number, string>; saunders?: Record<number, string> }> = {
  Cole: { champs: { 2012: 'Back-to-back complete.' } },
  Hayden: { saunders: { 2022: 'The Toilet Bowl Special.' } },
};

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let selectedOwner = DEFAULT_TEAM;
  let active = false;

  const render = () => {
    if (!active || !selectedOwner) return;
    context.header.feature(selectedOwner, selectedOwner, `${selectedOwner} Trophy Case`);
    context.theme.owner(selectedOwner);
    const view = buildTrophyCaseViewModel(selectedOwner, {
      leagueGames: context.data.leagueGames,
      seasonSummaries: context.data.seasonSummaries,
      weeklyAwards: context.data.derivedStats?.weekly_awards || context.selectors.weeklyAwards(),
      seasonAggregates: context.selectors.seasonAggregates(),
      ownerCareers: context.data.derivedStats?.owner_careers || null,
      champNoteFn: (owner: string, season: number) => NOTES[owner]?.champs?.[season] || null,
      saundersNoteFn: (owner: string, season: number) => NOTES[owner]?.saunders?.[season] || null,
    });
    renderTrophyHero(view, { doc: context.document });
    renderTrophyHardwareShelf(view, { doc: context.document });
    renderTrophyRankStrip(view, { doc: context.document });
    renderTrophyCareerShape(view, { doc: context.document });
    renderTrophyAchievementList(view, { doc: context.document });
    renderTrophyScarList(view, { doc: context.document });
    context.tables.render('trophy-seasons', {
      rows: view.seasonLedger,
      context: { owner: view.owner },
      onContextChange: tableContext => {
        selectedOwner = String(tableContext.owner || selectedOwner);
        const select = context.document.getElementById('trophyOwnerSelect') as HTMLSelectElement | null;
        if (select) select.value = selectedOwner;
        render();
      },
      instanceKey: view.owner,
    });
    context.router.update({ tab: 'trophy', selectedTrophyOwner: selectedOwner });
  };

  return {
    id: 'trophy',
    mount(nextContext) {
      context = nextContext;
      registerTrophyTables(context.tables);
    },
    activate(input: FeatureActivation) {
      active = !input.signal.aborted;
      const controls = buildTrophyControls({
        doc: context.document,
        leagueGames: context.data.leagueGames,
        seasonSummaries: context.data.seasonSummaries,
        selectedOwner: input.route.trophyOwner || input.route.team || selectedOwner,
        allTeams: ALL_TEAMS,
        onChange: (next: { selectedOwner: string }) => {
          if (!active) return;
          selectedOwner = next.selectedOwner;
          render();
        },
      });
      selectedOwner = controls.selectedOwner;
      render();
    },
    deactivate() { active = false; },
  };
}
