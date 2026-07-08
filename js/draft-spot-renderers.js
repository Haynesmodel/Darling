import { escapeHtml } from './render-helpers.js';
import {
  DRAFT_ALL_OWNERS,
  DRAFT_METRICS,
  DRAFT_ZONES,
  draftMetricValue,
} from './draft-spot-data.js';

function fmtNumber(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
}

function fmtSigned(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return '-';
  const number = Number(value);
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}`;
}

function fmtPct(value, digits = 0) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(digits)}%` : '-';
}

function draftPickLabel(row, normalize = 'raw') {
  const pick = row?.draft_pick ?? row;
  if (normalize === 'percentile' && Number.isFinite(Number(row?.draft_percentile))) {
    return `P${pick} (${fmtPct(row.draft_percentile)})`;
  }
  return `P${pick}`;
}

function summaryDraftContext(summary, normalize = 'raw') {
  if (!summary) return '';
  if (normalize === 'percentile' && Number.isFinite(Number(summary.avg_draft_percentile))) {
    return `Avg draft percentile ${fmtPct(summary.avg_draft_percentile)}`;
  }
  if (Number.isFinite(Number(summary.avg_pick))) return `Avg pick ${fmtNumber(summary.avg_pick)}`;
  if (Number.isFinite(Number(summary.draft_pick))) return `Pick ${summary.draft_pick}`;
  return '';
}

function fmtMetric(value, metric) {
  if (['playoffRate', 'topThreeRate', 'saundersRate'].includes(metric)) return fmtPct(value);
  if (metric === 'championships') return `${Number(value || 0)}`;
  if (metric === 'pointsZ' || metric === 'winsAboveAvg') return fmtSigned(value, 2);
  return fmtNumber(value, 1);
}

function outcomeText(row) {
  const badges = [];
  if (row.champion) badges.push('Champion');
  if (row.saunders) badges.push('Saunders');
  if (row.made_playoffs) badges.push('Playoffs');
  if (row.top_three && !row.champion) badges.push('Top 3');
  return badges.length ? badges.join(', ') : 'Missed playoffs';
}

function sampleClass(n, minSample) {
  return Number(n || 0) < Number(minSample || 1) ? ' low-sample' : '';
}

function summaryLine(summary) {
  if (!summary) return 'No sample';
  return `n=${summary.n}, avg finish ${fmtNumber(summary.avg_finish)}, playoff ${fmtPct(summary.playoff_rate)}, titles ${summary.championships ?? fmtPct(summary.champion_rate)}`;
}

function draftSpotHeroHtml(view = {}) {
  const hero = view.hero || {};
  const metricLabel = DRAFT_METRICS[view.state?.metric]?.label || 'Avg Finish';
  return `
    <div class="draft-hero-inner">
      <div>
        <div class="card-kicker">${escapeHtml(hero.subtitle || '')}</div>
        <h3>${escapeHtml(hero.title || 'Draft Spot Explorer')}</h3>
        <p class="draft-hero-read">${escapeHtml(hero.read || '')}</p>
      </div>
      <div class="draft-kpi-grid">
        <div class="draft-kpi">
          <span>Best Avg Finish</span>
          <strong>${hero.bestAvgPick ? `Pick ${escapeHtml(hero.bestAvgPick.draft_pick)}` : '-'}</strong>
          <em>${escapeHtml(summaryLine(hero.bestAvgPick))}</em>
        </div>
        <div class="draft-kpi">
          <span>Best Playoff Path</span>
          <strong>${hero.bestPlayoffPick ? `Pick ${escapeHtml(hero.bestPlayoffPick.draft_pick)}` : '-'}</strong>
          <em>${hero.bestPlayoffPick ? `${fmtPct(hero.bestPlayoffPick.playoff_rate)} playoff rate, n=${hero.bestPlayoffPick.n}` : '-'}</em>
        </div>
        <div class="draft-kpi">
          <span>Best Zone</span>
          <strong>${escapeHtml(hero.bestZone?.zone || '-')}</strong>
          <em>${hero.bestZone ? `avg finish ${fmtNumber(hero.bestZone.avg_finish)}, n=${hero.bestZone.n}` : '-'}</em>
        </div>
        <div class="draft-kpi">
          <span>Saunders Danger</span>
          <strong>${hero.saundersPick ? `Pick ${escapeHtml(hero.saundersPick.draft_pick)}` : '-'}</strong>
          <em>${hero.saundersPick ? `${fmtPct(hero.saundersPick.saunders_rate)} rate, n=${hero.saundersPick.n}` : '-'}</em>
        </div>
        <div class="draft-kpi">
          <span>${escapeHtml(metricLabel)}</span>
          <strong>${view.rankedPicks?.[0] ? `Pick ${escapeHtml(view.rankedPicks[0].draft_pick)}` : '-'}</strong>
          <em>${view.rankedPicks?.[0] ? `selected metric leader, n=${view.rankedPicks[0].n}` : '-'}</em>
        </div>
        <div class="draft-kpi">
          <span>Correlation</span>
          <strong>${fmtSigned(hero.correlation, 2)}</strong>
          <em>draft percentile to finish score; points r ${fmtSigned(hero.pointCorrelation, 2)}</em>
        </div>
      </div>
    </div>
  `;
}

