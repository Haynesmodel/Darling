import { escapeHtml, fmtTrimmed, nfmt } from './render-helpers.js';
import { DEFAULT_BLOWOUT_MARGIN, DEFAULT_CLOSE_GAME_MARGIN } from './gauntlet-simulator.js';
import { renderGauntletHistogramPlot } from './charting/plot-charts.js';

function fmtSigned(value, digits = 1) {
  const rounded = Number.isFinite(value) ? value.toFixed(digits) : '0.0';
  return `${value >= 0 ? '+' : ''}${rounded}`;
}

function pctLabel(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function gauntletModelLabel(model, includePostseason = false) {
  const base = model === 'historical' ? 'Historical' : 'Era-adjusted';
  return includePostseason ? `${base} + postseason` : base;
}

function formatWinCount(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : '0';
}

function gauntletTeamSeasonCardHtml(teamSeason) {
  if (!teamSeason) {
    return '<div class="gauntlet-team-card gauntlet-team-card-empty">No season selected.</div>';
  }

  const badges = [
    teamSeason.champion ? '<span class="gauntlet-badge gauntlet-badge-champ">Champion</span>' : '',
    teamSeason.bye ? '<span class="gauntlet-badge gauntlet-badge-bye">Bye</span>' : '',
    teamSeason.saunders ? '<span class="gauntlet-badge gauntlet-badge-saunders">Saunders</span>' : '',
  ].filter(Boolean).join('');

  return `
    <div class="gauntlet-team-card">
      <div class="gauntlet-team-card-head">
        <div>
          <div class="gauntlet-team-owner">${escapeHtml(teamSeason.owner)}</div>
          <div class="gauntlet-team-season">Season ${escapeHtml(teamSeason.season)}</div>
        </div>
        <div class="gauntlet-team-finish">#${escapeHtml(teamSeason.finish ?? '—')}</div>
      </div>
      <div class="gauntlet-team-record">Record ${escapeHtml(teamSeason.record)}</div>
      <div class="gauntlet-team-sum">${teamSeason.games} games · ${nfmt(teamSeason.mean, 1)} PPG</div>
      <div class="gauntlet-team-range">Range ${nfmt(teamSeason.min, 1)} to ${nfmt(teamSeason.max, 1)}</div>
      <div class="gauntlet-team-meta">PF ${nfmt(teamSeason.pointsFor, 1)} · PA ${nfmt(teamSeason.pointsAgainst, 1)}</div>
      <div class="gauntlet-badge-row">${badges || '<span class="gauntlet-badge gauntlet-badge-muted">No title flags</span>'}</div>
    </div>
  `;
}

function gauntletProbabilityHtml(result, teamSeasonA, teamSeasonB) {
  if (!result || !teamSeasonA || !teamSeasonB) return '';
  const modelLabel = gauntletModelLabel(result.model, result.includePostseason);
  return `
    <div class="gauntlet-probability">
      <div class="gauntlet-probability-head">
        <div>
          <div class="gauntlet-kicker">Monte Carlo Result</div>
          <div class="gauntlet-probability-title">${escapeHtml(modelLabel)} model, ${escapeHtml(result.simulations.toLocaleString())} sims</div>
        </div>
        <div class="gauntlet-probability-summary">
          <div><strong>${escapeHtml(teamSeasonA.owner)}</strong> ${pctLabel(result.pctA)} · ${formatWinCount(result.actualWinsA)} wins</div>
          <div><strong>${escapeHtml(teamSeasonB.owner)}</strong> ${pctLabel(result.pctB)} · ${formatWinCount(result.actualWinsB)} wins</div>
        </div>
      </div>
      <div class="gauntlet-probability-bar" role="img" aria-label="Win probability bar for ${escapeHtml(teamSeasonA.owner)} and ${escapeHtml(teamSeasonB.owner)}">
        <div class="gauntlet-probability-a" style="width:${(result.pctA * 100).toFixed(2)}%"></div>
        <div class="gauntlet-probability-b" style="width:${(result.pctB * 100).toFixed(2)}%"></div>
      </div>
      <div class="gauntlet-probability-foot">
        <span>${escapeHtml(teamSeasonA.owner)} average ${nfmt(result.avgA, 1)}</span>
        <span>Margin ${fmtSigned(result.avgMargin, 1)}</span>
        <span>${escapeHtml(teamSeasonB.owner)} average ${nfmt(result.avgB, 1)}</span>
      </div>
    </div>
  `;
}

function gauntletHistogramSvg(result, teamSeasonA, teamSeasonB) {
  if (!result || !teamSeasonA || !teamSeasonB) return '<div class="gauntlet-empty">No simulation data available.</div>';
  return `
    <div class="gauntlet-histogram-wrap">
      <div class="gauntlet-histogram-legend">
        <span><i class="gauntlet-legend-swatch gauntlet-legend-a"></i>${escapeHtml(teamSeasonA.owner)} ${escapeHtml(teamSeasonA.season)}</span>
        <span><i class="gauntlet-legend-swatch gauntlet-legend-b"></i>${escapeHtml(teamSeasonB.owner)} ${escapeHtml(teamSeasonB.season)}</span>
        <span class="gauntlet-histogram-note">Overlaid score frequencies by simulation bin</span>
      </div>
      <div class="gauntlet-histogram-panel chart-shell">
        <div id="gauntletHistogramPlot" class="chart-host gauntlet-histogram-host" aria-label="Overlaid score distribution histogram for ${escapeHtml(teamSeasonA.owner)} and ${escapeHtml(teamSeasonB.owner)}"></div>
        <div class="gauntlet-histogram-foot chart-fallback">
          <span><strong>${escapeHtml(teamSeasonA.owner)}</strong> min ${nfmt(teamSeasonA.min, 1)} · mean ${nfmt(teamSeasonA.mean, 1)} · max ${nfmt(teamSeasonA.max, 1)}</span>
          <span><strong>${escapeHtml(teamSeasonB.owner)}</strong> min ${nfmt(teamSeasonB.min, 1)} · mean ${nfmt(teamSeasonB.mean, 1)} · max ${nfmt(teamSeasonB.max, 1)}</span>
        </div>
      </div>
    </div>
  `;
}

function gauntletStatsTableHtml(result, teamSeasonA, teamSeasonB) {
  if (!result || !teamSeasonA || !teamSeasonB) return '';
  const blowoutLabel = `Blowout win rate (${DEFAULT_BLOWOUT_MARGIN}+)`;
  const rows = [
    ['PPG', nfmt(teamSeasonA.mean, 1), nfmt(teamSeasonB.mean, 1)],
    ['Record', escapeHtml(teamSeasonA.record), escapeHtml(teamSeasonB.record)],
    ['Finish', `#${escapeHtml(teamSeasonA.finish ?? '—')}`, `#${escapeHtml(teamSeasonB.finish ?? '—')}`],
    ['Score range', `${nfmt(teamSeasonA.min, 1)} - ${nfmt(teamSeasonA.max, 1)}`, `${nfmt(teamSeasonB.min, 1)} - ${nfmt(teamSeasonB.max, 1)}`],
    ['Simulated average', nfmt(result.avgA, 1), nfmt(result.avgB, 1)],
    ['Win probability', pctLabel(result.pctA), pctLabel(result.pctB)],
    [blowoutLabel, pctLabel(result.blowoutPctA), pctLabel(result.blowoutPctB)],
    ['Close-game rate', pctLabel(result.closeGamePct), pctLabel(result.closeGamePct)],
  ];

  return `
    <div class="table-wrap gauntlet-table-wrap">
      <table class="gauntlet-stats-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">${escapeHtml(teamSeasonA.owner)} ${escapeHtml(teamSeasonA.season)}</th>
            <th scope="col">${escapeHtml(teamSeasonB.owner)} ${escapeHtml(teamSeasonB.season)}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([label, valueA, valueB]) => `
            <tr>
              <th scope="row">${escapeHtml(label)}</th>
              <td>${valueA}</td>
              <td>${valueB}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function meetingLine(game) {
  if (!game) return '<div class="gauntlet-empty">No meeting data available.</div>';
  return `${escapeHtml(game.date)} · ${escapeHtml(game.teamA)} ${nfmt(game.scoreA, 1)} - ${nfmt(game.scoreB, 1)} ${escapeHtml(game.teamB)}`;
}

function gauntletHeadToHeadHtml(context) {
  if (!context) return '';
  const allTime = context.allTime;
  const selected = context.selected;
  return `
    <div class="gauntlet-context-grid stats-grid">
      <div class="stat">
        <div class="label">All-time record</div>
        <div class="value">${escapeHtml(allTime.recordA || '0-0')}</div>
        <div class="sub">${escapeHtml(allTime.games)} games</div>
      </div>
      <div class="stat">
        <div class="label">Selected seasons</div>
        <div class="value">${escapeHtml(selected ? selected.recordA : 'No games')}</div>
        <div class="sub">${selected ? `${selected.games} games` : 'No direct games in selected seasons'}</div>
      </div>
      <div class="stat">
        <div class="label">Highest combined</div>
        <div class="value">${allTime.highestCombined ? nfmt(allTime.highestCombined.combined, 1) : '—'}</div>
        <div class="sub">${allTime.highestCombined ? escapeHtml(allTime.highestCombined.date) : 'No meeting yet'}</div>
      </div>
      <div class="stat">
        <div class="label">Most recent</div>
        <div class="value">${allTime.mostRecent ? escapeHtml(allTime.mostRecent.date) : '—'}</div>
        <div class="sub">${allTime.mostRecent ? meetingLine(allTime.mostRecent) : 'No meeting yet'}</div>
      </div>
    </div>
    <div class="gauntlet-context-notes">
      <div>${allTime.highestCombined ? `Highest combined meeting: ${escapeHtml(allTime.highestCombined.date)} (${nfmt(allTime.highestCombined.combined, 1)} total points).` : 'The owners have not met directly.'}</div>
      <div>${selected ? `Selected seasons meetings: ${selected.games} (${escapeHtml(selected.recordA)}).` : 'No direct games in the selected seasons.'}</div>
    </div>
  `;
}

function gauntletNarrativeText(result, teamSeasonA, teamSeasonB, context) {
  if (!result || !teamSeasonA || !teamSeasonB) return 'No matchup selected.';
  const favored = result.pctA >= result.pctB ? teamSeasonA : teamSeasonB;
  const underdog = favored === teamSeasonA ? teamSeasonB : teamSeasonA;
  const favPct = pctLabel(favored === teamSeasonA ? result.pctA : result.pctB);
  const modelLabel = gauntletModelLabel(result.model, result.includePostseason).toLowerCase();
  const avgA = nfmt(result.avgA, 1);
  const avgB = nfmt(result.avgB, 1);
  const margin = fmtSigned(result.avgMargin, 1);
  const allTime = context?.allTime;
  const selected = context?.selected;
  const meetingPart = allTime?.games
    ? ` The owners are ${allTime.recordA} all-time across ${allTime.games} meetings.`
    : ' The owners have not met directly.';
  const selectedPart = selected?.games
    ? ` In the selected seasons, the series is ${selected.recordA} across ${selected.games} games.`
    : '';
  const combinedPart = allTime?.highestCombined
    ? ` Their highest combined meeting came on ${allTime.highestCombined.date} (${nfmt(allTime.highestCombined.combined, 1)} points).`
    : '';

  return `${favored.owner} ${favored.season} has the edge over ${underdog.owner} ${underdog.season} in ${favPct} of ${result.simulations.toLocaleString()} ${modelLabel} simulations, averaging ${avgA}-${avgB} with a ${margin} margin.${meetingPart}${selectedPart}${combinedPart}`;
}

function renderGauntlet(view, { doc } = {}) {
  const root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root) return;

  const matchup = root.getElementById('gauntletMatchup');
  const probability = root.getElementById('gauntletProbability');
  const histogram = root.getElementById('gauntletHistogram');
  const stats = root.getElementById('gauntletStats');
  const context = root.getElementById('gauntletContext');
  const narrative = root.getElementById('gauntletNarrative');
  const copy = root.getElementById('gauntletCopyText');

  if (matchup) {
    matchup.innerHTML = `
      <div class="gauntlet-matchup-grid">
        ${gauntletTeamSeasonCardHtml(view.teamSeasonA)}
        <div class="gauntlet-vs">vs</div>
        ${gauntletTeamSeasonCardHtml(view.teamSeasonB)}
      </div>
    `;
  }

  if (probability) probability.innerHTML = gauntletProbabilityHtml(view.result, view.teamSeasonA, view.teamSeasonB);
  if (histogram) {
    histogram.innerHTML = gauntletHistogramSvg(view.result, view.teamSeasonA, view.teamSeasonB);
    const host = typeof root.getElementById === 'function' ? root.getElementById('gauntletHistogramPlot') : null;
    renderGauntletHistogramPlot(host, view.result, view.teamSeasonA, view.teamSeasonB);
  }
  if (stats) stats.innerHTML = gauntletStatsTableHtml(view.result, view.teamSeasonA, view.teamSeasonB);
  if (context) context.innerHTML = gauntletHeadToHeadHtml(view.context);
  if (narrative) narrative.textContent = view.narrative || '';
  if (copy) copy.value = view.copyText || '';
}

export {
  gauntletModelLabel,
  gauntletTeamSeasonCardHtml,
  gauntletProbabilityHtml,
  gauntletHistogramSvg,
  gauntletStatsTableHtml,
  gauntletHeadToHeadHtml,
  gauntletNarrativeText,
  renderGauntlet,
};
