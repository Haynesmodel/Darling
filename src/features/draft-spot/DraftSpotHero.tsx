import { DRAFT_METRICS } from './draft-spot-model';
import { formatNumber, formatPercent, formatSigned } from './draft-spot-format';
import type { DraftSpotViewModel } from './draft-spot-types';

export default function DraftSpotHero({ model }: { model: DraftSpotViewModel }) {
  const { hero, state, rankedPicks } = model;
  const cards = [
    ['Best avg finish', hero.bestAvgPick ? `Pick ${hero.bestAvgPick.draft_pick}` : '—', hero.bestAvgPick ? `Finish ${formatNumber(hero.bestAvgPick.avg_finish)} · n=${hero.bestAvgPick.n}` : 'No sample'],
    ['Best playoff path', hero.bestPlayoffPick ? `Pick ${hero.bestPlayoffPick.draft_pick}` : '—', hero.bestPlayoffPick ? `${formatPercent(hero.bestPlayoffPick.playoff_rate)} playoffs · n=${hero.bestPlayoffPick.n}` : 'No sample'],
    ['Best zone', hero.bestZone?.zone || '—', hero.bestZone ? `Finish ${formatNumber(hero.bestZone.avg_finish)} · n=${hero.bestZone.n}` : 'No sample'],
    ['Saunders danger', hero.saundersPick ? `Pick ${hero.saundersPick.draft_pick}` : '—', hero.saundersPick ? `${formatPercent(hero.saundersPick.saunders_rate)} · n=${hero.saundersPick.n}` : 'No sample'],
    [DRAFT_METRICS[state.metric].label, rankedPicks[0] ? `Pick ${rankedPicks[0].draft_pick}` : '—', rankedPicks[0] ? `Selected metric leader · n=${rankedPicks[0].n}` : 'No sample'],
    ['Correlation', formatSigned(hero.correlation), `Draft percentile to finish score · points r ${formatSigned(hero.pointCorrelation)}`],
  ];
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
    </div>
  );
}
