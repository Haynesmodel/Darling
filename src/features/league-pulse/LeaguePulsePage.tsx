import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { LeaguePulseViewModel, PulseLink, PulseMatchupModel } from './league-pulse-types';
import { shortDataVersion } from '../../data/data-version';
import {
  absoluteShareHref,
  mountCopyLinkAction,
  mountShareCardAction,
  type ShareCardActionController,
} from '../../share/share-card-actions';
import { buildLeagueEditionCardResult, buildPulseMatchupCardResult } from '../../share/share-card-feature-adapters';
import type { ShareCardBuildResult } from '../../share/share-card-types';

function ActionLink({ link, className = '' }: { link?: PulseLink; className?: string }) {
  return link ? <a class={className} href={link.href}>{link.label}</a> : null;
}

function PulseHero({ model }: { model: LeaguePulseViewModel }) {
  const { hero } = model;
  return <section class="pulse-hero card" aria-labelledby="pulseHeroTitle">
    <div class="pulse-hero-copy">
      <p class="pulse-eyebrow">{hero.eyebrow}</p>
      <h2 id="pulseHeroTitle">{hero.title}</h2>
      <p class="pulse-summary">{hero.summary}</p>
      <div class="pulse-actions">
        <ActionLink link={hero.primaryAction} className="btn primary" />
        <ActionLink link={hero.secondaryAction} className="btn" />
      </div>
    </div>
    <div class={`pulse-badge pulse-badge-${hero.badge.toLowerCase().replace(' ', '-')}`}>{hero.badge}</div>
  </section>;
}

function ShareAction({
  result,
  copyHref,
  label,
}: {
  result?: ShareCardBuildResult;
  copyHref?: string;
  label?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    let controller: ShareCardActionController | null = null;
    if (result) controller = mountShareCardAction({ host: host.current, result, label });
    else if (copyHref) controller = mountCopyLinkAction(host.current, copyHref, label);
    return () => controller?.dispose();
  }, [result, copyHref, label]);
  return <div ref={host} class="share-card-action-host" />;
}

function MatchupCard({
  matchup,
  dataVersion,
  season,
  week,
}: {
  matchup: PulseMatchupModel;
  dataVersion: string;
  season: number | null;
  week: number | null;
}) {
  const final = matchup.status === 'Final'
    && matchup.scoreA !== null
    && matchup.scoreB !== null
    && season !== null
    && week !== null;
  const href = absoluteShareHref(matchup.currentHref, window);
  const result = final ? buildPulseMatchupCardResult({
    ...matchup,
    scoreA: matchup.scoreA!,
    scoreB: matchup.scoreB!,
  }, season!, week!, dataVersion, window) : undefined;
  return <article class="pulse-matchup-card">
    <div class="pulse-card-topline"><span>{matchup.round || matchup.type}</span><strong>{matchup.status}</strong></div>
    <div class="pulse-scoreline">
      <span>{matchup.ownerA}</span><strong>{matchup.scoreA === null ? '—' : matchup.scoreA.toFixed(2)}</strong>
      <span>{matchup.ownerB}</span><strong>{matchup.scoreB === null ? '—' : matchup.scoreB.toFixed(2)}</strong>
    </div>
    <p class="muted">{matchup.result}</p>
    <div class="pulse-inline-links">
      <a href={matchup.currentHref}>Open week detail</a>
      <a href={matchup.rivalryHref}>Open {matchup.ownerA} vs {matchup.ownerB} Head to Head</a>
    </div>
    <ShareAction
      result={result}
      copyHref={final ? undefined : href}
      label={final ? `Share ${matchup.ownerA} vs ${matchup.ownerB} card` : 'Copy matchup link'}
    />
  </article>;
}

function Matchups({ model }: { model: LeaguePulseViewModel }) {
  if (!model.matchups.length) return null;
  const groups = model.state.phase === 'postseason'
    ? [
        { title: 'Championship bracket', rows: model.matchups.filter(matchup => matchup.type !== 'Saunders') },
        { title: 'Saunders bracket', rows: model.matchups.filter(matchup => matchup.type === 'Saunders') },
      ].filter(group => group.rows.length)
    : [{ title: '', rows: model.matchups }];
  return <section class="card pulse-matchups" aria-labelledby="pulseMatchupsTitle">
    <div class="pulse-section-heading"><div><p class="pulse-eyebrow">Spotlight</p><h3 id="pulseMatchupsTitle">Week {model.state.spotlightWeek} matchups</h3></div></div>
    {groups.map(group => <div class="pulse-matchup-group" key={group.title || 'week'}>
      {group.title && <h4>{group.title}</h4>}
      <div class="pulse-matchup-grid">{group.rows.map(matchup => <MatchupCard
        key={`${model.state.season}-${model.state.spotlightWeek}-${matchup.ownerA}-${matchup.ownerB}`}
        matchup={matchup}
        dataVersion={model.dataNote.dataVersion}
        season={model.state.season}
        week={model.state.spotlightWeek}
      />)}</div>
    </div>)}
  </section>;
}

