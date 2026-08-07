import { DeferredChart } from '../../components/charts/DeferredChart';
import type { ComponentChildren } from 'preact';
import { formatLeaderText, formatRecord, formatScoreline, displayRoundName } from './rivalry-model';
import { RivalryControls } from './RivalryControls';
import type { RivalryGameRow, RivalryState, RivalryViewModel } from './rivalry-types';

function Empty() {
  return <div class="muted">No recorded games between these teams.</div>;
}

function Headline({ view }: { view: RivalryViewModel }) {
  const overall = view.summary.overall;
  if (!overall.g) return <div class="card" id="rivalryHeadline">
    <div class="rivalry-headline">
      <div class="rivalry-title">{view.teamA} vs {view.teamB}</div>
      <div class="rivalry-subtitle">No recorded games between {view.teamA} and {view.teamB}.</div>
    </div>
  </div>;
  const series = overall.w > overall.l
    ? `${view.teamA} leads ${formatRecord(overall.w, overall.l, overall.t)}`
    : overall.l > overall.w
      ? `${view.teamB} leads ${formatRecord(overall.l, overall.w, overall.t)}`
      : `Series tied ${formatRecord(overall.w, overall.l, overall.t)}`;
  const streak = view.summary.currentStreak;
  const current = streak ? `${formatLeaderText(view.teamA, view.teamB, streak.result, streak.len)} from ${streak.start.date} to ${streak.end.date}` : 'No current streak';
  const last = view.summary.lastMeeting;
  const lastMeeting = last ? `${last.winner === 'Tie' ? 'Tied' : last.winner} ${formatScoreline(last.pf, last.pa)} on ${last.date}` : 'No meeting';
  return <div class="card" id="rivalryHeadline">
    <div class="rivalry-headline">
      <div class="rivalry-headline-top">
        <div class="rivalry-title">{view.teamA} vs {view.teamB}</div>
        <div id="rivalryShareCard" class="share-card-action-host" data-share-rivalry="1" />
      </div>
      <div class="rivalry-subtitle">{series}</div>
      <div class="rivalry-line">{formatScoreline(overall.pf, overall.pa)} total points</div>
      <div class="rivalry-line">Regular {view.summary.regular.recordText} | Playoffs {view.summary.playoffs.recordText} | Saunders {view.summary.saunders.recordText}</div>
      <div class="rivalry-line">Current streak: {current} | Last meeting: {lastMeeting}</div>
    </div>
  </div>;
}

function LeadMeter({ view }: { view: RivalryViewModel }) {
  const overall = view.summary.overall;
  if (!overall.g) return <Empty />;
  const leftFlex = Math.max(overall.w + (overall.t / 2), 0.5);
  const rightFlex = Math.max(overall.l + (overall.t / 2), 0.5);
  const leader = overall.w > overall.l
    ? `${view.teamA} leads ${formatRecord(overall.w, overall.l, overall.t)}`
    : overall.l > overall.w
      ? `${view.teamB} leads ${formatRecord(overall.l, overall.w, overall.t)}`
      : `Series tied ${formatRecord(overall.w, overall.l, overall.t)}`;
  return <div class="rivalry-meter">
    <div class="rivalry-meter-top">
      <div class="rivalry-meter-label">{leader}</div>
      <div class="rivalry-meter-sub">{overall.g} games tracked{overall.t ? ` · ${overall.t} tie${overall.t === 1 ? '' : 's'}` : ''}</div>
    </div>
    <div class="rivalry-meter-bar" aria-hidden="true">
      <span class="rivalry-meter-a" style={{ flex: leftFlex }}><span>{view.teamA} {overall.w}</span></span>
      <span class="rivalry-meter-b" style={{ flex: rightFlex }}><span>{view.teamB} {overall.l}</span></span>
    </div>
  </div>;
}

function Highlights({ view }: { view: RivalryViewModel }) {
  if (!view.highlights.length) return <Empty />;
  return <>{view.highlights.map(item => <div class={`rivalry-highlight rivalry-${item.tone}`} key={item.label}>
    <div class="rivalry-highlight-icon" aria-hidden="true">{item.icon}</div>
    <div class="rivalry-highlight-body">
      <div class="rivalry-highlight-label">{item.label}</div>
      <div class="rivalry-highlight-value">{item.value}</div>
      <div class="rivalry-highlight-sub">{item.sub}</div>
    </div>
  </div>)}</>;
}

function Tape({ view }: { view: RivalryViewModel }) {
  return <>{view.tape.map(item => <div class="stat rivalry-stat" key={item.label}>
    <div class="label">{item.label}</div>
    <div class="value">{item.value}</div>
    {item.sub && <div class="sub">{item.sub}</div>}
  </div>)}</>;
}