function metricIntensity(summary, summaries, metric) {
  const values = summaries.map(row => draftMetricValue(row, metric)).filter(Number.isFinite);
  if (!values.length) return 0.3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return 0.58;
  const value = draftMetricValue(summary, metric);
  const def = DRAFT_METRICS[metric] || DRAFT_METRICS.avgFinish;
  const normalized = (value - min) / (max - min);
  return def.lowerIsBetter ? 1 - normalized : normalized;
}

function draftPickBoardHtml(view = {}) {
  const metric = view.state?.metric || 'avgFinish';
  const minSample = view.state?.minSample || 1;
  const normalize = view.state?.normalize || 'raw';
  const maxPick = Math.max(12, ...(view.picks || [0]));
  const summaryByPick = new Map((view.pickSummary || []).map(row => [row.draft_pick, row]));
  const activePick = view.state?.selectedPick;
  const selectedMetricLabel = DRAFT_METRICS[metric]?.label || 'Metric';

  return `
    <div class="section-heading">
      <h3>Pick Board</h3>
      <div class="muted">${escapeHtml(selectedMetricLabel)} with n badges; ${normalize === 'percentile' ? 'draft percentile context is shown for cross-size seasons' : 'low-sample slots are marked'}.</div>
    </div>
    <div class="draft-pick-board">
      ${Array.from({ length: maxPick }, (_, idx) => idx + 1).map(pick => {
        const summary = summaryByPick.get(pick);
        if (!summary) {
          return `
            <button type="button" class="draft-pick-card empty" disabled>
              <span class="draft-pick-number">Pick ${pick}</span>
              <span class="draft-pick-note">No data</span>
            </button>
          `;
        }
        const intensity = metricIntensity(summary, view.pickSummary || [], metric);
        const metricValue = draftMetricValue(summary, metric);
        const classes = [
          'draft-pick-card',
          activePick === pick ? 'selected' : '',
          summary.championships ? 'has-title' : '',
          sampleClass(summary.n, minSample).trim(),
        ].filter(Boolean).join(' ');
        return `
          <button type="button" class="${classes}" data-draft-pick="${pick}" aria-pressed="${activePick === pick ? 'true' : 'false'}" style="--draft-intensity:${intensity.toFixed(3)}">
            <span class="draft-pick-top">
              <span class="draft-pick-number">Pick ${pick}</span>
              <span class="draft-sample">n=${summary.n}</span>
            </span>
            <strong>${escapeHtml(fmtMetric(metricValue, metric))}</strong>
            <span>Avg finish ${fmtNumber(summary.avg_finish)}</span>
            ${normalize === 'percentile' ? `<span>${escapeHtml(summaryDraftContext(summary, normalize))}</span>` : ''}
            <span>${fmtPct(summary.playoff_rate)} playoff - ${summary.championships} titles</span>
            <span>${summary.saunders_count} Saunders</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function draftZoneComparisonHtml(view = {}) {
  const metric = view.state?.metric || 'avgFinish';
  const normalize = view.state?.normalize || 'raw';
  const topZone = view.rankedZones?.[0]?.zone_key || null;
  const byZone = new Map((view.zoneSummary || []).map(row => [row.zone_key, row]));
  return `
    <div class="draft-zone-grid">
      ${DRAFT_ZONES.map(zone => {
        const summary = byZone.get(zone.key);
        const metricValue = summary ? draftMetricValue(summary, metric) : 0;
        return `
          <button type="button" class="draft-zone-card${topZone === zone.key ? ' top-zone' : ''}${view.state?.selectedZone === zone.key ? ' selected' : ''}" data-draft-zone="${zone.key}">
            <span>${escapeHtml(zone.label)}</span>
            <strong>${summary ? fmtMetric(metricValue, metric) : '-'}</strong>
            <em>${summary ? `n=${summary.n}, ${summaryDraftContext(summary, normalize).toLowerCase()}, avg finish ${fmtNumber(summary.avg_finish)}` : 'No data'}</em>
            <small>${summary ? `${fmtPct(summary.playoff_rate)} playoff, ${fmtPct(summary.champion_rate)} title, ${fmtPct(summary.saunders_rate)} Saunders` : ''}</small>
          </button>
        `;
      }).join('')}
    </div>
    <p class="draft-league-read">${escapeHtml(view.hero?.bestZone ? `${view.hero.bestZone.zone} has the best observed average finish in this filter.` : 'No zone read available for this filter.')}</p>
  `;
}

function confidenceLabel(value) {
  return String(value || '').replace(/\b\w/g, letter => letter.toUpperCase());
}

function ownerCardHtml(profile) {
  const bestPick = profile.best_pick;
  const bestZone = profile.best_zone;
  return `
    <article class="draft-owner-card">
      <div class="draft-owner-card-head">
        <h4>${escapeHtml(profile.owner)}</h4>
        <span class="draft-confidence">${escapeHtml(confidenceLabel(profile.confidence))}</span>
      </div>
      <strong>${escapeHtml(profile.target)}</strong>
      <p>${escapeHtml(profile.recommendation)}</p>
      <p class="muted">${escapeHtml(profile.caution)}</p>
      <div class="draft-mini-stats">
        <span>Best pick: ${bestPick ? `${escapeHtml(bestPick.label)} (n=${bestPick.n})` : '-'}</span>
        <span>Best zone: ${bestZone ? `${escapeHtml(bestZone.label)} (n=${bestZone.n})` : '-'}</span>
      </div>
    </article>
  `;
}

function draftOwnerRecommendationsHtml(view = {}) {
  const profiles = view.ownerRecommendations || [];
  if (!profiles.length) {
    return '<p class="muted">No owner recommendation is available for this filter.</p>';
  }
  const selected = view.state?.owner && view.state.owner !== DRAFT_ALL_OWNERS;
  return `
    <div class="${selected ? 'draft-owner-single' : 'draft-owner-grid'}">
      ${profiles.map(ownerCardHtml).join('')}
    </div>
  `;
}

function draftOwnerTimelineHtml(view = {}) {
  const profile = view.ownerProfile;
  const normalize = view.state?.normalize || 'raw';
  if (!profile || !profile.rows.length) {
    return '<p class="muted">Choose an owner to see the year-by-year draft timeline.</p>';
  }
  return `
    <div class="draft-timeline" aria-label="${escapeHtml(profile.owner)} draft history">
      ${profile.rows.map(row => `
        <div class="draft-timeline-item${row.champion ? ' champion' : ''}${row.saunders ? ' saunders' : ''}${view.state?.selectedPick === row.draft_pick ? ' selected' : ''}" data-draft-pick="${row.draft_pick}">
          <span>${row.season}</span>
          <strong>${escapeHtml(draftPickLabel(row, normalize))} -> F${row.finish}</strong>
          <em>${escapeHtml(outcomeText(row))}</em>
        </div>
      `).join('')}
    </div>
  `;
}

function smallRowsTable(rows = [], normalize = 'raw') {
  if (!rows.length) return '<p class="muted">No matching seasons.</p>';
  const showPercentile = normalize === 'percentile';
  return `
    <div class="table-wrap draft-mini-table">
      <table>
        <thead>
          <tr><th>Season</th><th>Owner</th><th>Pick</th>${showPercentile ? '<th>Draft %</th>' : ''}<th>Finish</th><th>Record</th><th>PF</th><th>Outcome</th></tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${row.season}</td>
              <td>${escapeHtml(row.owner)}</td>
              <td>${row.draft_pick}</td>
              ${showPercentile ? `<td>${fmtPct(row.draft_percentile)}</td>` : ''}
              <td>${row.finish}</td>
              <td>${fmtNumber(row.wins, 0)}-${fmtNumber(row.losses, 0)}${row.ties ? `-${fmtNumber(row.ties, 0)}` : ''}</td>
              <td>${fmtNumber(row.points_for, 1)}</td>
              <td>${escapeHtml(outcomeText(row))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function draftPickDetailHtml(view = {}) {
  const rows = view.pickDetailRows || [];
  const selectedPick = view.state?.selectedPick;
  const selectedZone = view.state?.selectedZone;
  const normalize = view.state?.normalize || 'raw';
  if (!selectedPick && !selectedZone) {
    return '<p class="muted">Select a pick or zone to inspect the receipts.</p>';
  }
  const title = selectedPick ? `Pick ${selectedPick}` : zoneLabel(selectedZone);
  const best = rows.length ? [...rows].sort((a, b) => a.finish - b.finish || b.points_for - a.points_for)[0] : null;
  const worst = rows.length ? [...rows].sort((a, b) => b.finish - a.finish || a.points_for - b.points_for)[0] : null;
  const champs = rows.filter(row => row.champion);
  const saunders = rows.filter(row => row.saunders);
  const topThree = rows.filter(row => row.top_three);
  return `
    <div class="draft-detail">
      <div class="draft-detail-summary">
        <div>
          <span>Selection</span>
          <strong>${escapeHtml(title)}</strong>
          <em>${rows.length} matching owner-seasons</em>
        </div>
        <div>
          <span>Best Result</span>
          <strong>${best ? `${escapeHtml(best.owner)} ${best.season}` : '-'}</strong>
          <em>${best ? `finish ${best.finish}` : '-'}</em>
        </div>
        <div>
          <span>Worst Result</span>
          <strong>${worst ? `${escapeHtml(worst.owner)} ${worst.season}` : '-'}</strong>
          <em>${worst ? `finish ${worst.finish}` : '-'}</em>
        </div>
      </div>
      <div class="draft-receipts">
        <span>Champions: ${champs.length ? champs.map(row => `${escapeHtml(row.owner)} ${row.season}`).join(', ') : 'none'}</span>
        <span>Saunders: ${saunders.length ? saunders.map(row => `${escapeHtml(row.owner)} ${row.season}`).join(', ') : 'none'}</span>
        <span>Top 3: ${topThree.length ? topThree.map(row => `${escapeHtml(row.owner)} ${row.season}`).join(', ') : 'none'}</span>
      </div>
      ${sampleClass(rows.length, view.state?.minSample).trim() ? '<p class="draft-warning">Low sample: this selection is below the current minimum sample threshold.</p>' : ''}
      ${smallRowsTable(rows, normalize)}
    </div>
  `;
}

function zoneLabel(key) {
  return DRAFT_ZONES.find(zone => zone.key === key)?.label || 'Selected Zone';
}

function draftRowsTableHtml(view = {}) {
  const rows = [...(view.rows || [])].sort((a, b) => b.season - a.season || a.draft_pick - b.draft_pick || a.owner.localeCompare(b.owner));
  if (!rows.length) return '<p class="muted">No rows match the current Draft Spot filters.</p>';
  const showPercentile = view.state?.normalize === 'percentile';
  return `
    <div class="table-wrap">
      <table id="draftRowsTable">
        <thead>
          <tr>
            <th scope="col">Season</th>
            <th scope="col">Owner</th>
            <th scope="col">Draft Pick</th>
            ${showPercentile ? '<th scope="col">Draft %</th>' : ''}
            <th scope="col">Zone</th>
            <th scope="col">Finish</th>
            <th scope="col">Record</th>
            <th scope="col">PF</th>
            <th scope="col">Points z</th>
            <th scope="col">Wins +/-</th>
            <th scope="col">Outcome</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr class="${row.champion ? 'draft-row-champ' : row.saunders ? 'draft-row-saunders' : ''}">
              <td>${row.season}</td>
              <td>${escapeHtml(row.owner)}</td>
              <td>${row.draft_pick}</td>
              ${showPercentile ? `<td>${fmtPct(row.draft_percentile)}</td>` : ''}
              <td>${escapeHtml(row.zone)}</td>
              <td>${row.finish}</td>
              <td>${fmtNumber(row.wins, 0)}-${fmtNumber(row.losses, 0)}${row.ties ? `-${fmtNumber(row.ties, 0)}` : ''}</td>
              <td>${fmtNumber(row.points_for, 1)}</td>
              <td>${fmtSigned(row.points_z, 2)}</td>
              <td>${fmtSigned(row.wins_above_avg, 2)}</td>
              <td>${escapeHtml(outcomeText(row))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderDraftSpot(view = {}, opts = {}) {
  const root = opts.doc || (typeof document !== 'undefined' ? document : null);
  if (!root) return;
  const status = root.getElementById('draftStatus');
  const hasAsset = !!view.asset;
  if (status) {
    status.hidden = hasAsset;
    status.textContent = hasAsset ? '' : 'Draft Spot data is not available. Regenerate assets/DraftSpot.json and refresh.';
  }
  const sections = {
    draftHero: draftSpotHeroHtml,
    draftPickBoard: draftPickBoardHtml,
    draftZoneComparison: draftZoneComparisonHtml,
    draftOwnerRecommendations: draftOwnerRecommendationsHtml,
    draftOwnerTimeline: draftOwnerTimelineHtml,
    draftPickDetail: draftPickDetailHtml,
    draftRows: draftRowsTableHtml,
  };
  for (const [id, renderer] of Object.entries(sections)) {
    const el = root.getElementById(id);
    if (el) el.innerHTML = hasAsset ? renderer(view) : '';
  }
}

export {
  draftOwnerRecommendationsHtml,
  draftOwnerTimelineHtml,
  draftPickBoardHtml,
  draftPickDetailHtml,
  draftRowsTableHtml,
  draftSpotHeroHtml,
  draftZoneComparisonHtml,
  renderDraftSpot,
};
