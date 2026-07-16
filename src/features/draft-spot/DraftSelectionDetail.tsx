import { outcomeLabel } from './draft-spot-format';
import { DRAFT_ZONES, draftPositionLabel } from './draft-spot-model';
import type { DraftSpotViewModel } from './draft-spot-types';

export default function DraftSelectionDetail({ model }: { model: DraftSpotViewModel }) {
  const rows = model.detailRows;
  if (!model.state.selectedPick && !model.state.selectedZone) {
    return <p class="muted">Select a pick or zone to inspect the receipts.</p>;
  }
  const label = model.state.selectedPick
    ? draftPositionLabel(model.state.selectedPick, model.state.normalize)
    : DRAFT_ZONES.find(zone => zone.key === model.state.selectedZone)?.label || 'Selected zone';
  const best = rows.slice().sort((a, b) => a.finish - b.finish || b.points_for - a.points_for)[0];
  const worst = rows.slice().sort((a, b) => b.finish - a.finish || a.points_for - b.points_for)[0];
  const champions = rows.filter(row => row.champion);
  const saunders = rows.filter(row => row.saunders);
  const topThree = rows.filter(row => row.top_three);
  return (
    <div class="draft-detail">
      <div class="draft-detail-summary">
        <div>
          <span>Selection</span>
          <strong>{label}</strong>
          <em>{rows.length} matching owner-seasons</em>
        </div>
        <div>
          <span>Best result</span>
          <strong>{best ? `${best.owner} ${best.season}` : '—'}</strong>
          <em>{best ? `Finish ${best.finish} · ${outcomeLabel(best)}` : '—'}</em>
        </div>
        <div>
          <span>Worst result</span>
          <strong>{worst ? `${worst.owner} ${worst.season}` : '—'}</strong>
          <em>{worst ? `Finish ${worst.finish} · ${outcomeLabel(worst)}` : '—'}</em>
        </div>
      </div>
      <div class="draft-receipts" aria-label="Draft result receipts">
        <span>Champions: {champions.length ? champions.map(row => `${row.owner} ${row.season}`).join(', ') : 'none'}</span>
        <span>Saunders: {saunders.length ? saunders.map(row => `${row.owner} ${row.season}`).join(', ') : 'none'}</span>
        <span>Top 3: {topThree.length ? topThree.map(row => `${row.owner} ${row.season}`).join(', ') : 'none'}</span>
      </div>
      {rows.length < model.state.minSample ? (
        <p class="draft-warning">Low sample: this selection is below the current minimum sample threshold.</p>
      ) : null}
    </div>
  );
}
