import './trophy.entry.css';
import { h, render } from 'preact';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';
import type { ShareCardActionController } from '../../share/share-card-actions';
import { mountTrophyCard } from '../../share/share-card-feature-adapters';
import { TrophyPage } from './TrophyPage';
import { buildTrophyCaseViewModel } from './trophy-model';
import { registerTrophyTables } from './trophy-tables';

function availableOwners(context: AppContext): string[] {
  return [...new Set([
    ...context.data.seasonSummaries.map(row => row.owner),
    ...context.data.leagueGames.flatMap(game => [game.teamA, game.teamB]),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let root: HTMLElement | null = null;
  let selectedOwner = '';
  let owners: string[] = [];
  let availableSections: Set<string> | undefined;
  let activeSignal: AbortSignal | null = null;
  let initialized = false;
  let disclosure: SectionDisclosureController | null = null;
  let shareAction: ShareCardActionController | null = null;

  const isActive = () => Boolean(activeSignal && !activeSignal.aborted);
  const renderCurrent = (allowInactive = false) => {
    const active = isActive();
    if (!root || !selectedOwner || (!active && !allowInactive)) return;
    const view = buildTrophyCaseViewModel(selectedOwner, {
      leagueGames: context.data.leagueGames,
      seasonSummaries: context.data.seasonSummaries,
      weeklyAwards: context.data.derivedStats?.weekly_awards || context.selectors.weeklyAwards(),
      seasonAggregates: context.selectors.seasonAggregates(),
      ownerCareers: context.data.derivedStats?.owner_careers || null,
    });
    render(h(TrophyPage, {
      view,
      owners,
      availableSections,
      active,
      onOwnerChange(owner: string) {
        if (!isActive() || !owners.includes(owner)) return;
        selectedOwner = owner;
        renderCurrent();
      },
    }), root);
    if (!active) return;
    if (!disclosure) {
      const mount = context.document.getElementById('trophySectionNav');
      if (mount) disclosure = createSectionDisclosure({ doc: context.document, mount, featureId: 'trophy', featureLabel: 'Trophy Case' });
    }
    context.tables.render('trophy-seasons', {
      rows: view.seasonLedger,
      context: { owner: view.owner },
      onContextChange: tableContext => {
        if (typeof tableContext.owner === 'string' && owners.includes(tableContext.owner)) {
          selectedOwner = tableContext.owner;
          renderCurrent();
        }
      },
      instanceKey: view.owner,
    });
    const sections = [
      ['trophy-hardware', 'Hardware Shelf', 'trophyHardwareDisclosure', true],
      ['trophy-rank', 'League Rank', 'trophyRankDisclosure', false],
      ['trophy-career', 'Career Shape', 'trophyCareerDisclosure', false],
      ['trophy-moments', 'Highlights and Low Points', 'trophyMomentsDisclosure', false],
      ['trophy-ledger', 'Season Ledger', 'trophyLedgerDisclosure', false],
    ] as const;
    disclosure?.update({
      signature: view.owner,
      sections: sections.flatMap(([id, label, detailsId, defaultOpen]) => {
        const details = context.document.getElementById(detailsId) as HTMLDetailsElement | null;
        const content = details?.querySelector<HTMLElement>('.feature-section-content');
        return details ? [{ id, label, details, available: Boolean(content?.textContent?.trim()), defaultOpen }] : [];
      }),
    });
    context.header.feature(selectedOwner, selectedOwner, `${selectedOwner} Trophy Case`);
    context.theme.owner(selectedOwner);
    const canonicalPath = context.router.update({ tab: 'trophy', selectedTrophyOwner: selectedOwner });
    shareAction?.dispose();
    shareAction = mountTrophyCard(context.document.getElementById('trophyShareCard'), view, canonicalPath, context.data.dataVersion, context.window);
  };

  return {
    id: 'trophy',
    mount(nextContext) {
      context = nextContext;
      root = context.document.getElementById('trophyRoot');
      if (!root) throw new Error('Trophy Case root missing');
      owners = availableOwners(context);
      availableSections = new Set(['trophySectionNav', 'trophyHardwareDisclosure', 'trophyRankDisclosure', 'trophyCareerDisclosure', 'trophyMomentsDisclosure', 'trophyLedgerDisclosure'].filter(id => Boolean(context.document.getElementById(id))));
      registerTrophyTables(context.tables);
    },
    activate(input: FeatureActivation) {
      activeSignal = input.signal;
      if (input.signal.aborted) return;
      const retained = input.reason === 'tab' && initialized ? selectedOwner : null;
      selectedOwner = input.route.trophyOwner || input.route.team || retained || context.ownerPreference.getSnapshot().owner || owners[0] || '';
      if (!owners.includes(selectedOwner)) selectedOwner = owners[0] || '';
      initialized = true;
      renderCurrent();
    },
    deactivate() {
      activeSignal = null;
      renderCurrent(true);
      shareAction?.dispose();
      shareAction = null;
    },
    dispose() {
      activeSignal = null;
      shareAction?.dispose();
      shareAction = null;
      disclosure?.dispose();
      disclosure = null;
      context.tables.unmount('trophy-seasons');
      if (root) render(null, root);
      root = null;
    },
  };
}
