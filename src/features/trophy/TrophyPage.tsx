import { DeferredChart } from '../../components/charts/DeferredChart';
import { TrophyControls } from './TrophyControls';
import { hardwareArt } from './trophy-model';
import type { TrophyHardwareItem, TrophyListItem, TrophyMetricKey, TrophyPageProps, TrophyRankValue } from './trophy-types';

function hardwareStateLabel(item: TrophyHardwareItem) {
  if (item.state === 'earned') return 'Earned';
  return item.tone === 'scar' ? 'Clean / avoided' : 'Still chasing';
}

function Disclosure({ id, title, children, open = false }: { id: string; title: string; children: preact.ComponentChildren; open?: boolean }) {
  return <details id={id} class="card feature-disclosure" open={open}>
    <summary>{title}</summary>
    <section class="feature-section-content">{children}</section>
  </details>;
}

function List({ items, empty, tone }: { items: TrophyListItem[]; empty: string; tone: string }) {
  if (!items.length) return <div class="trophy-empty">{empty}</div>;
  return <ul class={`trophy-list tone-${tone}`}>
    {items.map(item => <li key={item.key}>
      <span class="trophy-list-label">{item.label}</span>
      <span class="trophy-list-value">{item.value}</span>
      <span class="trophy-list-detail">{item.detail}</span>
    </li>)}
  </ul>;
}

