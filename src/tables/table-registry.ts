import { h } from 'preact';
import { isBlowout, isCloseGame, isPostseason, isSaunders, parseRecord } from './table-filter-functions';
import type { DarlingTableRow, TableColumnDefinition, TableId, TableRegistryEntry } from './table-types';

const text = (id: string, label: string, options: Partial<TableColumnDefinition> = {}): TableColumnDefinition => ({
  id,
  label,
  accessor: row => row[id],
  sortable: true,
  filterType: 'text',
  ...options,
});

const number = (id: string, label: string, options: Partial<TableColumnDefinition> = {}): TableColumnDefinition => ({
  id,
  label,
  accessor: row => row[id],
  sortable: true,
  sortDescFirst: true,
  filterType: 'number-range',
  ...options,
});

const enumColumn = (id: string, label: string, filterOptions: string[], options: Partial<TableColumnDefinition> = {}): TableColumnDefinition => ({
  id,
  label,
  accessor: row => row[id],
  sortable: true,
  filterType: 'enum',
  filterOptions,
  ...options,
});

const decimal = (digits = 2) => (value: unknown) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
const signed = (digits = 2) => (value: unknown) => Number.isFinite(Number(value))
  ? `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(digits)}`
  : '—';
const percent = (value: unknown) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '—';
const scoreWithMark = (value: unknown, row: DarlingTableRow) => `${value ?? '—'}${row.crownLabel || ''}`;
const notes = (value: unknown, row: DarlingTableRow) => {
  const items = Array.isArray(row.notes) ? row.notes : String(value || '').split(' • ').filter(Boolean);
  return h('span', { class: 'table-chip-list' }, items.length
    ? items.map(item => h('span', { class: 'trophy-chip', key: String(item) }, String(item)))
    : '—');
};

