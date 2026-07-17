import './draft-spot.entry.css';
import { mountDraftSpot, unmountDraftSpot } from './draft-spot-controller';
import { registerDraftSpotTables } from './draft-spot-tables';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import { ownerOrNull } from '../../app/feature-utils';

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let selected: Record<string, unknown> = {};
  let activeSignal: AbortSignal | null = null;

  const update = (next: any) => {
    if (activeSignal?.aborted) return;
    selected = next;
    const owner = ownerOrNull(next.owner);
    context.header.feature(owner ? `${owner} Draft Spot` : 'Draft Spot Explorer', owner, owner ? `${owner} Draft Spot` : 'Draft Spot Explorer');
    context.theme.owner(owner);
    context.router.update({
      tab: 'draft',
      selectedDraftOwner: next.owner,
      selectedDraftMode: next.mode,
      selectedDraftStartSeason: next.startSeason,
      selectedDraftEndSeason: next.endSeason,
      selectedDraftMetric: next.metric,
      selectedDraftMinSample: next.minSample,
      selectedDraftNormalize: next.normalize,
      selectedDraftPick: next.selectedPick,
      selectedDraftZone: next.selectedZone,
    });
  };

  return {
    id: 'draft',
    mount(nextContext) {
      context = nextContext;
      registerDraftSpotTables(context.tables);
    },
    async activate(input: FeatureActivation) {
      activeSignal = input.signal;
      selected = {
        owner: input.route.draftOwner,
        mode: input.route.draftMode,
        startSeason: input.route.draftStart,
        endSeason: input.route.draftEnd,
        metric: input.route.draftMetric,
        minSample: input.route.draftMinSample,
        normalize: input.route.draftNormalize,
        selectedPick: input.route.draftPick,
        selectedZone: input.route.draftZone,
      };
      const entry = context.data.manifest.assets.DraftSpot;
      const sourceHash = context.data.manifest.assets.SeasonSummary.sha256;
      if (!entry || !sourceHash) throw new Error('Draft Spot asset is not present in the data manifest');
      update(selected);
      const mount = context.document.getElementById('draftSpotRoot');
      if (!mount) throw new Error('Draft Spot mount is missing');
      await mountDraftSpot({
        mount,
        assetPath: entry.path,
        sourceHash,
        dataVersion: context.data.dataVersion,
        state: selected,
        onStateChange: update,
        onReady: update,
      });
    },
    deactivate() {
      activeSignal = null;
    },
    dispose() {
      unmountDraftSpot();
    },
  };
}
