import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Journey, OwnerActivity, Trade, Transaction } from '../../data/generated/asset-types';
import { transactionHref } from './transactions-model';
import { TRANSACTION_VIEWS, type TransactionModel, type TransactionRouteState, type TransactionView } from './transactions-types';

interface Props {
  model: TransactionModel;
  onStateChange(next: Partial<TransactionRouteState>): void;
}

const VIEW_LABELS: Record<TransactionView, string> = {
  overview: 'League Wire',
  trades: 'Trade Desk',
  waivers: 'Waiver Wire',
  players: 'Player Journeys',
  owners: 'Owner Activity',
  draft: 'Draft & Keepers',
};

const OWNER_SORTS = [
  ['owner', 'Owner'],
  ['transactions', 'Moves'],
  ['adds', 'Adds'],
  ['drops', 'Drops'],
  ['trades', 'Trades'],
  ['faab_spent', 'FAAB'],
  ['turnover', 'Turnover'],
] as const;
type OwnerSort = typeof OWNER_SORTS[number][0];

function name(model: TransactionModel, playerId: string) {
  return model.playerNames.get(playerId) || `Player ${playerId}`;
}

function StateLink(props: { model: TransactionModel; state: Partial<TransactionRouteState>; children: ComponentChildren }) {
  return <a href={transactionHref(props.model.pathname, {
    ...props.model.state,
    ...props.state,
  })}>{props.children}</a>;
}

