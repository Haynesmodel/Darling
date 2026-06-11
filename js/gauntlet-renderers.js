import { escapeHtml, fmtTrimmed, nfmt } from './render-helpers.js';
import { histogramBins, DEFAULT_BLOWOUT_MARGIN, DEFAULT_CLOSE_GAME_MARGIN } from './gauntlet-simulator.js';

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

function histogramPoints(bins, scaleX, scaleY) {
  if (!bins.length) return [];
  return bins.map((bin) => {
    const center = (bin.start + bin.end) / 2;
    return {
      x: scaleX(center),
      y: scaleY(bin.count),
    };
  });
}

function histogramLinePath(points) {
  if (!points.length) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
}

function histogramAreaPath(points, plotBottom) {
  if (!points.length) return '';
  const line = histogramLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x.toFixed(2)},${plotBottom.toFixed(2)} L ${first.x.toFixed(2)},${plotBottom.toFixed(2)} Z`;
}

function histogramTickValues(maxCount) {
  const safeMax = Math.max(0, Math.ceil(maxCount));
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map(fraction => Math.round(safeMax * fraction));
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function histogramOverlayChartSvg({ binsA, binsB, maxCount, teamSeasonA, teamSeasonB, min, max, colorA, colorB, width, height }) {
  const plotLeft = 62;
  const plotRight = width - 26;
  const plotTop = 20;
  const plotBottom = height - 40;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const yTicks = histogramTickValues(maxCount);
  const scaleX = value => {
    if (max === min) return (plotLeft + plotRight) / 2;
    return plotLeft + ((value - min) / (max - min)) * plotWidth;
  };
  const scaleY = value => plotBottom - (maxCount ? (value / maxCount) * plotHeight : 0);
  const pointsA = histogramPoints(binsA, scaleX, scaleY);
  const pointsB = histogramPoints(binsB, scaleX, scaleY);
  const areaPathA = histogramAreaPath(pointsA, plotBottom);
  const areaPathB = histogramAreaPath(pointsB, plotBottom);
  const linePathA = histogramLinePath(pointsA);
  const linePathB = histogramLinePath(pointsB);
  const meanAX = scaleX(teamSeasonA.mean);
  const meanBX = scaleX(teamSeasonB.mean);

  return `
    <div class="gauntlet-histogram-panel">
      <svg class="gauntlet-histogram-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Overlaid score distribution histogram for ${escapeHtml(teamSeasonA.owner)} and ${escapeHtml(teamSeasonB.owner)}">
        <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="#fff" stroke="#e5e7eb" />
        <rect x="${plotLeft}" y="${plotTop}" width="${plotWidth}" height="${plotHeight}" rx="8" fill="#f8fafc" stroke="#e5e7eb" />
        ${yTicks.map(tick => {
          const y = scaleY(tick);
          return `
            <line x1="${plotLeft}" y1="${y.toFixed(2)}" x2="${plotRight}" y2="${y.toFixed(2)}" class="gauntlet-histogram-grid-line" />
            <text x="${plotLeft - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="gauntlet-histogram-y-axis">${escapeHtml(nfmt(tick, 0))}</text>
          `;
        }).join('')}
        <line x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="#cbd5e1" stroke-width="1.25" />
        <path d="${areaPathA}" fill="${colorA}" fill-opacity="0.16" stroke="none"></path>
        <path d="${areaPathB}" fill="${colorB}" fill-opacity="0.16" stroke="none"></path>
        <path d="${linePathA}" fill="none" stroke="${colorA}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></path>
        <path d="${linePathB}" fill="none" stroke="${colorB}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></path>
        <line x1="${meanAX.toFixed(2)}" y1="${plotTop}" x2="${meanAX.toFixed(2)}" y2="${plotBottom}" stroke="${colorA}" stroke-width="2" stroke-dasharray="5 4" opacity="0.9" />
        <line x1="${meanBX.toFixed(2)}" y1="${plotTop}" x2="${meanBX.toFixed(2)}" y2="${plotBottom}" stroke="${colorB}" stroke-width="2" stroke-dasharray="5 4" opacity="0.9" />
        <text x="${plotLeft}" y="${height - 10}" class="gauntlet-histogram-axis">${escapeHtml(nfmt(min, 1))}</text>
        <text x="${plotRight}" y="${height - 10}" text-anchor="end" class="gauntlet-histogram-axis">${escapeHtml(nfmt(max, 1))}</text>
      </svg>
      <div class="gauntlet-histogram-foot">
        <span><strong>${escapeHtml(teamSeasonA.owner)}</strong> min ${nfmt(teamSeasonA.min, 1)} · mean ${nfmt(teamSeasonA.mean, 1)} · max ${nfmt(teamSeasonA.max, 1)}</span>
        <span><strong>${escapeHtml(teamSeasonB.owner)}</strong> min ${nfmt(teamSeasonB.min, 1)} · mean ${nfmt(teamSeasonB.mean, 1)} · max ${nfmt(teamSeasonB.max, 1)}</span>
      </div>
    </div>
  `;
}

function gauntletHistogramSvg(result, teamSeasonA, teamSeasonB) {
  if (!result || !teamSeasonA || !teamSeasonB) return '<div class="gauntlet-empty">No simulation data available.</div>';

  const combined = result.scoresA.concat(result.scoresB);
  const min = combined.reduce((acc, value) => Math.min(acc, value), combined[0]);
  const max = combined.reduce((acc, value) => Math.max(acc, value), combined[0]);
  const binsA = histogramBins(result.scoresA, { bins: 18, min, max });
  const binsB = histogramBins(result.scoresB, { bins: 18, min, max });
  const maxCount = Math.max(...binsA.map(bin => bin.count), ...binsB.map(bin => bin.count), 1);
  const width = 1000;
  const height = 260;
  return `
    <div class="gauntlet-histogram-wrap">
      <div class="gauntlet-histogram-legend">
        <span><i class="gauntlet-legend-swatch gauntlet-legend-a"></i>${escapeHtml(teamSeasonA.owner)} ${escapeHtml(teamSeasonA.season)}</span>
        <span><i class="gauntlet-legend-swatch gauntlet-legend-b"></i>${escapeHtml(teamSeasonB.owner)} ${escapeHtml(teamSeasonB.season)}</span>
        <span class="gauntlet-histogram-note">Overlaid score frequencies by simulation bin</span>
      </div>
      ${histogramOverlayChartSvg({
        binsA,
        binsB,
        maxCount,
        teamSeasonA,
        teamSeasonB,
        min,
        max,
        colorA: '#2563eb',
        colorB: '#f59e0b',
        width,
        height,
      })}
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
  if (histogram) histogram.innerHTML = gauntletHistogramSvg(view.result, view.teamSeasonA, view.teamSeasonB);
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
