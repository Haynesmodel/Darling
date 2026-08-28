import './draft-spot.entry.css';
import { mountDraftSpot, unmountDraftSpot } from './draft-spot-controller';
import { registerDraftSpotTables } from './draft-spot-tables';
import type { AppContext } from '../../app/app-types';
import type { DarlingFeatureController, FeatureActivation } from '../../app/feature-contract';
import type { DraftLocation } from '../../data/generated/asset-types';
import { ownerOrNull } from '../../app/feature-utils';

function enabledLoreDraftLocations(context: AppContext): DraftLocation[] {
  const locations = context.data.leagueLore?.enabled ? context.data.leagueLore.draft_locations || [] : [];
  return locations.filter(location => location.enabled && Boolean(context.lore.entry(location.entry_id)));
}

export function createFeatureController(): DarlingFeatureController {
  let context: AppContext;
  let selected: Record<string, unknown> | null = null;
  let activeSignal: AbortSignal | null = null;

  const update = (next: any, signal = activeSignal) => {
    if (!signal || signal.aborted || signal !== activeSignal) return;
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
      selectedDraftLocation: next.selectedLocation,
    });
  };

  return {
    id: 'draft',
    mount(nextContext) {
      context = nextContext;
      registerDraftSpotTables(context.tables);
    },
    async activate(input: FeatureActivation) {
      const activationSignal = input.signal;
      activeSignal = activationSignal;
      const updateForActivation = (next: any) => update(next, activationSignal);
      if (input.reason !== 'tab' || !selected) {
        const explicit = Object.entries(input.route)
          .some(([key, value]) => key.startsWith('draft') && value !== null && value !== undefined);
        const favorite = !explicit ? context.ownerPreference.getSnapshot().owner : null;
        const availableLocations = enabledLoreDraftLocations(context);
        const requestedLocation = input.route.draftLocation;
        const selectedLocation = typeof requestedLocation === 'string' && availableLocations.some(location => location.id === requestedLocation)
          ? requestedLocation
          : null;
        selected = {
          owner: input.route.draftOwner || favorite,
          mode: input.route.draftMode || (input.route.draftOwner || favorite ? 'owner' : null),
          startSeason: input.route.draftStart,
          endSeason: input.route.draftEnd,
          metric: input.route.draftMetric,
          minSample: input.route.draftMinSample,
          normalize: input.route.draftNormalize,
          selectedPick: input.route.draftPick,
          selectedZone: input.route.draftZone,
          selectedLocation,
        };
        if (requestedLocation && !selectedLocation) {
          const canonical = context.router.update({ tab: 'draft', selectedDraftLocation: null });
          context.window.history.replaceState(null, '', canonical);
        }
      }
      const entry = context.data.manifest.assets.DraftSpot;
      const sourceHash = context.data.manifest.assets.SeasonSummary.sha256;
      if (!entry || !sourceHash) throw new Error('Draft Spot asset is not present in the data manifest');
      updateForActivation(selected);
      const mount = context.document.getElementById('draftSpotRoot');
      if (!mount) throw new Error('Draft Spot mount is missing');
      await mountDraftSpot({
        mount,
        assetPath: entry.path,
        assetSha256: entry.sha256,
        assetBytes: entry.bytes,
        sourceHash,
        dataVersion: context.data.dataVersion,
        state: selected,
        onStateChange: updateForActivation,
        onReady: updateForActivation,
        locations: enabledLoreDraftLocations(context),
        onRevealLocation: (entryId, opener) => { void context.lore.reveal('entry', entryId, { opener }); },
      });
    },
    deactivate() {
      activeSignal = null;
      unmountDraftSpot();
    },
    dispose() {
      unmountDraftSpot();
    },
  };
}
