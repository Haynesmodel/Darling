import { useEffect, useRef } from 'preact/hooks';
import { DRAFT_METRICS, draftMetricValue, draftPositionLabel } from './draft-spot-model';
import { draftSummaryContext, formatMetric, formatNumber, formatPercent } from './draft-spot-format';
import type { DraftSpotState, DraftSpotViewModel, DraftSummary } from './draft-spot-types';

function chartRows(model: DraftSpotViewModel) {
  return model.pickSummary.map(summary => ({
    pick: model.state.normalize === 'percentile' ? `S${summary.draft_pick}` : `P${summary.draft_pick}`,
    value: draftMetricValue(summary, model.state.metric),
    title: `${draftPositionLabel(summary.draft_pick, model.state.normalize)}: ${formatMetric(draftMetricValue(summary, model.state.metric), model.state.metric)}, n=${summary.n}`,
  }));
}

function usePickChart(model: DraftSpotViewModel, host: { current: HTMLDivElement | null }) {
  useEffect(() => {
    let active = true;
    void import('../../../js/charting/vendor/charting-vendor.js').then(({ Plot }) => {
      if (!active || !host.current) return;
      const rows = chartRows(model);
      const svg = Plot.plot({
        height: 240,
        marginLeft: 48,
        x: { label: model.state.normalize === 'percentile' ? 'Normalized draft slot (12-team scale)' : 'Draft pick' },
        y: { label: DRAFT_METRICS[model.state.metric].label },
        marks: [
          Plot.barY(rows, { x: 'pick', y: 'value', fill: 'var(--accent-primary)', title: 'title' }),
        ],
      });
      svg.setAttribute('aria-label', `${model.state.normalize === 'percentile' ? 'Normalized draft slot' : 'Draft pick'} comparison by ${DRAFT_METRICS[model.state.metric].label}`);
      svg.setAttribute('role', 'img');
      host.current.replaceChildren(svg);
    });
    return () => {
      active = false;
      host.current?.replaceChildren();
    };
  }, [model.state.metric, model.state.normalize, model.pickSummary]);
}

function nearestSpatialButton(
  buttons: HTMLButtonElement[],
  current: HTMLButtonElement,
  direction: 'up' | 'down',
): HTMLButtonElement | null {
  const currentBox = current.getBoundingClientRect();
  const candidates = buttons.filter(button => {
    const box = button.getBoundingClientRect();
    return direction === 'up' ? box.bottom <= currentBox.top + 2 : box.top >= currentBox.bottom - 2;
  });
  return candidates.sort((a, b) => {
    const aBox = a.getBoundingClientRect();
    const bBox = b.getBoundingClientRect();
    const aVertical = Math.abs((aBox.top + aBox.bottom) / 2 - (currentBox.top + currentBox.bottom) / 2);
    const bVertical = Math.abs((bBox.top + bBox.bottom) / 2 - (currentBox.top + currentBox.bottom) / 2);
    const aHorizontal = Math.abs((aBox.left + aBox.right) / 2 - (currentBox.left + currentBox.right) / 2);
    const bHorizontal = Math.abs((bBox.left + bBox.right) / 2 - (currentBox.left + currentBox.right) / 2);
    return aVertical - bVertical || aHorizontal - bHorizontal;
  })[0] || null;
}

interface Props {
  model: DraftSpotViewModel;
  onChange: (state: Partial<DraftSpotState>) => void;
}

export default function DraftPickBoard({ model, onChange }: Props) {
  const chartHost = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  usePickChart(model, chartHost);
  const summaryByPick = new Map(model.pickSummary.map(summary => [summary.draft_pick, summary]));
  const maxPick = Math.max(12, ...model.picks);
  const availableButtons = () => buttonRefs.current.filter(
    (button): button is HTMLButtonElement => Boolean(button?.isConnected),
  );

  const handleKeyDown = (event: KeyboardEvent, button: HTMLButtonElement) => {
    const buttons = availableButtons();
    const index = buttons.indexOf(button);
    let target: HTMLButtonElement | null = null;
    if (event.key === 'ArrowLeft') target = buttons[(index - 1 + buttons.length) % buttons.length] || null;
    if (event.key === 'ArrowRight') target = buttons[(index + 1) % buttons.length] || null;
    if (event.key === 'ArrowUp') target = nearestSpatialButton(buttons, button, 'up') || buttons.at(-1) || null;
    if (event.key === 'ArrowDown') target = nearestSpatialButton(buttons, button, 'down') || buttons[0] || null;
    if (event.key === 'Home') target = buttons[0] || null;
    if (event.key === 'End') target = buttons.at(-1) || null;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  const intensity = (summary: DraftSummary) => {
    const values = model.pickSummary.map(row => draftMetricValue(row, model.state.metric));
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    if (minimum === maximum) return 0.58;
    const normalized = (draftMetricValue(summary, model.state.metric) - minimum) / (maximum - minimum);
    return DRAFT_METRICS[model.state.metric].lowerIsBetter ? 1 - normalized : normalized;
  };

  return (
    <>
      <div class="section-heading">
        <h3>Pick Board</h3>
        <div class="muted">{DRAFT_METRICS[model.state.metric].label} with visible sample sizes. {model.state.normalize === 'percentile' ? 'Slots use a normalized 12-team scale. ' : ''}Arrow keys move through available positions.</div>
      </div>
      <div ref={chartHost} class="chart-host draft-pick-chart" />
      <div class="draft-pick-board" role="group" aria-label="Draft picks">
        {Array.from({ length: maxPick }, (_, index) => index + 1).map(pick => {
          const summary = summaryByPick.get(pick);
          const positionLabel = draftPositionLabel(pick, model.state.normalize);
          if (!summary) {
            return (
              <div class="draft-pick-card empty" aria-label={`${positionLabel}: no data`}>
                <span class="draft-pick-number">{positionLabel}</span>
                <span class="draft-pick-note">No data</span>
              </div>
            );
          }
          const selected = model.state.selectedPick === pick;
          const lowSample = summary.n < model.state.minSample;
          return (
            <button
              ref={element => {
                buttonRefs.current[pick] = element;
              }}
              type="button"
              data-draft-pick={pick}
              class={[
                'draft-pick-card',
                selected ? 'selected' : '',
                summary.championships ? 'has-title' : '',
                lowSample ? 'low-sample' : '',
              ].filter(Boolean).join(' ')}
              aria-pressed={selected}
              aria-label={`${positionLabel}: ${formatMetric(draftMetricValue(summary, model.state.metric), model.state.metric)}, sample ${summary.n}${lowSample ? ', low sample' : ''}`}
              style={{ '--draft-intensity': intensity(summary) } as Record<string, number>}
              onKeyDown={event => handleKeyDown(event, event.currentTarget)}
              onClick={() => onChange({
                ...model.state,
                mode: 'pick',
                selectedPick: pick,
                selectedZone: null,
              })}
            >
              <span class="draft-pick-top">
                <span class="draft-pick-number">{positionLabel}</span>
                <span class="draft-sample">n={summary.n}</span>
              </span>
              <strong>{formatMetric(draftMetricValue(summary, model.state.metric), model.state.metric)}</strong>
              <span>Avg finish {formatNumber(summary.avg_finish)}</span>
              {model.state.normalize === 'percentile' ? <span>{draftSummaryContext(summary, model.state)}</span> : null}
              <span>{formatPercent(summary.playoff_rate)} playoff · {summary.championships} titles</span>
              <span>{summary.saunders_count} Saunders</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