export function TrophyPage({ view, owners, onOwnerChange, active, availableSections }: TrophyPageProps) {
  const available = (id: string) => !availableSections || availableSections.has(id);
  const careerRows = view.careerShape.rows.map(row => ({
    season: row.season,
    finish: Number(row.finish),
    finishLabel: row.finish,
    playoffCutoff: row.playoffCutoff,
    madePlayoffs: Number(row.finish) <= row.playoffCutoff,
    champion: row.tier === 'champion',
    saunders: row.tier === 'saunders',
    tier: (row.tier === 'champion'
      ? 'champion'
      : row.tier === 'saunders'
        ? 'saunders'
        : Number(row.finish) <= row.playoffCutoff ? 'playoff' : 'miss') as 'champion' | 'playoff' | 'saunders' | 'miss',
    title: row.title,
  }));
  const ownerRanks = view.leagueRanks.byOwner.get(view.owner);
  const rankLabels: Array<[TrophyMetricKey, string, TrophyRankValue | undefined]> = [
    ['championships', 'Championships', ownerRanks?.championships],
    ['avgFinish', 'Average Finish', ownerRanks?.avgFinish],
    ['regularTitles', 'Regular Titles', ownerRanks?.regularTitles],
    ['playoffWins', 'Playoff Wins', ownerRanks?.playoffWins],
    ['weeklyCrowns', 'Weekly Crowns', ownerRanks?.weeklyCrowns],
    ['sub70Games', 'Sub-70 Games', ownerRanks?.sub70Games],
    ['saundersPain', 'Saunders Pain', ownerRanks?.saundersPain],
  ];
  const rankValue = (metric: string, value: number | null | undefined) => {
    if (!Number.isFinite(value)) return '—';
    return metric === 'avgFinish' ? Number(value).toFixed(1) : value;
  };
  return <>
    <div class="trophy-toolbar">
      <TrophyControls owners={owners} selectedOwner={view.owner} onChange={onOwnerChange} />
    </div>
    <section id="trophyHero" class="trophy-hero card">
      <div class="trophy-hero-title">
        <div><div class="trophy-identity">{view.hero.identityLabel}</div><h3>{view.hero.title}</h3></div>
        <div id="trophyShareCard" class="share-card-action-host" data-share-trophy="1" />
      </div>
      <p class="trophy-hero-summary">{view.hero.summary}</p>
      {view.hero.highlights.length > 0 && <div class="trophy-chip-row">{view.hero.highlights.map(item => <span class="trophy-chip" key={item.label}>{item.icon && <img class="trophy-chip-icon" src={hardwareArt(item.icon)} alt="" aria-hidden="true" />}<span>{item.value} {item.label}</span><strong>{item.rankText}</strong></span>)}</div>}
      <div class="trophy-hero-record">{view.hero.record}</div>
      <div class="trophy-hero-rank">{view.hero.rankContext}</div>
      <div class="trophy-hero-split"><div><strong>Best:</strong> {view.hero.best}</div><div><strong>Worst:</strong> {view.hero.worst}</div></div>
    </section>
    {available('trophySectionNav') && <div id="trophySectionNav" />}
    {available('trophyHardwareDisclosure') && <Disclosure id="trophyHardwareDisclosure" title="Hardware Shelf" open>
      <div id="trophyHardwareShelf" class="trophy-shelf">{view.hardwareShelf.map(item => <article class={`trophy-hardware-card ${item.tone} state-${item.state}`} data-state={item.state} key={item.label}><div class="trophy-card-top">{item.icon && <img class="trophy-card-art" src={hardwareArt(item.icon)} alt="" aria-hidden="true" />}<div class="trophy-card-title"><div class="trophy-year-chip">{item.label}</div><span class="trophy-card-state">{hardwareStateLabel(item)}</span></div><div class="trophy-card-rank">{Number.isFinite(item.rank) ? `#${item.rank}` : '—'}</div></div><div class="trophy-card-measure"><span class="trophy-card-measure-label">Count</span><strong class="trophy-card-value">{item.count}</strong></div><div class="trophy-card-years"><span class="trophy-card-meta-label">Years</span>{item.years.length ? item.years.join(', ') : '—'}</div><p class="trophy-card-context">{item.context}</p></article>)}</div>
    </Disclosure>}
    {available('trophyRankDisclosure') && <Disclosure id="trophyRankDisclosure" title="League Rank">
      <div id="trophyRankStrip" class="trophy-rank-strip">{rankLabels.map(([metric, label, row]) => <div class="trophy-rank-pill" key={metric}><div class="trophy-rank-pill-label">{label}</div><div class="trophy-rank-pill-value">{Number.isFinite(row?.rank) ? `#${row?.rank}` : '—'}</div><div class="trophy-rank-pill-sub">{rankValue(metric, row?.value)}</div></div>)}</div>
    </Disclosure>}
    {available('trophyCareerDisclosure') && <Disclosure id="trophyCareerDisclosure" title="Career Shape">
      <div id="trophyCareerShape" class="trophy-career-shape"><div class="trophy-career-chart chart-shell"><div class="trophy-career-header"><div><div class="trophy-career-title">Season finish trend</div><div class="trophy-career-subtitle">Lower is better. Playoff cutoff is 6th, except 2014 when it was 4th.</div></div><div class="trophy-career-legend"><span><span class="legend-swatch champion" /> Champion</span><span><span class="legend-swatch playoff" /> Playoff finish</span><span><span class="legend-swatch saunders" /> Saunders</span><span><span class="legend-swatch miss" /> Missed playoffs</span></div></div><DeferredChart id="trophyCareerPlot" class="trophy-career-host" name="Career Shape" signature={`${view.owner}|${careerRows.map(row => `${row.season}:${row.finish}`).join(',')}`} request={{ kind: 'trophy-career', data: { rows: careerRows } }} active={active} emptyMessage="No seasons recorded." /><ol class="chart-fallback trophy-career-fallback" aria-label="Season finish values">{careerRows.map(row => <li key={row.season}><span>{row.season}</span><strong>{row.finishLabel}</strong><span>{row.tier === 'champion' ? 'Champion' : row.tier === 'saunders' ? 'Saunders' : row.madePlayoffs ? 'Playoff finish' : 'Missed playoffs'} · {view.careerShape.rows.find(candidate => candidate.season === row.season)?.record || '—'}</span></li>)}</ol></div><div class="trophy-career-summary">{view.careerShape.summary}{careerRows.some(row => row.season === 2014) ? ' 2014 used a top-4 playoff cutoff.' : ''}</div></div>
    </Disclosure>}
    {available('trophyMomentsDisclosure') && <Disclosure id="trophyMomentsDisclosure" title="Highlights and Low Points">
      <section class="feature-section-content trophy-split"><div><h3>Highlights</h3><div id="trophyAchievementList"><List items={view.achievements} empty="No highlights yet." tone="gold" /></div></div><div><h3>Low Points</h3><div id="trophyScarList"><List items={view.scars} empty="No low points yet." tone="scar" /></div></div></section>
    </Disclosure>}
    {available('trophyLedgerDisclosure') && <Disclosure id="trophyLedgerDisclosure" title="Season Ledger">
      <div id="trophySeasonTableRoot" class="trophy-ledger" />
    </Disclosure>}
  </>;
}
