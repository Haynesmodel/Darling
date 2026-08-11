import { useEffect, useRef } from 'preact/hooks';
import { DeferredChart } from '../../components/charts/DeferredChart';
import type { SeasonSummaryRow } from '../../data/generated/asset-types';
import { focusableElements, lockBodyScroll, restoreFocus, unlockBodyScroll } from '../../accessibility/focus';
import { buildDynastyWindowKey, dynastyWindowLabel } from './dynasty-model.ts';
import { DynastyControls } from './DynastyControls.tsx';
import type { DynastyScore, DynastyState, DynastyViewModel } from './dynasty-types.ts';

const fmt = (value: number | null | undefined, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) : '—';

function WindowCard({ row, onSelect }: { row: DynastyScore; onSelect: (row: DynastyScore) => void }) {
  return <button type="button" class="dynasty-window-card" data-window-key={buildDynastyWindowKey(row)} aria-haspopup="dialog" aria-controls="dynastyWindowModal" onClick={() => onSelect(row)}><div class="dynasty-window-card-top"><div><div class="dynasty-window-label">{row.owner}</div><h4>{row.windowLabel || `${row.windowStartSeason}-${row.windowEndSeason}`}</h4></div><div class="dynasty-score-value">{fmt(row.score)}</div></div><div class="dynasty-window-meta"><span>{row.windowSize}-Year Window</span><span>{row.label}</span></div><div class="dynasty-chip-row"><span class="dynasty-chip">{row.championships} Darlings</span><span class="dynasty-chip">{row.regularSeasonTitles} RS titles</span><span class="dynasty-chip">{fmt(row.winPct * 100)}% win pct</span></div></button>;
}