const entries: Record<TableId, TableRegistryEntry> = {
  'history-games': {
    id: 'history-games',
    mountId: 'historyGamesTableRoot',
    tableElementId: 'historyGamesTable',
    columns: [
      text('team', 'Team', { width: 132 }),
      text('date', 'Date', { sortDescFirst: true, width: 126 }),
      text('opponent', 'Opponent', { width: 132 }),
      enumColumn('result', 'Result', ['W', 'L', 'T'], { width: 82 }),
      number('score', 'Score', { render: (_value, row) => row.scoreLabel as string, width: 148 }),
      number('margin', 'Margin', { render: signed(2), hidden: true }),
      number('combinedScore', 'Combined', { render: decimal(2), hidden: true }),
      enumColumn('type', 'Type', ['Regular', 'Playoff', 'Saunders'], { width: 112 }),
      text('round', 'Round', { hideOnMobile: true, width: 140 }),
      number('season', 'Season', { width: 92 }),
    ],
    defaultSorting: [{ id: 'date', desc: true }],
    defaultPinned: ['team'],
    defaultPageSize: 50,
    quickFilters: [
      { id: 'wins', label: 'Wins', group: 'result', test: row => row.result === 'W' },
      { id: 'losses', label: 'Losses', group: 'result', test: row => row.result === 'L' },
      { id: 'playoffs', label: 'Playoffs', group: 'season-type', test: isPostseason },
      { id: 'saunders', label: 'Saunders', group: 'season-type', test: isSaunders },
      { id: '150-plus', label: '150+', test: row => Number(row.score) >= 150 },
      { id: 'close', label: 'Close games', group: 'margin', test: row => isCloseGame(row) },
      { id: 'blowouts', label: 'Blowouts', group: 'margin', test: row => isBlowout(row) },
    ],
    builtInViews: [
      { name: '150+ point games', state: { quickFilters: ['150-plus'], sorting: [{ id: 'score', desc: true }] } },
      { name: 'Closest games', state: { quickFilters: ['close'], sorting: [{ id: 'margin', desc: false }] } },
    ],
    emptyMessage: 'No games match the current table filters.',
    expandable: true,
  },
  'history-weeks': {
    id: 'history-weeks',
    mountId: 'weekTableRoot',
    tableElementId: 'weekTable',
    columns: [
      number('season', 'Season'),
      number('week', 'Week'),
      text('date', 'Date', { sortDescFirst: true }),
      text('opponent', 'Opponent'),
      enumColumn('result', 'Result', ['W', 'L', 'T']),
      number('score', 'Score', { render: scoreWithMark }),
      number('xw', 'XW', { render: decimal(2), hideOnMobile: true }),
      enumColumn('type', 'Type', ['Regular', 'Playoff', 'Saunders'], { hideOnMobile: true }),
      text('round', 'Round', { hideOnMobile: true }),
    ],
    defaultSorting: [{ id: 'date', desc: true }],
    defaultPinned: ['season'],
    defaultPageSize: 50,
    quickFilters: [
      { id: 'crowns', label: 'Crown weeks', group: 'weekly-mark', test: row => row.isCrown === true },
      { id: 'lowest', label: 'Lowest-score weeks', group: 'weekly-mark', test: row => row.isTurd === true },
      { id: 'playoffs', label: 'Playoffs', test: isPostseason },
      { id: 'close', label: 'Close games', test: row => isCloseGame(row) },
    ],
    emptyMessage: 'Select a team or broaden the filters to see weekly games.',
    expandable: true,
  },
  'history-opponents': {
    id: 'history-opponents',
    mountId: 'oppTableRoot',
    tableElementId: 'oppTable',
    columns: [
      text('opponent', 'Opponent', { width: 148 }),
      text('record', 'Record', { accessor: row => row.winPct, render: (_value, row) => String(row.record || '—') }),
      number('winPct', 'Win %', { render: percent }),
      number('ppg', 'PPG', { render: decimal(2) }),
      number('oppg', 'OPPG', { render: decimal(2), hideOnMobile: true }),
      number('games', 'Games'),
    ],
    defaultSorting: [{ id: 'winPct', desc: true }],
    defaultPinned: ['opponent'],
    defaultPageSize: 25,
    quickFilters: [
      { id: 'winning', label: 'Winning records', group: 'record', test: row => Number(row.winPct) > 0.5 },
      { id: 'losing', label: 'Losing records', group: 'record', test: row => Number(row.winPct) < 0.5 },
      { id: 'five-plus', label: 'Five-plus meetings', test: row => Number(row.games) >= 5 },
      { id: 'playoff-opponents', label: 'Playoff opponents', test: row => Number(row.playoffGames) > 0 },
    ],
    emptyMessage: 'No opponents match the current table filters.',
    expandable: true,
  },
  'history-seasons': {
    id: 'history-seasons',
    mountId: 'seasonRecapTableRoot',
    tableElementId: 'seasonRecapTable',
    columns: [
      number('season', 'Season'),
      number('draftPick', 'Draft Pick', { render: (_value, row) => row.draftPickLabel as string, hideOnMobile: true }),
      text('record', 'Record', { accessor: row => row.winPct, render: (_value, row) => String(row.record || '—') }),
      number('winPct', 'Win %', { render: percent }),
      number('finish', 'Finish', { sortDescFirst: false }),
      text('outcome', 'Outcome'),
    ],
    defaultSorting: [{ id: 'season', desc: true }],
    defaultPinned: ['season'],
    defaultPageSize: 25,
    quickFilters: [
      { id: 'champions', label: 'Champions', group: 'outcome', test: row => row.champion === true },
      { id: 'playoffs', label: 'Playoff seasons', group: 'outcome', test: row => Number(row.playoff_wins || 0) + Number(row.playoff_losses || 0) > 0 },
      { id: 'saunders', label: 'Saunders seasons', group: 'outcome', test: row => row.saunders === true },
      { id: 'last-five', label: 'Last five seasons', test: (row, context) => Number(row.season) >= Number(context.latestSeason || 0) - 4 },
    ],
    emptyMessage: 'Select a team or broaden the filters to see season recaps.',
    expandable: true,
  },
  'rivalry-seasons': {
    id: 'rivalry-seasons',
    mountId: 'rivalrySeasonTableRoot',
    tableElementId: 'rivalrySeasonTable',
    columns: [
      number('season', 'Season'),
      text('record', 'Record', { accessor: row => row.wins !== undefined ? Number(row.wins) + Number(row.ties || 0) * 0.5 : parseRecord(row.record), render: (_value, row) => String(row.record || '—') }),
      number('pf', 'PF', { render: decimal(2) }),
      number('pa', 'PA', { render: decimal(2) }),
      number('diff', 'Diff', { render: signed(2) }),
      text('notesLabel', 'Notes', { render: notes }),
    ],
    defaultSorting: [{ id: 'season', desc: true }],
    defaultPinned: ['season'],
    defaultPageSize: 25,
    quickFilters: [],
    emptyMessage: 'No recorded seasons between these teams.',
    expandable: true,
  },
  'rivalry-games': {
    id: 'rivalry-games',
    mountId: 'rivalryGameTableRoot',
    tableElementId: 'rivalryGameTable',
    columns: [
      text('date', 'Date', { sortDescFirst: true }),
      number('season', 'Season'),
      number('week', 'Week'),
      enumColumn('type', 'Type', ['Regular', 'Playoff', 'Saunders']),
      text('round', 'Round', { hideOnMobile: true }),
      text('winner', 'Winner'),
      text('scoreLabel', 'Score'),
      number('margin', 'Margin', { render: decimal(2) }),
    ],
    defaultSorting: [{ id: 'date', desc: true }],
    defaultPinned: ['date'],
    defaultPageSize: 25,
    quickFilters: [
      { id: 'playoffs', label: 'Playoffs', test: isPostseason },
      { id: 'close', label: 'Close games', group: 'margin', test: row => isCloseGame(row) },
      { id: 'blowouts', label: 'Blowouts', group: 'margin', test: row => isBlowout(row) },
      { id: 'last-five', label: 'Last five meetings', test: row => Number(row.recencyIndex) < 5 },
    ],
    emptyMessage: 'No recorded games between these teams.',
    expandable: true,
  },
  'current-standings': {
    id: 'current-standings',
    mountId: 'currentStandingsTableRoot',
    tableElementId: 'currentStandingsTable',
    columns: [
      number('rank', 'Rank', { sortDescFirst: false }),
      text('owner', 'Owner'),
      text('record', 'Record', { accessor: row => row.winPct, render: (_value, row) => String(row.record || '—') }),
      number('winPct', 'Win %', { render: percent }),
      number('pointsFor', 'PF', { render: decimal(2) }),
      number('pointsAgainst', 'PA', { render: decimal(2), hideOnMobile: true }),
      number('differential', 'Diff', { render: signed(2) }),
      text('streak', 'Streak', { hideOnMobile: true }),
    ],
    defaultSorting: [{ id: 'rank', desc: false }],
    defaultPinned: ['owner'],
    defaultPageSize: 25,
    quickFilters: [
      { id: 'clinched', label: 'Clinched', group: 'status', test: row => String(row.statusKey).includes('clinched') },
      { id: 'bubble', label: 'Bubble', group: 'status', test: row => String(row.statusKey).includes('bubble') },
      { id: 'eliminated', label: 'Eliminated', group: 'status', test: row => String(row.statusKey).includes('eliminated') },
      { id: 'top-six-scoring', label: 'Top-six scoring', test: row => Number(row.pointsForRank) <= 6 },
    ],
    emptyMessage: 'No standings match the current filters.',
    expandable: true,
  },
  'current-projected': {
    id: 'current-projected',
    mountId: 'currentProjectedTableRoot',
    tableElementId: 'currentProjectedTable',
    columns: [
      number('projectedRank', 'Projected Seed', { sortDescFirst: false }),
      text('owner', 'Owner'),
      text('projectedRecord', 'Projected Record'),
      text('currentRecord', 'Current Record'),
      number('projectedPointsFor', 'Projected PF', { render: decimal(2) }),
      number('seedChange', 'Seed Change', { render: signed(0) }),
    ],
    defaultSorting: [{ id: 'projectedRank', desc: false }],
    defaultPinned: ['owner'],
    defaultPageSize: 25,
    quickFilters: [],
    emptyMessage: 'No projected standings match the current filters.',
    expandable: true,
  },
  'trophy-seasons': {
    id: 'trophy-seasons',
    mountId: 'trophySeasonTableRoot',
    tableElementId: 'trophySeasonTable',
    columns: [
      number('season', 'Season'),
      text('record', 'Record', { accessor: row => parseRecord(row.record), render: (_value, row) => String(row.record || '—') }),
      number('finishValue', 'Finish', { render: (_value, row) => String(row.finish || '—'), sortDescFirst: false }),
      number('pfValue', 'PF', { render: (_value, row) => String(row.pf || '—') }),
      number('paValue', 'PA', { render: (_value, row) => String(row.pa || '—'), hideOnMobile: true }),
      number('diffValue', 'Diff', { render: (_value, row) => String(row.diff || '—') }),
      text('notesLabel', 'Notes', { render: notes }),
    ],
    defaultSorting: [{ id: 'season', desc: true }],
    defaultPinned: ['season'],
    defaultPageSize: 25,
    quickFilters: [],
    emptyMessage: 'No seasons recorded for this owner.',
    expandable: true,
  },
};

export function getTableRegistryEntry(tableId: TableId): TableRegistryEntry {
  return entries[tableId];
}

export function getTableRegistry(): Readonly<Record<TableId, TableRegistryEntry>> {
  return entries;
}
