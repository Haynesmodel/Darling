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
import { ALL_TEAMS } from '../../app/feature-utils';
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';
import { registerTrophyTables } from './trophy-tables';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let selectedOwner = '';
  let initialized = false;
  let active = false;
  let disclosure: SectionDisclosureController | null = null;

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
    });
    renderTrophyHero(view, { doc: context.document });
    renderTrophyHardwareShelf(view, { doc: context.document });
    renderTrophyRankStrip(view, { doc: context.document });
    renderTrophyCareerShape(view, { doc: context.document, renderChart: false });
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
    const sections = [
      ['trophy-hardware', 'Hardware Shelf', 'trophyHardwareDisclosure', true, undefined],
      ['trophy-rank', 'League Rank', 'trophyRankDisclosure', false, undefined],
      ['trophy-career', 'Career Shape', 'trophyCareerDisclosure', false, () => renderTrophyCareerShape(view, { doc: context.document })],
      ['trophy-moments', 'Highlights and Low Points', 'trophyMomentsDisclosure', false, undefined],
      ['trophy-ledger', 'Season Ledger', 'trophyLedgerDisclosure', false, undefined],
    ] as const;
    disclosure?.update({
      signature: view.owner,
      sections: sections.flatMap(([id, label, detailsId, defaultOpen, onVisible]) => {
        const details = context.document.getElementById(detailsId) as HTMLDetailsElement | null;
        const content = details?.querySelector<HTMLElement>('.feature-section-content');
        return details ? [{ id, label, details, available: Boolean(content?.textContent?.trim()), defaultOpen, onVisible }] : [];
      }),
    });
    context.router.update({ tab: 'trophy', selectedTrophyOwner: selectedOwner });
  };

  return {
    id: 'trophy',
    mount(nextContext) {
      context = nextContext;
      registerTrophyTables(context.tables);
      const mount = context.document.getElementById('trophySectionNav');
      if (mount) {
        disclosure = createSectionDisclosure({
          doc: context.document,
          mount,
          featureId: 'trophy',
          featureLabel: 'Trophy Case',
        });
      }
    },
    activate(input: FeatureActivation) {
      active = !input.signal.aborted;
      const retained = input.reason === 'tab' && initialized ? selectedOwner : null;
      const controls = buildTrophyControls({
        doc: context.document,
        leagueGames: context.data.leagueGames,
        seasonSummaries: context.data.seasonSummaries,
        selectedOwner: input.route.trophyOwner || input.route.team || retained || context.ownerPreference.getSnapshot().owner,
        allTeams: ALL_TEAMS,
        onChange: (next: { selectedOwner: string }) => {
          if (!active) return;
          selectedOwner = next.selectedOwner;
          render();
        },
      });
      selectedOwner = controls.selectedOwner;
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
