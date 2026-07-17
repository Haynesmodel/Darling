import type { DraftSpotViewModel } from './draft-spot-types';

function confidenceLabel(value: string): string {
  return value.replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function DraftOwnerRecommendations({ model }: { model: DraftSpotViewModel }) {
  if (!model.ownerRecommendations.length) {
    return <p class="muted">No owner recommendation is available for this filter.</p>;
  }
  return (
    <div class={model.ownerRecommendations.length === 1 ? 'draft-owner-single' : 'draft-owner-grid'}>
      {model.ownerRecommendations.map(profile => (
        <article class="draft-owner-card">
          <div class="draft-owner-card-head">
            <h4>{profile.owner}</h4>
            <span class="draft-confidence">{confidenceLabel(profile.confidence)}</span>
          </div>
          <strong>{profile.target}</strong>
          <p>{profile.recommendation}</p>
          <p class="muted">{profile.caution}</p>
          <div class="draft-mini-stats">
            <span>Best pick: {profile.best_pick.label} (n={profile.best_pick.n})</span>
            <span>Best zone: {profile.best_zone.label} (n={profile.best_zone.n})</span>
          </div>
        </article>
      ))}
    </div>
  );
}
