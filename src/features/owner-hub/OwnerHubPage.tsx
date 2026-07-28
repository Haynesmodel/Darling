import type { OwnerPreferenceSnapshot } from '../../app/services/owner-preference-service';
import type { OwnerHubModel } from './owner-hub-types';
import type { ComponentChildren } from 'preact';

interface OwnerHubPageProps {
  validOwners: readonly string[];
  selectedOwner: string | null;
  invalidOwner: string | null;
  preference: OwnerPreferenceSnapshot;
  message: string;
  model: OwnerHubModel | null;
  onPreview(owner: string): void;
  onSave(): void;
  onClear(): void;
}

function Empty({ curse = false }: { curse?: boolean }) {
  return <p class="muted">{curse ? 'No tracked owner curse.' : 'Unavailable.'}</p>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function Card(props: { title: string; children: ComponentChildren }) {
  return <section class="card">
    <h3>{props.title}</h3>
    {props.children}
  </section>;
}

function HubContent({ model }: { model: OwnerHubModel }) {
  return <>
    <div class="owner-hub-lead">
      <Card title={model.identity.owner}>
        {model.identity.displayName && <p>{model.identity.displayName}</p>}
        {model.identity.teamName && <p>{model.identity.teamName}</p>}
        <p>{model.identity.completedSeasons} completed seasons · {model.identity.phase.replaceAll('-', ' ')}</p>
      </Card>
    </div>

    <div class="owner-hub-grid">
      <Card title={model.rightNow?.heading || 'Right now'}>
        {model.rightNow ? <>
          <p>{model.rightNow.summary}</p>
          {model.rightNow.detail && <strong>{model.rightNow.detail}</strong>}
          <a href={model.rightNow.href}>Details</a>
        </> : <Empty />}
      </Card>

      <Card title="Career">
        {model.legacy ? <dl class="owner-hub-stats">
          <Stat label="Season" value={model.legacy.record} />
          <Stat label="Win %" value={model.legacy.winPct === null ? 'Not available' : `${(model.legacy.winPct * 100).toFixed(1)}%`} />
          <Stat label="Titles" value={model.legacy.championships} />
          <Stat label="Saunders" value={model.legacy.saundersTitles} />
          <Stat label="Playoffs" value={model.legacy.playoffRecord} />
          <Stat label="Best" value={model.legacy.bestFinish === null ? 'Not available' : `No. ${model.legacy.bestFinish}`} />
          <Stat label="Avg. finish" value={model.legacy.averageFinish === null ? 'Not available' : model.legacy.averageFinish.toFixed(1)} />
        </dl> : <Empty />}
      </Card>

      <Card title="Last five">
        {model.recentForm ? <>
          <p><strong>Streak: {model.recentForm.streak}</strong></p>
          <ol class="owner-hub-form">
            {model.recentForm.games.map(game => <li key={`${game.when}-${game.opponent}`}>
              <span class={`owner-hub-result owner-hub-result-${game.result.toLowerCase()}`}>{game.result}</span>
              <span><strong>vs {game.opponent}</strong><small>{game.type} · {game.when}</small></span>
              <span>{game.score}</span>
            </li>)}
          </ol>
        </> : <Empty />}
      </Card>

      <Card title="Recent finishes">
        <strong class="owner-hub-direction">{model.dynastyDirection.direction}</strong>
        {model.dynastyDirection.finishes.length
          ? <p>{model.dynastyDirection.finishes.map(row => `${row.season}: No. ${row.finish}`).join(' · ')}</p>
          : <Empty />}
      </Card>

      <Card title="Draft tendency">
        {model.draftIdentity ? <>
          <dl class="owner-hub-stats">
            <Stat label="Samples" value={model.draftIdentity.samples} />
            <Stat label="Average pick" value={model.draftIdentity.averagePick.toFixed(1)} />
            <Stat label="Range" value={`${model.draftIdentity.earliestPick} / ${model.draftIdentity.latestPick}`} />
            <Stat label={`Latest (${model.draftIdentity.mostRecent.season})`} value={model.draftIdentity.mostRecent.pick} />
          </dl>
          <a href={model.draftIdentity.href}>Details</a>
        </> : <Empty />}
      </Card>

      <Card title="Familiar foes">
        {model.rivalries ? <>
          {model.rivalries.configured.map(rivalry => <p key={rivalry.name}><strong>{rivalry.name}</strong> · {rivalry.opponents.join(', ')}</p>)}
          {model.rivalries.mostPlayed && <p>
            Most played: <strong>{model.rivalries.mostPlayed.opponent}</strong> · {model.rivalries.mostPlayed.record} across {model.rivalries.mostPlayed.games} games<br />
            <a href={model.rivalries.mostPlayed.href}>Details</a>
          </p>}
        </> : <Empty />}
      </Card>

      <Card title="Curses">
        {model.curses ? <>
          <p>{model.curses.counts.active} active · {model.curses.counts.cold} cold · {model.curses.counts.broken} broken</p>
          {model.curses.top && <p><strong>{model.curses.top.title}</strong> · {model.curses.top.status}</p>}
          <a href={model.curses.href}>Open details</a>
        </> : <Empty curse />}
      </Card>
    </div>

    <section class="card owner-hub-explore" aria-labelledby="ownerHubExploreTitle">
      <h3 id="ownerHubExploreTitle">Explore as {model.identity.owner}</h3>
      <nav aria-label={`Explore as ${model.identity.owner}`}>
        {model.actions.map(action => <a href={action.href} key={action.label}>{action.label}</a>)}
      </nav>
    </section>
  </>;
}

export function OwnerHubPage(props: OwnerHubPageProps) {
  const { selectedOwner, preference } = props;
  const isFavorite = !!selectedOwner && selectedOwner === preference.owner;
  return <div class="owner-hub">
    <section class="card owner-hub-setup" aria-labelledby="ownerHubSetupTitle">
      <h3 id="ownerHubSetupTitle">{selectedOwner || 'Choose an owner'}</h3>
      {!selectedOwner && <p>Preview, then save My Team.</p>}
      {props.invalidOwner && <p class="status-banner status-error" role="alert">
        Owner not found: {props.invalidOwner}.
      </p>}
      <label class="owner-hub-owner-control">
        Owner
        <select value={selectedOwner || ''} onChange={event => props.onPreview(event.currentTarget.value)}>
          <option value="">Choose an owner</option>
          {props.validOwners.map(owner => <option value={owner} key={owner}>{owner}</option>)}
        </select>
      </label>
      <div class="owner-hub-actions">
        {isFavorite
          ? <>
              <span class="owner-hub-current">Current My Team</span>
              <button type="button" class="btn" onClick={props.onClear}>Clear My Team</button>
            </>
          : <button type="button" class="btn primary" disabled={!selectedOwner} onClick={props.onSave}>
              {selectedOwner ? `Make ${selectedOwner} My Team` : 'Make My Team'}
            </button>}
      </div>
      <p class="owner-hub-status" role="status" aria-live="polite">{props.message}</p>
    </section>
    {props.model && <HubContent model={props.model} />}
  </div>;
}
