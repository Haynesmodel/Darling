import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { buildDraftSpotModel } from './draft-spot-model';
import { draftStateForUrl } from './draft-spot-state';
import { createSectionDisclosure, type SectionDisclosureController } from '../../app/section-disclosure';
import type {
  DraftSpotMountOptions,
  DraftSpotState,
  DraftSpotUrlState,
  DraftSpotViewModel,
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
import { DRAFT_METRICS, draftPositionLabel } from './draft-spot-model';
import { formatNumber, formatPercent } from './draft-spot-format';
import {
  mountShareCardAction,
  type ShareCardActionController,
} from '../../share/share-card-actions';
import { buildFeatureShareCard } from '../../share/share-card-feature-adapters';
import type { ShareCardBuildResult } from '../../share/share-card-types';

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
  const bestAverage = model.hero.bestAvgPick;
  const bestPlayoff = model.hero.bestPlayoffPick;
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
    title: model.hero.title,
    subtitle: model.hero.subtitle,
    metrics: [
      {
        label: 'Sample',
        value: `${model.baseRows.length} owner-seasons`,
        detail: `${model.state.startSeason}–${model.state.endSeason}`,
      },
      {
        label: 'Best avg finish',
        value: bestAverage ? draftPositionLabel(bestAverage.draft_pick, model.state.normalize) : '—',
        detail: bestAverage ? `Finish ${formatNumber(bestAverage.avg_finish)} · n=${bestAverage.n}` : undefined,
      },
      {
        label: 'Best playoff path',
        value: bestPlayoff ? draftPositionLabel(bestPlayoff.draft_pick, model.state.normalize) : '—',
        detail: bestPlayoff ? `${formatPercent(bestPlayoff.playoff_rate)} · n=${bestPlayoff.n}` : undefined,
      },
      {
        label: 'Selected metric',
        value: DRAFT_METRICS[model.state.metric].label,
        detail: `${model.state.mode} view`,
      },
    ],
    canonicalPath,
    sourceLabel: 'Draft Spot',
    dataVersion,
    altText: `${model.hero.title}. ${model.baseRows.length} owner-seasons from ${model.state.startSeason} through ${model.state.endSeason}. ${model.hero.read}`,
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
  const [visibleCharts, setVisibleCharts] = useState<Set<string>>(() => new Set());
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
    setVisibleCharts(new Set());
    const revealChart = (id: string) => {
      setVisibleCharts(current => current.has(id) ? current : new Set([...current, id]));
    };
    const definitions = [
      { id: 'draft-picks', label: 'Pick Board', details: pickDisclosure.current, available: model.pickSummary.length > 0, onVisible: () => revealChart('draft-picks') },
      { id: 'draft-zones', label: 'Zone Comparison', details: zoneDisclosure.current, available: model.zoneSummary.length > 0, onVisible: () => revealChart('draft-zones') },
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
          <DraftPickBoard model={model} onChange={update} chartActive={visibleCharts.has('draft-picks')} />
        </section>
      </details>
      <details ref={zoneDisclosure} id="draftZoneDisclosure" class="card feature-disclosure">
        <summary>Zone Comparison</summary>
        <section class="feature-section-content" aria-labelledby="draftZoneHeading">
          <h3 id="draftZoneHeading" class="visually-hidden">Zone Comparison</h3>
          <DraftZoneComparison model={model} onChange={update} chartActive={visibleCharts.has('draft-zones')} />
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
