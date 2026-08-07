import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { buildDraftSpotModel } from './draft-spot-model';
import { draftStateForUrl } from './draft-spot-state';
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';
import {
  DRAFT_ALL_OWNERS,
  type DraftSummary,
  type DraftSpotMountOptions,
  type DraftSpotState,
  type DraftSpotUrlState,
  type DraftSpotViewModel,
} from './draft-spot-types';
import type { DraftSpot } from '../../data/generated/asset-types';
import DraftSpotControls from './DraftSpotControls';
import DraftSpotHero from './DraftSpotHero';
import DraftPickBoard from './DraftPickBoard';
import DraftZoneComparison from './DraftZoneComparison';
import DraftOwnerRecommendations from './DraftOwnerRecommendations';
import DraftOwnerTimeline from './DraftOwnerTimeline';
import DraftSelectionDetail from './DraftSelectionDetail';
import { buildUrlFromState } from '../../../js/state-helpers.js';
import { DRAFT_METRICS, draftMetricValue, draftPositionLabel } from './draft-spot-model';
import { formatMetric, formatNumber, formatPercent } from './draft-spot-format';
import {
  mountShareCardAction,
  type ShareCardActionController,
} from '../../share/share-card-actions';
import { buildFeatureShareCard } from '../../share/share-card-feature-adapters';
import type { ShareCardBuildResult, ShareCardMetric } from '../../share/share-card-types';

interface Props {
  asset: DraftSpot;
  requestedState?: Partial<DraftSpotState> & DraftSpotUrlState;
  dataVersion: string;
  onStateChange?: DraftSpotMountOptions['onStateChange'];
  onReady?: DraftSpotMountOptions['onReady'];
}

function DraftShareAction({ result }: { result: ShareCardBuildResult | null }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current || !result) return;
    const controller: ShareCardActionController = mountShareCardAction({
      host: host.current,
      result,
      label: 'Share Draft Spot card',
    });
    return () => controller.dispose();
  }, [result]);
  return <div ref={host} class="share-card-action-host" />;
}

