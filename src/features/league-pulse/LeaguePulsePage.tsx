import type { LeaguePulseViewModel, PulseLink, PulseMatchupModel } from './league-pulse-types';

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

function MatchupCard({ matchup }: { matchup: PulseMatchupModel }) {
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
      <div class="pulse-matchup-grid">{group.rows.map(matchup => <MatchupCard key={`${matchup.ownerA}-${matchup.ownerB}`} matchup={matchup} />)}</div>
    </div>)}
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

export function LeaguePulsePage({ model }: { model: LeaguePulseViewModel }) {
  const updated = model.dataNote.generatedAt ? new Date(model.dataNote.generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
  return <div class="league-pulse">
    <PulseHero model={model} />
    <div class="pulse-primary-grid"><Matchups model={model} /><Standings model={model} /></div>
    <YearInReview model={model} />
    <div class="pulse-story-grid"><Featured model={model} /><Record model={model} /><Curse model={model} /></div>
    <QuickLinks model={model} />
    <p class="pulse-data-note">{updated ? `Updated ${updated}. ` : ''}Snapshot {model.dataNote.dataVersion}.{model.dataNote.usedFallbacks.length ? ` Fallbacks: ${model.dataNote.usedFallbacks.join(', ')}.` : ''}</p>
  </div>;
}