function formatAxisDate(value: string): string {
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}/${parts[0]}` : value;
}

function LeadTrend({ view, active }: { view: RivalryViewModel; active: boolean }) {
  const points = view.leadPoints;
  if (!points.length) return <Empty />;
  const maximum = Math.max(1, ...points.map(point => Math.abs(point.lead)));
  const current = points.at(-1);
  const leader = !current || current.lead === 0 ? 'Series tied' : current.lead > 0 ? `${view.teamA} leads +${current.lead}` : `${view.teamB} leads +${Math.abs(current.lead)}`;
  const ticks = points.filter(point => point.index === 1 || point.index % 5 === 0);
  return <div class="rivalry-trend chart-shell">
    <div class="rivalry-trend-top">
      <div>
        <div class="rivalry-trend-label">Series lead relative to .500</div>
        <div class="rivalry-trend-sub">{leader} after {points.length} game{points.length === 1 ? '' : 's'}</div>
      </div>
      <div class="rivalry-trend-sub">Game index across the rivalry</div>
    </div>
    <div class="rivalry-trend-scale" aria-hidden="true"><span>{view.teamA} +{maximum}</span><span>.500</span><span>{view.teamB} +{maximum}</span></div>
    <DeferredChart
      id="rivalryLeadPlot"
      class="rivalry-trend-host"
      name="Lead Trend"
      signature={`${view.teamA}|${view.teamB}|${view.scope}|${points.map(point => `${point.date}:${point.lead}`).join(',')}`}
      request={{ kind: 'rivalry-lead', data: { rows: points, teamA: view.teamA, teamB: view.teamB } }}
      active={active}
      emptyMessage="No recorded games between these teams."
    />
    <div class="rivalry-trend-ticks" aria-hidden="true">{ticks.map(point => <span key={point.index}>G{point.index} {formatAxisDate(point.date)}</span>)}</div>
    <div class="rivalry-trend-note">Each point is the running series lead after that matchup, centered on .500. Positive values favor {view.teamA}; negative values favor {view.teamB}.</div>
    <ol class="chart-fallback rivalry-trend-fallback" aria-label="Running series lead values">
      {points.map(point => <li key={`${point.date}-${point.index}`}><span>G{point.index} {formatAxisDate(point.date)}</span><strong>Series spread: {point.spread}</strong><span>{point.winner} {point.score}</span></li>)}
    </ol>
  </div>;
}

function badges(row: RivalryGameRow): string[] {
  const values = row.type === 'Regular' ? [] : [row.type];
  const round = displayRoundName(row.round);
  if (round) values.push(round);
  return values;
}

function Timeline({ view }: { view: RivalryViewModel }) {
  if (!view.gameRows.length) return <Empty />;
  return <>{view.gameRows.slice().reverse().map(row => <div
    class={`rivalry-timeline-item ${row.rowClass} ${row.postseasonClass}`}
    title={`${row.date} • ${row.type}${row.round && row.round !== '—' ? ` • ${row.round}` : ''} • ${row.winner} ${row.score}`}
    key={`${row.date}-${row.season}`}
  >
    <div class="rivalry-timeline-top"><span>{row.season}</span><span>{row.type}</span></div>
    {badges(row).length > 0 && <div class="rivalry-timeline-badges">{badges(row).map(badge => <span class="rivalry-timeline-badge" key={badge}>{badge}</span>)}</div>}
    <div class="rivalry-timeline-result">{row.winner === 'Tie' ? 'T' : row.result}</div>
    <div class="rivalry-timeline-score">{row.score}</div>
    <div class="rivalry-timeline-date">{row.date}</div>
  </div>)}</>;
}

function Disclosure({ id, title, children, class: className }: { id: string; title: string; children: ComponentChildren; class?: string }) {
  return <details id={id} class="card feature-disclosure">
    <summary>{title}</summary>
    <section class={`feature-section-content${className ? ` ${className}` : ''}`}>{children}</section>
  </details>;
}

export function RivalryPage({
  state,
  teams,
  model,
  active,
  onChange,
}: {
  state: RivalryState;
  teams: readonly string[];
  model: RivalryViewModel;
  active: boolean;
  onChange(next: RivalryState): void;
}) {
  return <>
    <RivalryControls state={state} teams={teams} onChange={onChange} />
    <Headline view={model} />
    <div id="rivalrySectionNav" />
    <Disclosure id="rivalryLeadDisclosure" title="Series Lead"><div id="rivalryLeadMeter"><LeadMeter view={model} /></div></Disclosure>
    <Disclosure id="rivalryHighlightsDisclosure" title="Highlights"><div id="rivalryHighlightBoard" class="rivalry-highlight-board"><Highlights view={model} /></div></Disclosure>
    <Disclosure id="rivalryTapeDisclosure" title="Tale of the Tape"><div id="rivalryTapeGrid" class="stats-grid rivalry-tape"><Tape view={model} /></div></Disclosure>
    <Disclosure id="rivalryTrendDisclosure" title="Lead Trend"><div id="rivalryLeadTrend"><LeadTrend view={model} active={active} /></div></Disclosure>
    <Disclosure id="rivalryTimelineDisclosure" title="Timeline"><div id="rivalryTimeline" class="rivalry-timeline"><Timeline view={model} /></div></Disclosure>
    <Disclosure id="rivalrySeasonsDisclosure" title="Season Breakdown"><div id="rivalrySeasonTableRoot" /></Disclosure>
    <Disclosure id="rivalryGamesDisclosure" title="Game Log"><div id="rivalryGameTableRoot" /></Disclosure>
  </>;
}
