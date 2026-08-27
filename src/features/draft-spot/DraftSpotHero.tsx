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
  // Draft-weekend stories are tied to the canonical 2025 rows. A range can
  // contain older rows with the same slot, so never use the first array hit.
  const firstRow = model.asset.rows.find(row => row.season === 2025 && row.draft_pick === 1) || null;
  const lastRow = model.asset.rows.find(row => row.season === 2025 && row.draft_pick === last) || null;
  const snareRow = model.asset.rows.find(row => row.season === 2025 && row.owner === 'Snare' && row.draft_pick === 1) || null;
  const rishiRow = model.asset.rows.find(row => row.season === 2025 && row.owner === 'Rishi' && row.draft_pick === 4) || null;
  const expansionRows = model.asset.rows.filter(row => row.season === 2024 || row.season === 2025);
  const teamCounts = new Map(expansionRows.map(row => [row.season, row.team_count]));
  const firstFacts = firstRow && JSON.stringify({ draft_slot: firstRow.draft_pick, season: firstRow.season, owner: firstRow.owner, team_count: firstRow.team_count, finish: firstRow.finish, champion: firstRow.champion });
  const lastFacts = lastRow && JSON.stringify({ draft_slot: lastRow.draft_pick, season: lastRow.season, owner: lastRow.owner, team_count: lastRow.team_count, finish: lastRow.finish, champion: lastRow.champion });
  const snareFacts = snareRow && JSON.stringify({ draft_slot: snareRow.draft_pick, season: snareRow.season, owner: snareRow.owner, team_count: snareRow.team_count, finish: snareRow.finish, champion: snareRow.champion });
  const rishiFacts = rishiRow && JSON.stringify({ draft_slot: rishiRow.draft_pick, season: rishiRow.season, owner: rishiRow.owner, team_count: rishiRow.team_count, finish: rishiRow.finish, champion: rishiRow.champion });
  const expansionFacts = JSON.stringify({ season: 2025, team_count_2024: teamCounts.get(2024) || null, team_count_2025: teamCounts.get(2025) || null });
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
      {state.mode === 'pick' && state.selectedPick === first && firstRow && <button type="button" class="btn draft-lore-trigger" data-lore-trigger="draft-boundary-first" data-lore-season="2025" data-lore-value={first} data-lore-facts={firstFacts || undefined}>Reveal first-slot lore</button>}
      {state.mode === 'pick' && state.selectedPick === first && snareRow && <button type="button" class="btn draft-lore-trigger" data-lore-trigger="draft-podium" data-lore-owner="Snare" data-lore-season="2025" data-lore-value={first} data-lore-facts={snareFacts || undefined}>Reveal Snare first-pick lore</button>}
      {state.mode === 'pick' && state.selectedPick === last && lastRow && <button type="button" class="btn draft-lore-trigger" data-lore-trigger="draft-snake-tail" data-lore-season="2025" data-lore-value={last} data-lore-facts={lastFacts || undefined}>Reveal last-slot lore</button>}
      {state.mode === 'pick' && state.selectedPick === 4 && rishiRow && <button type="button" class="btn draft-lore-trigger" data-lore-trigger="draft-rishi-pick-four" data-lore-owner="Rishi" data-lore-season="2025" data-lore-value="4" data-lore-facts={rishiFacts || undefined}>Reveal Rishi pick-four lore</button>}
      {state.mode === 'pick' && model.seasons.includes(2025) && <button type="button" class="btn draft-lore-trigger" data-lore-trigger="expansion-story" data-lore-value="2025" data-lore-facts={expansionFacts}>Reveal expansion lore</button>}
    </div>
  );
}