function Stat({ label, value }: { label: string; value: ComponentChildren }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function Empty({ children }: { children: ComponentChildren }) {
  return <p class="muted transaction-empty">{children}</p>;
}

function Details(props: { view: TransactionView; model: TransactionModel; children: ComponentChildren }) {
  return <details
    id={`transactions-${props.view}`}
    class="card feature-disclosure transaction-section"
    data-transaction-view={props.view}
    open={props.model.state.view === props.view}
  >
    <summary>{VIEW_LABELS[props.view]}</summary>
    <section class="feature-section-content">{props.children}</section>
  </details>;
}

function TransactionSummary({
  transaction,
  model,
  primary = false,
}: {
  transaction: Transaction;
  model: TransactionModel;
  primary?: boolean;
}) {
  const players = [...transaction.adds, ...transaction.drops].map(row => name(model, row.player_id));
  return <article
    id={`${primary ? 'transaction' : 'transaction-summary'}-${transaction.id}`}
    class="transaction-row"
    tabindex={primary && model.state.transactionId === transaction.id ? -1 : undefined}
  >
    <div>
      <strong>{transaction.type.replace('_', ' ')}</strong>
      <small>Week {transaction.week} · {transaction.status}</small>
    </div>
    <span>{transaction.participants.join(' · ') || 'League move'}</span>
    <span>{players.slice(0, 3).join(', ') || 'No player movement'}{players.length > 3 ? ` +${players.length - 3}` : ''}</span>
    <StateLink model={model} state={{ transactionId: transaction.id, player: null }}>Details</StateLink>
  </article>;
}

function TradeCard({ trade, model }: { trade: Trade; model: TransactionModel }) {
  const label = trade.status === 'too_early'
    ? 'Too early for an on-field comparison'
    : trade.status === 'incomplete'
      ? 'Incomplete: unresolved draft assets or coverage'
      : trade.even
        ? `Even through Week ${trade.completed_through_week}`
        : `On-field edge through Week ${trade.completed_through_week}: ${trade.edge_owner}`;
  const loreFacts = JSON.stringify({
    completed_through_week: trade.completed_through_week,
    edge_owner: trade.edge_owner,
    trade_side_points: trade.sides.map(side => `${side.owner}: ${side.starter_points.toFixed(2)}`).join(' · '),
  });
  return <article
    id={`transaction-${trade.transaction_id}`}
    class="transaction-trade-card"
    tabindex={model.state.transactionId === trade.transaction_id ? -1 : undefined}
  >
    <header>
      <div>
        <h4>Week {trade.week} trade</h4>
        <p class="muted">{label} · {trade.status}</p>
      </div>
      <StateLink model={model} state={{ transactionId: trade.transaction_id, player: null }}>Permalink</StateLink>
    </header>
    <div class="transaction-trade-sides">
      {trade.sides.map(side => <section key={side.owner}>
        <h5>{side.owner} received</h5>
        {side.players.length
          ? <ul>{side.players.map(playerId => <li key={playerId}>
              <StateLink model={model} state={{ player: playerId, view: 'players', transactionId: null }}>
                {name(model, playerId)}
              </StateLink>
            </li>)}</ul>
          : <Empty>No players</Empty>}
        {side.picks.map(pick => <p key={`${pick.season}-${pick.round}-${pick.original_owner}`}>
          {pick.season} round {pick.round} pick (from {pick.original_owner})
        </p>)}
        {side.faab !== 0 && <p>{side.faab > 0 ? '+' : ''}{side.faab} FAAB</p>}
        <dl class="transaction-stats">
          <Stat label="Starter points" value={side.starter_points.toFixed(2)} />
          <Stat label="Starts" value={side.starts} />
          <Stat label="Rostered points" value={side.total_points.toFixed(2)} />
          <Stat label="Still held" value={side.retained_players} />
        </dl>
      </section>)}
    </div>
    <p class="transaction-method">
      Method: starter fantasy points actually produced for each receiving owner after the trade through the last completed scoring week.
    </p>
    {trade.status === 'final' && !trade.even && trade.edge_owner && <button type="button" class="btn transaction-lore-receipt" data-lore-trigger="transactions-receipt" data-lore-value={trade.transaction_id} data-lore-facts={loreFacts}>Open on-field receipt</button>}
  </article>;
}

function JourneyView({ journey, model }: { journey: Journey | null; model: TransactionModel }) {
  if (!journey) return <Empty>Choose a player to see an ownership journey.</Empty>;
  const distinctOwners = new Set(journey.stints.map(stint => stint.owner));
  const loreFacts = JSON.stringify({
    owners: [...distinctOwners].join(' · '),
    completed_through_week: model.season.coverage.completed_week,
    starter_points: journey.stints.reduce((total, stint) => total + stint.starter_points, 0).toFixed(2),
  });
  return <div class="transaction-journey" id={`transaction-player-${journey.player_id}`} tabindex={-1}>
    <h4>{name(model, journey.player_id)}</h4>
    <ol>
      {journey.stints.map((stint, index) => <li key={`${stint.owner}-${index}`}>
        <strong>{stint.owner}</strong> · {stint.acquisition.kind.replace('_', ' ')} in Week {stint.acquisition.week}
        {stint.release && <> · {stint.release.kind.replace('_', ' ')} in Week {stint.release.week}</>}
        <small>
          {stint.rostered_weeks} rostered weeks · {stint.starts} starts · {stint.starter_points.toFixed(2)} starter points
          {stint.retained ? ' · retained at the scoring boundary' : ''}
        </small>
        {stint.acquisition.transaction_id && <StateLink
          model={model}
          state={{ transactionId: stint.acquisition.transaction_id, player: null }}
        >Source move</StateLink>}
      </li>)}
    </ol>
    {distinctOwners.size >= 3 && <button type="button" class="btn transaction-lore-journey" data-lore-trigger="transactions-suitcase" data-lore-value={journey.player_id} data-lore-facts={loreFacts}>Reveal passport trail</button>}
    {name(model, journey.player_id).toLocaleLowerCase().includes('rashid shaheed') && <button type="button" class="btn transaction-lore-rashid" data-lore-trigger="rashid-shaheed-story" data-lore-value={journey.player_id} data-lore-facts={loreFacts}>Reveal Rashid Shaheed lore</button>}
  </div>;
}

export default function TransactionsPage({ model, onStateChange }: Props) {
  const [playerQuery, setPlayerQuery] = useState('');
  const [ownerSort, setOwnerSort] = useState<{ field: OwnerSort; direction: 'ascending' | 'descending' }>({
    field: 'transactions',
    direction: 'descending',
  });
  const { season, state } = model;
  const playerJourneys = state.owner
    ? season.player_journeys.filter(row => row.stints.some(stint => stint.owner === state.owner))
    : season.player_journeys;
  const normalizedPlayerQuery = playerQuery.trim().toLocaleLowerCase();
  const visiblePlayerJourneys = normalizedPlayerQuery
    ? playerJourneys.filter(row => (
        row.player_id === state.player
        || row.player_id.toLocaleLowerCase().includes(normalizedPlayerQuery)
        || name(model, row.player_id).toLocaleLowerCase().includes(normalizedPlayerQuery)
      ))
    : playerJourneys;
  const selectedJourney = state.player
    ? playerJourneys.find(row => row.player_id === state.player) || null
    : null;
  const ownerTransactions = state.owner
    ? season.transactions.filter(row => row.participants.includes(state.owner as string))
    : season.transactions;
  const selectedTransaction = state.transactionId
    ? season.transactions.find(row => row.id === state.transactionId) || null
    : null;
  const latest = ownerTransactions.slice().sort((a, b) => b.created_ms - a.created_ms).slice(0, 8);
  const ownerActivity = season.insights.owner_activity
    .filter(row => !state.owner || row.owner === state.owner)
    .slice()
    .sort((a, b) => {
      const field = ownerSort.field;
      const left = a[field];
      const right = b[field];
      if (left === null && right !== null) return 1;
      if (left !== null && right === null) return -1;
      let comparison = 0;
      if (typeof left === 'string' && typeof right === 'string') {
        comparison = left.localeCompare(right);
      } else {
        comparison = Number(left) - Number(right);
      }
      if (ownerSort.direction === 'descending') comparison *= -1;
      return comparison || a.owner.localeCompare(b.owner);
    });
  const changeOwnerSort = (field: OwnerSort) => {
    setOwnerSort(previous => ({
      field,
      direction: previous.field === field && previous.direction === 'descending'
        ? 'ascending'
        : 'descending',
    }));
  };
  if (
    state.view === 'overview'
    && selectedTransaction
    && !latest.some(row => row.id === selectedTransaction.id)
  ) latest.unshift(selectedTransaction);
  return <div class="transactions">
    <section class="card transactions-hero">
      <div>
        <p class="card-kicker">Roster building, explained</p>
        <h3>Transactions</h3>
        <p>
          {season.coverage.transaction_count} recorded moves · {season.coverage.complete_count} complete · scoring through Week {season.coverage.completed_week}
        </p>
      </div>
      {model.favoriteOwner && <StateLink model={model} state={{
        owner: model.favoriteOwner,
        view: 'owners',
        player: null,
        transactionId: null,
      }}>
        My Team: {model.favoriteOwner}
      </StateLink>}
    </section>

    <section class="card transaction-controls" aria-label="Transaction history controls">
      <label>Season
        <select value={state.season} onChange={event => onStateChange({ season: Number(event.currentTarget.value) })}>
          {model.seasons.map(value => <option value={value} key={value}>{value}</option>)}
        </select>
      </label>
      <label>View
        <select value={state.view} onChange={event => {
          const view = event.currentTarget.value as TransactionView;
          onStateChange({
            view,
            player: view === 'players' ? state.player : null,
            transactionId: null,
          });
        }}>
          {TRANSACTION_VIEWS.map(value => <option value={value} key={value}>{VIEW_LABELS[value]}</option>)}
        </select>
      </label>
      <label>Owner
        <select value={state.owner || ''} onChange={event => {
          setPlayerQuery('');
          onStateChange({
            owner: event.currentTarget.value || null,
            player: null,
            transactionId: null,
          });
        }}>
          <option value="">All owners</option>
          {season.teams.map(team => <option value={team.owner} key={team.owner}>{team.owner}</option>)}
        </select>
      </label>
    </section>

    <nav class="transaction-jump-nav" aria-label="Transaction history sections">
      {TRANSACTION_VIEWS.map(view => <StateLink
        model={model}
        state={{ view, player: view === 'players' ? state.player : null, transactionId: null }}
        key={view}
      >{VIEW_LABELS[view]}</StateLink>)}
    </nav>

    <Details view="overview" model={model}>
      <dl class="transaction-stats transaction-overview-stats">
        <Stat label="Waivers" value={season.coverage.type_counts.waiver} />
        <Stat label="Free agents" value={season.coverage.type_counts.free_agent} />
        <Stat label="Trades" value={season.coverage.type_counts.trade} />
        <Stat label="Commissioner" value={season.coverage.type_counts.commissioner} />
        <Stat label="Failed" value={season.coverage.failed_count} />
        <Stat label="Missing player names" value={season.coverage.missing_player_metadata} />
      </dl>
      {!season.transactions.length
        ? <Empty>No moves yet. Coverage is ready for rounds 0–{season.max_week}.</Empty>
        : <div class="transaction-list">{latest.map(row => <TransactionSummary
            transaction={row}
            model={model}
            primary={state.view === 'overview'}
            key={row.id}
          />)}</div>}
    </Details>

    <Details view="trades" model={model}>
      {selectedTransaction
        && selectedTransaction.type === 'trade'
        && !season.insights.trades.some(row => row.transaction_id === selectedTransaction.id)
        && <TransactionSummary transaction={selectedTransaction} model={model} primary />}
      {!season.insights.trades.length
        ? <Empty>No completed trades are available for this season.</Empty>
        : season.insights.trades
            .filter(trade => !state.owner || trade.sides.some(side => side.owner === state.owner))
            .map(trade => <TradeCard trade={trade} model={model} key={trade.transaction_id} />)}
    </Details>

    <Details view="waivers" model={model}>
      <h4>Wire Finds</h4>
      <p class="transaction-method">Ranked by starter points during the acquisition stint, then starts, rostered weeks, retention, name, and player ID.</p>
      {selectedTransaction && ['waiver', 'free_agent'].includes(selectedTransaction.type) && <TransactionSummary
        transaction={selectedTransaction}
        model={model}
        primary
      />}
      {!season.insights.wire_finds.length ? <Empty>No completed waiver or free-agent adds yet.</Empty> : <ol class="transaction-ranking">
        {season.insights.wire_finds.filter(row => !state.owner || row.owner === state.owner).slice(0, 25).map(row => <li key={`${row.transaction_id}-${row.player_id}`}>
          <StateLink model={model} state={{ view: 'players', player: row.player_id, transactionId: null }}>{name(model, row.player_id)}</StateLink>
          <span>{row.owner} · {row.acquisition_type.replace('_', ' ')} · Week {row.week}</span>
          <strong>{row.starter_points.toFixed(2)} pts · {row.starts} starts</strong>
        </li>)}
      </ol>}
      <h4>Most added and dropped</h4>
      <ol class="transaction-ranking compact">
        {season.insights.movement_counts.slice(0, 20).map(row => <li key={row.player_id}>
          <StateLink model={model} state={{
            view: 'players',
            owner: null,
            player: row.player_id,
            transactionId: null,
          }}>{name(model, row.player_id)}</StateLink>
          <span>{row.adds} adds · {row.drops} drops</span>
        </li>)}
      </ol>
    </Details>

    <Details view="players" model={model}>
      <label class="transaction-player-control">Search players
        <input
          type="search"
          value={playerQuery}
          onInput={event => setPlayerQuery(event.currentTarget.value)}
          placeholder="Name or player ID"
          autocomplete="off"
        />
      </label>
      <label class="transaction-player-control">Player
        <select value={state.player || ''} onChange={event => onStateChange({ player: event.currentTarget.value || null, view: 'players' })}>
          <option value="">Choose a player</option>
          {visiblePlayerJourneys
            .slice()
            .sort((a, b) => name(model, a.player_id).localeCompare(name(model, b.player_id)))
            .map(row => <option value={row.player_id} key={row.player_id}>{name(model, row.player_id)}</option>)}
        </select>
      </label>
      <JourneyView journey={selectedJourney} model={model} />
    </Details>

    <Details view="owners" model={model}>
      <div class="transaction-table-wrap" role="region" aria-label="Owner activity table" tabindex={0}>
        <table>
          <caption>Completed roster activity for {season.season}</caption>
          <thead><tr>{OWNER_SORTS.map(([field, label]) => <th
            scope="col"
            aria-sort={ownerSort.field === field ? ownerSort.direction : 'none'}
            key={field}
          >
            <button type="button" onClick={() => changeOwnerSort(field)}>
              {label}
              {ownerSort.field === field && <span aria-hidden="true">
                {ownerSort.direction === 'descending' ? ' ↓' : ' ↑'}
              </span>}
            </button>
          </th>)}</tr></thead>
          <tbody>{ownerActivity.map((row: OwnerActivity) => <tr key={row.owner}>
              <th scope="row"><StateLink model={model} state={{
                owner: row.owner,
                view: 'owners',
                player: null,
                transactionId: null,
              }}>{row.owner}</StateLink></th>
              <td>{row.transactions}</td><td>{row.adds}</td><td>{row.drops}</td><td>{row.trades}</td><td>{row.faab_spent}</td>
              <td>{row.turnover === null ? 'Unavailable' : `${(row.turnover * 100).toFixed(1)}%`}</td>
            </tr>)}</tbody>
        </table>
      </div>
    </Details>

    <Details view="draft" model={model}>
      <h4>Draft retention and roster turnover</h4>
      {season.draft.status === 'unavailable' ? <Empty>Draft data is not available yet.</Empty> : <div class="transaction-table-wrap" role="region" aria-label="Draft retention table" tabindex={0}>
        <table>
          <caption>Drafted players still held at the completed-week boundary</caption>
          <thead><tr><th scope="col">Owner</th><th scope="col">Drafted</th><th scope="col">Retained</th><th scope="col">Retention</th><th scope="col">Turnover</th></tr></thead>
          <tbody>{season.insights.draft_retention
            .filter(row => !state.owner || row.owner === state.owner)
            .map(row => <tr key={row.owner}><th scope="row">{row.owner}</th><td>{row.drafted}</td><td>{row.retained}</td>
              <td>{row.retention === null ? 'Unavailable' : `${(row.retention * 100).toFixed(1)}%`}</td>
              <td>{row.turnover === null ? 'Unavailable' : `${(row.turnover * 100).toFixed(1)}%`}</td></tr>)}</tbody>
        </table>
      </div>}
      <h4>Keeper Return</h4>
      <p class="transaction-method">Starter points produced by each keeper, then starts and later draft round.</p>
      {!season.insights.keeper_return.length ? <Empty>No keeper picks were recorded for {season.season}.</Empty> : <ol class="transaction-ranking">
        {season.insights.keeper_return.map(row => <li key={row.player_id}>
          <StateLink model={model} state={{
            view: 'players',
            owner: null,
            player: row.player_id,
            transactionId: null,
          }}>{name(model, row.player_id)}</StateLink>
          <span>{row.owner} · Round {row.round}</span><strong>{row.starter_points.toFixed(2)} pts</strong>
        </li>)}
      </ol>}
    </Details>
  </div>;
}
