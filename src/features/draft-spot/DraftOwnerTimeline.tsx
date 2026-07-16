import { formatPercent, outcomeLabel } from './draft-spot-format';
import type { DraftSpotState, DraftSpotViewModel } from './draft-spot-types';

export default function DraftOwnerTimeline({
  model,
  onChange,
}: {
  model: DraftSpotViewModel;
  onChange: (state: Partial<DraftSpotState>) => void;
}) {
  const profile = model.ownerProfile;
  if (!profile?.rows.length) {
    return <p class="muted">Choose an owner to see the year-by-year draft timeline.</p>;
  }
  return (
    <div class="draft-timeline" role="list" aria-label={`${profile.owner} draft history`}>
      {profile.rows.map(row => (
        <button
          type="button"
          data-draft-pick={row.draft_pick}
          role="listitem"
          class={[
            'draft-timeline-item',
            row.champion ? 'champion' : '',
            row.saunders ? 'saunders' : '',
            model.state.selectedPick === row.draft_pick ? 'selected' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onChange({
            ...model.state,
            mode: 'pick',
            selectedPick: row.draft_pick,
            selectedZone: null,
          })}
        >
          <span>{row.season}</span>
          <strong>
            Pick {row.draft_pick}
            {model.state.normalize === 'percentile' ? ` (${formatPercent(row.draft_percentile)})` : ''}
            {' '}→ F{row.finish}
          </strong>
          <em>{outcomeLabel(row)}</em>
        </button>
      ))}
    </div>
  );
}