function Newspaper({ model }: { model: LeaguePulseViewModel }) {
  const { editions, defaultEditionId } = model.newspaper;
  const [selectedId, setSelectedId] = useState(defaultEditionId || '');
  useEffect(() => {
    if (!editions.some(edition => edition.id === selectedId)) setSelectedId(defaultEditionId || editions[0]?.id || '');
  }, [defaultEditionId, editions, selectedId]);
  const selected = editions.find(edition => edition.id === selectedId) || editions[0] || null;
  const kinds = [...new Set(editions.map(edition => edition.kind))];
  const seasons = [...new Set(editions.filter(edition => !selected || edition.kind === selected.kind).map(edition => edition.season))];
  const peers = editions.filter(edition => !selected || (edition.kind === selected.kind && edition.season === selected.season));
  const result = useMemo(() => selected ? buildLeagueEditionCardResult(selected, window) || undefined : undefined, [selected]);
  const selectEdition = (kind: string, season?: number) => {
    const edition = editions.find(item => item.kind === kind && (season === undefined || item.season === season))
      || editions.find(item => item.kind === kind);
    if (edition) setSelectedId(edition.id);
  };
  return <section class="card pulse-newspaper" aria-labelledby="pulseNewspaperTitle">
    <div class="pulse-section-heading">
      <div>
        <p class="pulse-eyebrow">Generated from the latest reviewed league snapshot</p>
        <h3 id="pulseNewspaperTitle">The League Newspaper</h3>
      </div>
      {selected && <span class={`pulse-edition-status pulse-edition-${selected.state}`}>{selected.statusLabel}</span>}
    </div>
    {!selected ? <p>No edition can be generated because the canonical season and matchup assets are incomplete.</p> : <>
      <div class="pulse-newspaper-controls">
        {kinds.length > 1 && <label>Type
          <select value={selected.kind} onChange={event => {
            const kind = event.currentTarget.value;
            selectEdition(kind, selected.season);
          }}>
            <option value="weekly">Weekly</option><option value="season">Season</option>
          </select>
        </label>}
        {seasons.length > 1 && <label>Season
          <select value={String(selected.season)} onChange={event => selectEdition(selected.kind, Number(event.currentTarget.value))}>
            {seasons.map(season => <option key={season} value={season}>{season}</option>)}
          </select>
        </label>}
        {peers.length > 1 && <label>Edition
          <select value={selected.id} onChange={event => setSelectedId(event.currentTarget.value)}>
            {peers.map(edition => <option key={edition.id} value={edition.id}>{edition.week ? `Week ${edition.week}` : 'Year-end'}</option>)}
          </select>
        </label>}
      </div>
      <article class="pulse-edition">
        <p class="pulse-eyebrow">{selected.season}{selected.week ? ` · Week ${selected.week}` : ' · Season edition'}</p>
        <h4>{selected.headline}</h4>
        {selected.state === 'complete'
          ? <dl class="pulse-edition-highlights">{selected.highlights.slice(0, 4).map(item => <div key={item.label}><dt>{item.label}</dt><dd><strong>{item.value}</strong><span>{item.detail}</span></dd></div>)}</dl>
          : <p>{selected.state === 'partial'
            ? `Partial archive — ${selected.issue?.recordedGames || 0} of ${selected.issue?.expectedGames || 0} games recorded.`
            : 'This edition will become share-ready after the reviewed data snapshot is complete.'}</p>}
        <div class="pulse-inline-links">
          <a href={selected.sourceHref}>Open source</a>
          <span>Snapshot {shortDataVersion(selected.dataVersion)}</span>
        </div>
        {result && <ShareAction result={result} />}
      </article>
    </>}
  </section>;
}

function Standings({ model }: { model: LeaguePulseViewModel }) {
  const standings = model.standings;
  if (!standings) return null;
  return <section class="card pulse-standings" aria-labelledby="pulseStandingsTitle">
    <p class="pulse-eyebrow">Standings</p>
    <h3 id="pulseStandingsTitle">{standings.heading}</h3>
    <ol class="pulse-standing-list">
      {standings.rows.map(row => <li key={row.owner}>
        <span class="pulse-seed">{row.seed}</span><span><strong>{row.owner}</strong><small>{row.record}</small></span>
        {row.movementLabel && <span class={`pulse-movement ${Number(row.change) > 0 ? 'up' : Number(row.change) < 0 ? 'down' : ''}`}>{row.movementLabel}</span>}
      </li>)}
    </ol>
    <a href={standings.href}>Open full standings</a>
  </section>;
}

