import { DRAFT_METRICS, draftPositionLabel } from './draft-spot-model';
import { formatNumber, formatPercent, formatSigned } from './draft-spot-format';
import type { DraftSpotViewModel } from './draft-spot-types';

export default function DraftSpotHero({ model }: { model: DraftSpotViewModel }) {
  const { hero, state, rankedPicks } = model;
  const cards = [
    ['Best avg finish', hero.bestAvgPick ? draftPositionLabel(hero.bestAvgPick.draft_pick, state.normalize) : '—', hero.bestAvgPick ? `Finish ${formatNumber(hero.bestAvgPick.avg_finish)} · n=${hero.bestAvgPick.n}` : 'No sample'],
    ['Best playoff path', hero.bestPlayoffPick ? draftPositionLabel(hero.bestPlayoffPick.draft_pick, state.normalize) : '—', hero.bestPlayoffPick ? `${formatPercent(hero.bestPlayoffPick.playoff_rate)} playoffs · n=${hero.bestPlayoffPick.n}` : 'No sample'],
    ['Best zone', hero.bestZone?.zone || '—', hero.bestZone ? `Finish ${formatNumber(hero.bestZone.avg_finish)} · n=${hero.bestZone.n}` : 'No sample'],
    ['Saunders danger', hero.saundersPick ? draftPositionLabel(hero.saundersPick.draft_pick, state.normalize) : '—', hero.saundersPick ? `${formatPercent(hero.saundersPick.saunders_rate)} · n=${hero.saundersPick.n}` : 'No sample'],
    [DRAFT_METRICS[state.metric].label, rankedPicks[0] ? draftPositionLabel(rankedPicks[0].draft_pick, state.normalize) : '—', rankedPicks[0] ? `Selected metric leader · n=${rankedPicks[0].n}` : 'No sample'],
    ['Correlation', formatSigned(hero.correlation), `Draft percentile to finish score · points r ${formatSigned(hero.pointCorrelation)}`],
  ];
  const first = model.picks.length ? Math.min(...model.picks) : null;
  const last = model.picks.length ? Math.max(...model.picks) : null;
  return (
    <div class="draft-hero-inner">
      <div>
        <div class="card-kicker">{hero.subtitle}</div>
        <h3>{hero.title}</h3>
        <p class="draft-hero-read">{hero.read}</p>
      </div>
      <div class="draft-kpi-grid">
        {cards.map(([label, value, detail]) => (
          <div class="draft-kpi">
            <span>{label}</span>
            <strong>{value}</strong>
            <em>{detail}</em>
          </div>
        ))}
      </div>
      {state.mode === 'pick' && state.selectedPick === first && <button type="button" class="btn draft-lore-trigger" data-lore-trigger="draft-podium" data-lore-value={first}>Reveal first-slot lore</button>}
      {state.mode === 'pick' && state.selectedPick === last && last !== first && <button type="button" class="btn draft-lore-trigger" data-lore-trigger="draft-snake-tail" data-lore-value={last}>Reveal last-slot lore</button>}
    </div>
  );
}
