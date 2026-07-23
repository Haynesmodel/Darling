import { useEffect, useRef } from 'preact/hooks';
import { DRAFT_METRICS, DRAFT_ZONES, draftMetricValue } from './draft-spot-model';
import { draftSummaryContext, formatMetric, formatNumber, formatPercent } from './draft-spot-format';
import type { DraftSpotState, DraftSpotViewModel } from './draft-spot-types';
import { renderDraftChartError } from './draft-chart-error';

export default function DraftZoneComparison({
  model,
  onChange,
}: {
  model: DraftSpotViewModel;
  onChange: (state: Partial<DraftSpotState>) => void;
}) {
  const chartHost = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void import('../../../js/charting/vendor/charting-vendor.js').then(({ plot, barY }) => {
      if (!active || !chartHost.current) return;
      const rows = model.zoneSummary.map(summary => ({
        zone: summary.zone,
        value: draftMetricValue(summary, model.state.metric),
        title: `${summary.zone}: ${formatMetric(draftMetricValue(summary, model.state.metric), model.state.metric)}, n=${summary.n}`,
      }));
      const svg = plot({
        height: 220,
        marginLeft: 56,
        x: { label: 'Draft zone' },
        y: { label: DRAFT_METRICS[model.state.metric].label },
        marks: [barY(rows, { x: 'zone', y: 'value', fill: 'var(--accent-primary)', title: 'title' })],
      });
      svg.setAttribute('aria-label', `Draft zone comparison by ${DRAFT_METRICS[model.state.metric].label}`);
      svg.setAttribute('role', 'img');
      chartHost.current.replaceChildren(svg);
      chartHost.current.dataset.chartState = 'ready';
    }).catch(error => {
      if (active && chartHost.current) renderDraftChartError(chartHost.current, error);
    });
    return () => {
      active = false;
      chartHost.current?.replaceChildren();
      if (chartHost.current) delete chartHost.current.dataset.chartState;
    };
  }, [model.state.metric, model.zoneSummary]);
  const byZone = new Map(model.zoneSummary.map(summary => [summary.zone_key, summary]));
  return (
    <>
      <div ref={chartHost} class="chart-host draft-zone-chart" />
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
