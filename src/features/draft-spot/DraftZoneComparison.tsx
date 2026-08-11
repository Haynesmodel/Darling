import { DeferredChart } from '../../components/charts/DeferredChart';
import { DRAFT_METRICS, DRAFT_ZONES, draftMetricValue } from './draft-spot-model';
import { draftSummaryContext, formatMetric, formatNumber, formatPercent } from './draft-spot-format';
import type { DraftSpotState, DraftSpotViewModel } from './draft-spot-types';

export default function DraftZoneComparison({
  model,
  onChange,
}: {
  model: DraftSpotViewModel;
  onChange: (state: Partial<DraftSpotState>) => void;
}) {
  const rows = model.zoneSummary.map(summary => ({
    label: summary.zone,
    value: draftMetricValue(summary, model.state.metric),
    title: `${summary.zone}: ${formatMetric(draftMetricValue(summary, model.state.metric), model.state.metric)}, n=${summary.n}`,
  }));
  const byZone = new Map(model.zoneSummary.map(summary => [summary.zone_key, summary]));
  return (
    <>
      <DeferredChart
        class="draft-zone-chart"
        name="Zone Comparison"
        signature={`${model.state.metric}|${rows.map(row => `${row.label}:${row.value}`).join(',')}`}
        request={{ kind: 'draft-zones', data: {
          rows,
          yLabel: DRAFT_METRICS[model.state.metric].label,
          ariaLabel: `Draft zone comparison by ${DRAFT_METRICS[model.state.metric].label}`,
        } }}
      />
      <div class="draft-zone-grid" role="group" aria-label="Draft zones">
        {DRAFT_ZONES.map(zone => {
          const summary = byZone.get(zone.key);
          const selected = model.state.selectedZone === zone.key;
          const leader = model.rankedZones[0]?.zone_key === zone.key;
          return (
            <button
              type="button"
              data-draft-zone={zone.key}
              class={['draft-zone-card', selected ? 'selected' : '', leader ? 'top-zone' : ''].filter(Boolean).join(' ')}
              aria-pressed={selected}
              disabled={!summary}
              onClick={() => onChange({
                ...model.state,
                mode: 'zone',
                selectedPick: null,
                selectedZone: zone.key,
              })}
            >
              <span>{zone.label}</span>
              <strong>{summary ? formatMetric(draftMetricValue(summary, model.state.metric), model.state.metric) : '—'}</strong>
              <em>{summary ? `n=${summary.n} · ${draftSummaryContext(summary, model.state)} · avg finish ${formatNumber(summary.avg_finish)}` : 'No data'}</em>
              <small>{summary ? `${formatPercent(summary.playoff_rate)} playoff · ${formatPercent(summary.champion_rate)} title · ${formatPercent(summary.saunders_rate)} Saunders` : ''}</small>
            </button>
          );
        })}
      </div>
    </>
  );
}