function YearInReview({ model }: { model: LeaguePulseViewModel }) {
  const year = model.yearInReview;
  if (!year) return null;
  return <>
    <section class="card pulse-final-standings" aria-labelledby="pulseFinalStandingsTitle">
      <p class="pulse-eyebrow">Final table</p>
      <h3 id="pulseFinalStandingsTitle">{year.season} final standings</h3>
      <ol class="pulse-standing-list">
        {year.finalStandings.map(row => <li key={row.owner}>
          <span class="pulse-seed">{row.finish}</span><span><strong>{row.owner}</strong><small>{row.record} · {row.pointsFor.toFixed(2)} PF</small></span>
          {row.owner === year.champion && <span class="pulse-honor">Champion</span>}
          {row.owner === year.saunders && <span class="pulse-honor pulse-honor-saunders">Saunders</span>}
        </li>)}
      </ol>
    </section>
    <section class="card pulse-superlatives" aria-labelledby="pulseSuperlativesTitle">
      <p class="pulse-eyebrow">Season superlatives</p>
      <h3 id="pulseSuperlativesTitle">{year.season} by the numbers</h3>
      <div class="pulse-superlative-grid">
        {year.superlatives.map(item => <article key={item.label}>
          <small>{item.label}</small><strong>{item.value}</strong><span>{item.detail}</span>
          {item.href && <a href={item.href}>Open source</a>}
        </article>)}
      </div>
    </section>
  </>;
}

function Featured({ model }: { model: LeaguePulseViewModel }) {
  const item = model.featuredMatchup;
  if (!item) return null;
  return <section class="card pulse-featured" aria-labelledby="pulseFeaturedTitle">
    <p class="pulse-eyebrow">{item.heading}</p><h3 id="pulseFeaturedTitle">{item.name}</h3>
    <p>{item.note}</p><dl><div><dt>All-time series</dt><dd>{item.series}</dd></div><div><dt>Latest result</dt><dd>{item.latestResult}</dd></div></dl>
    <a href={item.href}>Open {item.ownerA} vs {item.ownerB} Head to Head</a>
  </section>;
}

function Curse({ model }: { model: LeaguePulseViewModel }) {
  const curse = model.curse;
  if (!curse) return null;
  return <section class="card pulse-curse" aria-labelledby="pulseCurseTitle">
    <p class="pulse-eyebrow">{curse.heading}</p><h3 id="pulseCurseTitle">{curse.title}</h3><p>{curse.summary}</p>
    <div class="pulse-meta"><span>{curse.status}</span><span>{curse.severity}</span><span>{curse.sample}</span></div>
    <a href={curse.href}>Open Curse Tracker</a>
  </section>;
}

function Record({ model }: { model: LeaguePulseViewModel }) {
  const record = model.record;
  if (!record) return null;
  return <section class="card pulse-record" aria-labelledby="pulseRecordTitle">
    <p class="pulse-eyebrow">{record.label}</p><h3 id="pulseRecordTitle">{record.title}</h3>
    <strong class="pulse-record-value">{record.value}</strong><p>{record.owner} {record.scoreline} {record.opponent}</p><small>{record.date}</small>
    <a href={record.href}>Open record in League History</a>
  </section>;
}

function QuickLinks({ model }: { model: LeaguePulseViewModel }) {
  return <section class="card pulse-quick-links" aria-labelledby="pulseQuickLinksTitle">
    <p class="pulse-eyebrow">Go deeper</p><h3 id="pulseQuickLinksTitle">Explore the league</h3>
    <nav aria-label="League Pulse quick links">{model.quickLinks.map(link => <ActionLink key={link.label} link={link} />)}</nav>
  </section>;
}

function MyTeam({ model }: { model: LeaguePulseViewModel }) {
  const team = model.myTeam;
  if (!team) return null;
  return <section class="card pulse-my-team">
    <p class="pulse-eyebrow">My Team</p><h3>{team.owner}</h3>
    <p>{team.summary}</p><p><strong>{team.detail}</strong></p>
    <a href={team.href}>Open Owner Hub</a>
  </section>;
}

export function LeaguePulsePage({ model }: { model: LeaguePulseViewModel }) {
  const partial = model.dataNote.freshness.partial ? ' · Some current-season details unavailable' : '';
  return <div class="league-pulse">
    <PulseHero model={model} />
    <div class="pulse-primary-grid"><Matchups model={model} /><Standings model={model} /></div>
    <Newspaper model={model} />
    <YearInReview model={model} />
    <div class="pulse-story-grid"><MyTeam model={model} /><Featured model={model} /><Record model={model} /><Curse model={model} /></div>
    <QuickLinks model={model} />
    <p class="pulse-data-note">{model.dataNote.freshness.label} · Snapshot {shortDataVersion(model.dataNote.dataVersion)} · {model.dataNote.coreVerified ? 'Core verified' : 'Verification unavailable'}{partial}</p>
  </div>;
}
