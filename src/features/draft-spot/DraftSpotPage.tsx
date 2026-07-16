import { useEffect, useMemo, useState } from 'preact/hooks';
import { buildDraftSpotModel } from './draft-spot-model';
import { draftStateForUrl } from './draft-spot-state';
import type {
  DraftSpotMountOptions,
  DraftSpotState,
  DraftSpotUrlState,
} from './draft-spot-types';
import type { DraftSpot } from '../../data/generated/asset-types';
import DraftSpotControls from './DraftSpotControls';
import DraftSpotHero from './DraftSpotHero';
import DraftPickBoard from './DraftPickBoard';
import DraftZoneComparison from './DraftZoneComparison';
import DraftOwnerRecommendations from './DraftOwnerRecommendations';
import DraftOwnerTimeline from './DraftOwnerTimeline';
import DraftSelectionDetail from './DraftSelectionDetail';

interface Props {
  asset: DraftSpot;
  requestedState?: Partial<DraftSpotState> & DraftSpotUrlState;
  dataVersion: string;
  onStateChange?: DraftSpotMountOptions['onStateChange'];
  onReady?: DraftSpotMountOptions['onReady'];
}

export default function DraftSpotPage({
  asset,
  requestedState,
  dataVersion,
  onStateChange,
  onReady,
}: Props) {
  const initial = useMemo(() => buildDraftSpotModel(asset, requestedState), [asset, requestedState]);
  const [state, setState] = useState(initial.state);
  const model = useMemo(() => buildDraftSpotModel(asset, state, state), [asset, state]);

  const update = (requested: Partial<DraftSpotState>) => {
    const next = buildDraftSpotModel(asset, requested, state).state;
    setState(next);
    onStateChange?.(next);
  };

  useEffect(() => {
    onReady?.(model.state);
  }, []);

  useEffect(() => {
    window.darlingTables?.render('draft-rows', {
      rows: model.rows,
      context: {
        owner: model.state.owner,
        draftMode: model.state.mode,
        draftStart: model.state.startSeason,
        draftEnd: model.state.endSeason,
      },
      urlState: draftStateForUrl(model.state),
      onContextChange: (context, urlState) => update({
        ...model.state,
        owner: typeof context.owner === 'string' ? context.owner : model.state.owner,
        mode: typeof context.draftMode === 'string' ? context.draftMode as DraftSpotState['mode'] : model.state.mode,
        startSeason: Number.isFinite(Number(context.draftStart)) ? Number(context.draftStart) : model.state.startSeason,
        endSeason: Number.isFinite(Number(context.draftEnd)) ? Number(context.draftEnd) : model.state.endSeason,
        ...(urlState as DraftSpotUrlState || {}),
      }),
      instanceKey: JSON.stringify(draftStateForUrl(model.state)),
    });
    return () => window.darlingTables?.unmount('draft-rows');
  }, [model.rows, model.state]);

  return (
    <>
      <div class="card">
        <DraftSpotControls model={model} onChange={update} />
      </div>
      <section class="card draft-hero" aria-labelledby="draftSpotTitle">
        <h2 id="draftSpotTitle" class="visually-hidden">Draft Spot Explorer</h2>
        <DraftSpotHero model={model} />
      </section>
      <section class="card" aria-label="Draft pick comparison">
        <DraftPickBoard model={model} onChange={update} />
      </section>
      <section class="card" aria-labelledby="draftZoneHeading">
        <h3 id="draftZoneHeading">Zone Comparison</h3>
        <DraftZoneComparison model={model} onChange={update} />
      </section>
      <section class="card" aria-labelledby="draftOwnerRecommendationHeading">
        <h3 id="draftOwnerRecommendationHeading">Owner Recommendations</h3>
        <p class="muted">Recommendations describe observed results and always disclose sample confidence.</p>
        <DraftOwnerRecommendations model={model} />
      </section>
      <section class="card" aria-labelledby="draftOwnerTimelineHeading">
        <h3 id="draftOwnerTimelineHeading">Owner Timeline</h3>
        <DraftOwnerTimeline model={model} onChange={update} />
      </section>
      <section class="card" aria-labelledby="draftSelectionHeading">
        <h3 id="draftSelectionHeading">Selection Detail</h3>
        <DraftSelectionDetail model={model} />
      </section>
      <section class="card" aria-labelledby="draftLedgerHeading">
        <div class="section-heading">
          <h3 id="draftLedgerHeading">Draft Spot Data</h3>
          <div class="muted">Data {dataVersion.replace(/^sha256:/, '').slice(0, 12)} · generated {asset.generated_at.slice(0, 10)}</div>
        </div>
        <div id="draftRowsTableRoot" />
      </section>
    </>
  );
}