function ScoreHero({ score }: { score: DynastyScore | null }) {
  return <section id="dynastyCalculatorHero" class="card dynasty-calculator-hero"><div class="dynasty-hero-kicker">Dynasty Rankings</div><div class="dynasty-hero-title"><div><h3>{score?.owner ? `${score.owner} Dynasty Score` : 'Dynasty Rankings'}</h3><div class="dynasty-score-value">{score ? fmt(score.score) : '—'}</div></div><div id="dynastyShareCard" class="share-card-action-host" data-share-dynasty="1" /></div>{score?.label && <div class="dynasty-hero-label">{score.label}</div>}<p>{score?.explanation.join(' · ') || 'Select a mode and range to compare league history.'}</p>{score && <div class="dynasty-hero-meta"><span>{score.requestedStartSeason}-{score.requestedEndSeason}</span><span>#{score.rankInPeriod || '—'} of {score.totalOwners || '—'}</span><span>Coverage: {score.scoredSeasonCount}/{score.requestedSeasonCount}</span><span>regularSeason {fmt(score.components.regularSeason)}</span><span>hardware {fmt(score.components.hardware)}</span></div>}</section>;
}

function Leaderboard({ rows, mode }: { rows: readonly DynastyScore[]; mode: string }) {
  if (!rows.length) return <div class="dynasty-empty">No qualifying owners in this period.</div>;
  const windows = mode.startsWith('rolling-') || rows.some(row => row.windowLabel);
  return <div class="table-wrap dynasty-period-leaderboard"><table><thead><tr><th scope="col">Rank</th>{windows && <th scope="col">Window</th>}<th scope="col">Owner</th><th scope="col">Score</th><th scope="col">Record</th><th scope="col">Hardware</th><th scope="col">Diff</th></tr></thead><tbody>{rows.map(row => <tr class="dynasty-row" key={`${row.owner}-${row.windowLabel || row.requestedStartSeason}`}><td>#{row.rankInPeriod || '—'}</td>{windows && <td>{row.windowLabel || `${row.scoredStartSeason}-${row.scoredEndSeason}`}</td>}<td><strong>{row.owner}</strong></td><td>{fmt(row.score)}</td><td>{row.wins}-{row.losses}-{row.ties}</td><td>{row.championships} D, {row.regularSeasonTitles} RS</td><td>{row.pointDiff >= 0 ? '+' : ''}{fmt(row.pointDiff)}</td></tr>)}</tbody></table></div>;
}

function Heatmap({ view }: { view: DynastyViewModel }) {
  return <div class="dynasty-heatmap" style={{ '--season-count': view.heatmap.seasonList.length } as Record<string, string | number>}><div class="dynasty-heatmap-row dynasty-heatmap-header"><div class="dynasty-heatmap-owner">Owner</div>{view.heatmap.seasonList.map(season => <div class="dynasty-heatmap-season" key={season}>{season}</div>)}</div>{view.heatmap.rows.map(row => <div class="dynasty-heatmap-row" key={row.owner}><div class="dynasty-heatmap-owner">{row.owner}</div>{row.cells.map(cell => <div class={`dynasty-heatmap-cell ${cell.profile?.champion ? 'champion' : cell.profile?.saunders ? 'saunders' : ''} ${cell.profile ? '' : 'empty'}`} key={cell.season} title={cell.profile ? `${row.owner} ${cell.season}: ${fmt(cell.score)}` : `${row.owner} ${cell.season}: No data`}><span>{cell.season}</span>{cell.profile && <><strong>{fmt(cell.score)}</strong><span>{cell.profile.finish ?? '—'}{cell.profile.champion ? ' 👑' : ''}{cell.profile.saunders ? ' 🪱' : ''}</span></>}</div>)}</div>)}</div>;
}

function Trend({ view, hiddenOwners, onToggle, active }: { view: DynastyViewModel; hiddenOwners: readonly string[]; onToggle(owner: string): void; active: boolean }) {
  const rows = view.trendChart.series.flatMap(series => series.points); const hidden = new Set(hiddenOwners);
  const scores = rows.map(row => row.cumulativeScore).filter(Number.isFinite);
  const minScore = scores.length ? Math.min(...scores) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;
  return <div class="dynasty-trend-chart chart-shell"><div class="dynasty-trend-header"><div><h4 class="dynasty-grid-title">All-Time Dynasty Trend</h4><div class="dynasty-trend-note">Cumulative dynasty score by season. Click a team in the key to hide or show it.</div></div></div><div class="dynasty-trend-legend">{view.trendChart.series.map(series => <button type="button" class={`dynasty-facet-chip${hidden.has(series.owner) ? ' is-hidden' : ''}`} data-dynasty-trend-toggle="1" data-owner={series.owner} aria-pressed={!hidden.has(series.owner)} title={hidden.has(series.owner) ? 'Show series' : 'Hide series'} onClick={() => onToggle(series.owner)} key={series.owner}><span class="dynasty-facet-swatch" style={{ background: series.color }} /><span class="dynasty-facet-label">{series.owner}</span><span class="dynasty-facet-value">{fmt(series.finalScore)}</span><span class="dynasty-facet-action">{hidden.has(series.owner) ? 'Show' : 'Hide'}</span></button>)}</div><div class="dynasty-trend-body"><DeferredChart id="dynastyTrendPlot" class="dynasty-trend-host" name="Dynasty Trend" signature={`${view.controls.mode}|${view.controls.startSeason}|${view.controls.endSeason}|${[...hidden].sort().join(',')}|${rows.map(row => `${row.owner}:${row.season}:${row.cumulativeScore}`).join(',')}`} request={{ kind: 'dynasty-trend', data: { rows: rows.map(row => ({ ...row, hidden: hidden.has(row.owner) })), seasonList: view.trendChart.seasonList, minScore, maxScore } }} active={active} loadOnReveal emptyMessage="No dynasty trend data available." /></div><ol class="chart-fallback dynasty-trend-fallback" aria-label="Final dynasty trend scores">{view.trendChart.series.map(series => <li key={series.owner}><span>{series.owner}</span><strong>{fmt(series.finalScore)}</strong></li>)}</ol></div>;
}

function Slumps({ view, onSelect }: { view: DynastyViewModel; onSelect(row: DynastyScore, kind?: 'playoffs' | 'saunders'): void }) { const rows = view.slumps.lowestScores; return <div class="dynasty-slump-grid"><section class="dynasty-slump-card"><h4>Lowest {view.slumps.windowSize}-Year Scores</h4><ul class="dynasty-slump-list">{rows.length ? rows.map(row => <li key={`${row.owner}-${row.windowLabel}`}><button type="button" class="dynasty-slump-item" data-window-kind="saunders" data-window-key={buildDynastyWindowKey(row)} onClick={() => onSelect(row, 'saunders')}><strong>{row.owner}</strong><span>{row.windowLabel}</span><span>{fmt(row.score)}</span></button></li>) : <li class="dynasty-empty">No data.</li>}</ul></section><section class="dynasty-slump-card"><h4>Worst Average Finish</h4><ul class="dynasty-slump-list">{view.slumps.worstAverageFinish.map(row => <li key={row.owner}><strong>{row.owner}</strong> <span>{row.windowLabel}</span> <span>{fmt(row.averageFinish, 2)}</span></li>)}</ul></section><section class="dynasty-slump-card"><h4>Most Saunders</h4><ul class="dynasty-slump-list">{view.slumps.mostSaundersPain.map(row => <li key={row.owner}><strong>{row.owner}</strong> <span>{row.windowLabel}</span> <span>{row.saundersTitles + row.saundersByes}</span></li>)}</ul></section></div>; }

function WindowDialog({ selected, kind, onClose }: { selected: DynastyScore | null; kind: 'playoffs' | 'saunders'; onClose(): void }) {
  const openerRef = useRef<HTMLElement | null>(null);
  const navigationCloseRef = useRef(false);
  const selectedKey = selected ? buildDynastyWindowKey(selected) : null;
  useEffect(() => {
    const dialog = document.getElementById('dynastyWindowModal') as HTMLDialogElement | null;
    if (!dialog) return;
    if (!selected) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!openerRef.current && document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
    if (!dialog.open) dialog.showModal?.();
    lockBodyScroll();
    const heading = dialog.querySelector<HTMLElement>('#dynastyWindowModalTitle');
    const focusHeading = () => heading?.focus({ preventScroll: true });
    const focusTimer = requestAnimationFrame(focusHeading);
    const onCancel = (event: Event) => { event.preventDefault(); onClose(); };
    const onNavigationClose = () => { navigationCloseRef.current = true; onClose(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusableElements(dialog);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('keydown', onKeyDown);
    dialog.addEventListener('darling:dialog-navigation-close', onNavigationClose);
    return () => {
      cancelAnimationFrame(focusTimer);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('keydown', onKeyDown);
      dialog.removeEventListener('darling:dialog-navigation-close', onNavigationClose);
      if (dialog.open) dialog.close();
      unlockBodyScroll();
      if (!navigationCloseRef.current) restoreFocus(openerRef.current);
      openerRef.current = null;
      navigationCloseRef.current = false;
    };
  }, [selectedKey, kind]);
  if (!selected) return <dialog id="dynastyWindowModal" class="dynasty-modal" aria-labelledby="dynastyWindowModalTitle" />;
  const saunders = kind === 'saunders';
  return <dialog id="dynastyWindowModal" class="dynasty-modal" aria-labelledby="dynastyWindowModalTitle" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><article class="dynasty-modal-panel"><button type="button" class="dynasty-modal-close" data-dynasty-modal-close="1" aria-label="Close window details" onClick={onClose}>×</button><div class="dynasty-modal-kicker">{saunders ? 'Lowest 5-Year Score' : 'Best Dynasty Window'}</div><h3 id="dynastyWindowModalTitle" tabIndex={-1}>{dynastyWindowLabel(selected)}</h3><div class="dynasty-modal-subtitle">{selected.windowSize}-Year Window · {selected.label}</div><div class="dynasty-modal-metrics"><div><span>Total Record</span><strong>{selected.wins}-{selected.losses}-{selected.ties}</strong></div><div><span>{saunders ? 'Saunders Bowl Appearances' : 'Playoff Appearances'}</span><strong>{saunders ? selected.saundersWins + selected.saundersLosses : selected.playoffWins + selected.playoffLosses}</strong></div><div><span>{saunders ? 'Saunders Record' : 'Playoff Record'}</span><strong>{saunders ? `${selected.saundersWins}-${selected.saundersLosses}` : `${selected.playoffWins}-${selected.playoffLosses}`}</strong></div></div><div class="dynasty-modal-table-wrap"><table class="dynasty-modal-table"><thead><tr><th scope="col">Season</th><th scope="col">Record</th><th scope="col">Final Result</th></tr></thead><tbody>{selected.seasons.map(season => <tr key={season.season}><td>{season.season}</td><td>{season.wins}-{season.losses}-{season.ties}</td><td>{season.champion ? 'Champion' : season.saunders ? 'Saunders' : season.finish ? `Finish ${season.finish}` : '—'}</td></tr>)}</tbody></table></div></article></dialog>;
}

export function DynastyPage({ view, state, seasonSummaries, active, openWindows, onChange, onToggleTrend, onSelectWindow, onCloseWindow }: { view: DynastyViewModel; state: DynastyState; seasonSummaries: readonly SeasonSummaryRow[]; active: boolean; openWindows?: boolean; onChange(next: DynastyState): void; onToggleTrend(owner: string): void; onSelectWindow(row: DynastyScore, kind?: 'playoffs' | 'saunders'): void; onCloseWindow(): void }) { const selected = view.bestWindows.topOverall.concat(view.bestWindows.byOwner).find(row => buildDynastyWindowKey(row) === state.selectedWindowKey) || null; const score = view.selectedScore; return <><DynastyControls state={state} seasonSummaries={seasonSummaries} onChange={onChange} /><ScoreHero score={score} /><div id="dynastySectionNav" /><details id="dynastyScoreDisclosure" class="card feature-disclosure" open><summary>Score Breakdown</summary><section class="feature-section-content"><div id="dynastyScoreBreakdown"><h3>{score?.label || 'Score Breakdown'}</h3>{score && <div class="dynasty-score-breakdown-metrics"><span>Coverage: {score.scoredSeasonCount}/{score.requestedSeasonCount}</span><span>regularSeason {fmt(score.components.regularSeason)}</span><span>hardware {fmt(score.components.hardware)}</span></div>}<p>{score?.explanation.join(' · ') || 'No score available.'}</p></div></section></details><details id="dynastyPeriodDisclosure" class="card feature-disclosure" open><summary>Period Comparison</summary><section class="feature-section-content"><div id="dynastyPeriodLeaderboard"><Leaderboard rows={view.comparisonRows} mode={view.controls.mode} /></div></section></details><details id="dynastyWindowsDisclosure" class="card feature-disclosure" open={openWindows}><summary>Best Dynasty Windows</summary><section class="feature-section-content"><div id="dynastyBestWindows"><div class="dynasty-window-grid"><div><h4 class="dynasty-grid-title">Best Overall {view.bestWindows.windowSizeLabel} Windows</h4><div class="dynasty-window-grid-inner">{view.bestWindows.topOverall.map(row => <WindowCard row={row} onSelect={onSelectWindow} key={buildDynastyWindowKey(row)} />)}</div></div><div><h4 class="dynasty-grid-title">Best Window by Owner ({view.bestWindows.windowSizeLabel})</h4><div class="dynasty-window-grid-inner">{view.bestWindows.byOwner.map(row => <WindowCard row={row} onSelect={onSelectWindow} key={buildDynastyWindowKey(row)} />)}</div></div></div></div></section></details><details id="dynastyTrendDisclosure" class="card feature-disclosure"><summary>Dynasty Trend</summary><section class="feature-section-content"><div id="dynastyTrendChart"><Trend view={view} hiddenOwners={state.chartHiddenOwners} onToggle={onToggleTrend} active={active} /></div></section></details><details id="dynastyHeatmapDisclosure" class="card feature-disclosure"><summary>Era Heatmap</summary><section class="feature-section-content"><div id="dynastyHeatmap" role="region" aria-label="Dynasty rankings by season" tabIndex={0}><Heatmap view={view} /></div></section></details><details id="dynastySlumpsDisclosure" class="card feature-disclosure"><summary>Slumps</summary><section class="feature-section-content"><div id="dynastySlumps"><Slumps view={view} onSelect={onSelectWindow} /></div></section></details><WindowDialog selected={selected} kind={state.selectedWindowKind || 'playoffs'} onClose={onCloseWindow} /></>; }