export function buildDraftShareResult(
  model: DraftSpotViewModel,
  dataVersion: string,
  win: Window | null,
): ShareCardBuildResult | null {
  if (!win) return null;
  const incomplete = (): ShareCardBuildResult => ({
    ok: false,
    code: 'INCOMPLETE_DATA',
    message: 'Card unavailable.',
  });
  const validSummary = (summary: DraftSummary | null): summary is DraftSummary => Boolean(
    summary
    && Number.isInteger(summary.n)
    && summary.n > 0
    && Number.isFinite(summary.avg_finish)
    && Number.isFinite(summary.playoff_rate),
  );
  const title = model.hero.title;
  const subtitle = model.hero.subtitle;
  let altText = '';
  let metrics: ShareCardMetric[];

  if (model.state.mode === 'owner') {
    const profile = model.ownerProfile;
    const recommendation = profile?.recommendation;
    if (
      model.state.owner === DRAFT_ALL_OWNERS
      || !profile?.rows.length
      || !recommendation
      || recommendation.best_pick.n <= 0
      || recommendation.best_zone.n <= 0
      || !Number.isFinite(recommendation.best_pick.avg_finish)
      || !Number.isFinite(recommendation.best_zone.avg_finish)
    ) return incomplete();
    const fallback = recommendation.confidence === 'league-wide fallback';
    const confidence = fallback
      ? 'Fallback'
      : recommendation.confidence;
    metrics = [
      { label: 'Owner sample', value: `${profile.rows.length} seasons`, detail: `${model.state.startSeason}–${model.state.endSeason}` },
      { label: 'Best pick', value: recommendation.best_pick.label, detail: `Finish ${formatNumber(recommendation.best_pick.avg_finish)} · n=${recommendation.best_pick.n}` },
      { label: 'Best zone', value: recommendation.best_zone.label, detail: `Finish ${formatNumber(recommendation.best_zone.avg_finish)} · n=${recommendation.best_zone.n}` },
      { label: 'Confidence', value: confidence, detail: fallback ? 'League-wide history' : 'Owner-specific history' },
    ];
    altText = `${model.state.owner} Draft Spot profile from ${profile.rows.length} seasons. Best pick: ${recommendation.best_pick.label}. Best zone: ${recommendation.best_zone.label}.`;
  } else if (model.state.mode === 'pick') {
    const summary = model.selectedPickSummary;
    if (!model.state.selectedPick || !validSummary(summary) || summary.draft_pick !== model.state.selectedPick) return incomplete();
    const pick = draftPositionLabel(summary.draft_pick, model.state.normalize);
    metrics = [
      { label: 'Selected pick', value: pick, detail: `${summary.n} owner-seasons` },
      { label: 'Avg finish', value: formatNumber(summary.avg_finish), detail: `n=${summary.n}` },
      { label: 'Playoff rate', value: formatPercent(summary.playoff_rate), detail: `${summary.championships} titles` },
      { label: DRAFT_METRICS[model.state.metric].label, value: formatMetric(draftMetricValue(summary, model.state.metric), model.state.metric), detail: 'Selected pick result' },
    ];
    altText = `${pick} across ${summary.n} owner-seasons: average finish ${formatNumber(summary.avg_finish)}, playoff rate ${formatPercent(summary.playoff_rate)}.`;
  } else if (model.state.mode === 'zone') {
    const summary = model.selectedZoneSummary;
    if (!model.state.selectedZone || !validSummary(summary) || summary.zone_key !== model.state.selectedZone || !summary.zone) return incomplete();
    metrics = [
      { label: 'Selected zone', value: summary.zone, detail: `${summary.n} owner-seasons` },
      { label: 'Average pick', value: formatNumber(summary.avg_pick), detail: model.state.normalize === 'percentile' ? '12-team scale' : 'Raw draft slots' },
      { label: 'Avg finish', value: formatNumber(summary.avg_finish), detail: `Playoffs ${formatPercent(summary.playoff_rate)}` },
      { label: DRAFT_METRICS[model.state.metric].label, value: formatMetric(draftMetricValue(summary, model.state.metric), model.state.metric), detail: 'Selected zone result' },
    ];
    altText = `${summary.zone} Draft Spot across ${summary.n} owner-seasons: average pick ${formatNumber(summary.avg_pick)}, average finish ${formatNumber(summary.avg_finish)}, playoff rate ${formatPercent(summary.playoff_rate)}.`;
  } else {
    const bestAverage = model.hero.bestAvgPick;
    const bestPlayoff = model.hero.bestPlayoffPick;
    const metricLeader = model.rankedPicks[0] || null;
    if (!model.baseRows.length || !validSummary(bestAverage) || !validSummary(bestPlayoff) || !validSummary(metricLeader)) return incomplete();
    metrics = [
      { label: 'Owner-seasons', value: String(model.baseRows.length), detail: `${model.state.startSeason}–${model.state.endSeason}` },
      { label: 'Best avg finish', value: draftPositionLabel(bestAverage.draft_pick, model.state.normalize), detail: `Finish ${formatNumber(bestAverage.avg_finish)} · n=${bestAverage.n}` },
      { label: 'Best playoff path', value: draftPositionLabel(bestPlayoff.draft_pick, model.state.normalize), detail: `${formatPercent(bestPlayoff.playoff_rate)} · n=${bestPlayoff.n}` },
      { label: 'Metric leader', value: draftPositionLabel(metricLeader.draft_pick, model.state.normalize), detail: `${DRAFT_METRICS[model.state.metric].label}: ${formatMetric(draftMetricValue(metricLeader, model.state.metric), model.state.metric)}` },
    ];
    altText = `League Draft Spot analysis across ${model.baseRows.length} owner-seasons. Best average finish: ${draftPositionLabel(bestAverage.draft_pick, model.state.normalize)}. Best playoff path: ${draftPositionLabel(bestPlayoff.draft_pick, model.state.normalize)}.`;
  }
  const canonicalPath = buildUrlFromState({
    pathname: win.location.pathname,
    tab: 'draft',
    selectedDraftOwner: model.state.owner,
    selectedDraftMode: model.state.mode,
    selectedDraftStartSeason: model.state.startSeason,
    selectedDraftEndSeason: model.state.endSeason,
    selectedDraftMetric: model.state.metric,
    selectedDraftMinSample: model.state.minSample,
    selectedDraftNormalize: model.state.normalize,
    selectedDraftPick: model.state.selectedPick,
    selectedDraftZone: model.state.selectedZone,
  });
  return buildFeatureShareCard('draft', {
    id: [
      model.state.mode,
      model.state.owner,
      model.state.startSeason,
      model.state.endSeason,
      model.state.selectedPick || '',
      model.state.selectedZone || '',
    ].join('|'),
    eyebrow: 'Draft Spot Explorer',
    title,
    subtitle,
    metrics,
    canonicalPath,
    sourceLabel: 'Draft Spot',
    dataVersion,
    altText,
  }, win);
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
  const disclosure = useRef<SectionDisclosureController | null>(null);
  const disclosureNav = useRef<HTMLDivElement>(null);
  const pickDisclosure = useRef<HTMLDetailsElement>(null);
  const zoneDisclosure = useRef<HTMLDetailsElement>(null);
  const recommendationsDisclosure = useRef<HTMLDetailsElement>(null);
  const timelineDisclosure = useRef<HTMLDetailsElement>(null);
  const selectionDisclosure = useRef<HTMLDetailsElement>(null);
  const ledgerDisclosure = useRef<HTMLDetailsElement>(null);
  const disclosureSignature = [
    model.state.mode,
    model.state.owner,
    model.state.startSeason,
    model.state.endSeason,
    model.state.selectedPick || '',
    model.state.selectedZone || '',
  ].join('|');
  const shareResult = useMemo(
    () => buildDraftShareResult(model, dataVersion, typeof window === 'undefined' ? null : window),
    [dataVersion, disclosureSignature, model],
  );

  const update = (requested: Partial<DraftSpotState>) => {
    const next = buildDraftSpotModel(asset, requested, state).state;
    setState(next);
    onStateChange?.(next);
  };

  useEffect(() => {
    onReady?.(model.state);
  }, []);

  useEffect(() => {
    if (!disclosureNav.current) return;
    disclosure.current = createSectionDisclosure({
      doc: document,
      mount: disclosureNav.current,
      featureId: 'draft',
      featureLabel: 'Draft Spot',
    });
    return () => {
      disclosure.current?.dispose();
      disclosure.current = null;
    };
  }, []);

  useEffect(() => {
    const defaults = new Set<string>();
    if (model.state.mode === 'league') defaults.add('draft-picks');
    if (model.state.mode === 'owner') defaults.add('draft-owner-recommendations');
    if (model.state.mode === 'pick') {
      defaults.add('draft-picks');
      defaults.add('draft-selection');
    }
    if (model.state.mode === 'zone') {
      defaults.add('draft-zones');
      defaults.add('draft-selection');
    }
    const definitions = [
      { id: 'draft-picks', label: 'Pick Board', details: pickDisclosure.current, available: model.pickSummary.length > 0 },
      { id: 'draft-zones', label: 'Zone Comparison', details: zoneDisclosure.current, available: model.zoneSummary.length > 0 },
      { id: 'draft-owner-recommendations', label: 'Owner Recommendations', details: recommendationsDisclosure.current, available: model.ownerRecommendations.length > 0 || Boolean(model.ownerProfile) },
      { id: 'draft-owner-timeline', label: 'Owner Timeline', details: timelineDisclosure.current, available: model.baseRows.length > 0 },
      { id: 'draft-selection', label: 'Selection Detail', details: selectionDisclosure.current, available: Boolean(model.selectedPickSummary || model.selectedZoneSummary) },
      { id: 'draft-ledger', label: 'Draft Spot Data', details: ledgerDisclosure.current, available: model.rows.length > 0 },
    ];
    disclosure.current?.update({
      signature: disclosureSignature,
      preserveFocusedSection: true,
      sections: definitions.flatMap(definition => definition.details ? [{
        ...definition,
        details: definition.details,
        defaultOpen: defaults.has(definition.id),
      }] : []),
    });
  }, [disclosureSignature, model.pickSummary.length, model.zoneSummary.length, model.ownerRecommendations.length, model.baseRows.length, model.rows.length, model.selectedPickSummary, model.selectedZoneSummary, model.ownerProfile]);

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
        <DraftShareAction result={shareResult} />
      </section>
      <div ref={disclosureNav} />
      <details ref={pickDisclosure} id="draftPickDisclosure" class="card feature-disclosure">
        <summary>Pick Board</summary>
        <section class="feature-section-content" aria-label="Draft pick comparison">
          <DraftPickBoard model={model} onChange={update} />
        </section>
      </details>
      <details ref={zoneDisclosure} id="draftZoneDisclosure" class="card feature-disclosure">
        <summary>Zone Comparison</summary>
        <section class="feature-section-content" aria-labelledby="draftZoneHeading">
          <h3 id="draftZoneHeading" class="visually-hidden">Zone Comparison</h3>
          <DraftZoneComparison model={model} onChange={update} />
        </section>
      </details>
      <details ref={recommendationsDisclosure} id="draftOwnerRecommendationsDisclosure" class="card feature-disclosure">
        <summary>Owner Recommendations</summary>
        <section class="feature-section-content" aria-labelledby="draftOwnerRecommendationHeading">
          <h3 id="draftOwnerRecommendationHeading" class="visually-hidden">Owner Recommendations</h3>
          <p class="muted">Recommendations use only the selected season range, describe observed results, and always disclose sample confidence.</p>
          <DraftOwnerRecommendations model={model} />
        </section>
      </details>
      <details ref={timelineDisclosure} id="draftOwnerTimelineDisclosure" class="card feature-disclosure">
        <summary>Owner Timeline</summary>
        <section class="feature-section-content" aria-labelledby="draftOwnerTimelineHeading">
          <h3 id="draftOwnerTimelineHeading" class="visually-hidden">Owner Timeline</h3>
          <DraftOwnerTimeline model={model} onChange={update} />
        </section>
      </details>
      <details ref={selectionDisclosure} id="draftSelectionDisclosure" class="card feature-disclosure">
        <summary>Selection Detail</summary>
        <section class="feature-section-content" aria-labelledby="draftSelectionHeading">
          <h3 id="draftSelectionHeading" class="visually-hidden">Selection Detail</h3>
          <DraftSelectionDetail model={model} />
        </section>
      </details>
      <details ref={ledgerDisclosure} id="draftLedgerDisclosure" class="card feature-disclosure">
        <summary>Draft Spot Data</summary>
        <section class="feature-section-content" aria-labelledby="draftLedgerHeading">
          <div class="section-heading">
            <h3 id="draftLedgerHeading" class="visually-hidden">Draft Spot Data</h3>
            <div class="muted">Data {dataVersion.replace(/^sha256:/, '').slice(0, 12)} · generated {asset.generated_at.slice(0, 10)}</div>
          </div>
          <div id="draftRowsTableRoot" />
        </section>
      </details>
    </>
  );
}
