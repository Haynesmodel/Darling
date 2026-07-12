import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  columnFilteringFeature,
  columnPinningFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from '@tanstack/preact-table';
import ExpandedRow from './ExpandedRow';
import SortableHeader from './SortableHeader';
import TableToolbar from './TableToolbar';
import { enumFilterValue, isEmptyRange, numberRangeFilterValue, textFilterValue } from '../../tables/table-filter-functions';
import { filterByQuickFilters, toggleQuickFilter } from '../../tables/table-quick-filters';
import { sanitizePortableState, tableContextsMatch } from '../../tables/table-saved-views';
import type {
  DarlingTableRow,
  PortableTableState,
  SavedTableView,
  TableContext,
  TableRegistryEntry,
  TableUrlState,
} from '../../tables/table-types';

const textFilter: any = (row: any, columnId: string, value: unknown) => textFilterValue(row.getValue(columnId), value);
textFilter.autoRemove = (value: unknown) => !String(value ?? '').trim();

const enumFilter: any = (row: any, columnId: string, value: unknown) => enumFilterValue(row.getValue(columnId), value);
enumFilter.autoRemove = (value: unknown) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

const numberRangeFilter: any = (row: any, columnId: string, value: unknown) => numberRangeFilterValue(row.getValue(columnId), value as any);
numberRangeFilter.autoRemove = isEmptyRange;

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { textFilter, enumFilter, numberRangeFilter },
  columnVisibilityFeature,
  columnPinningFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

interface InteractiveTableProps {
  registry: TableRegistryEntry;
  rows: DarlingTableRow[];
  context?: TableContext;
  initialState?: Partial<PortableTableState>;
  urlState?: TableUrlState;
  onUrlStateChange?: (state: TableUrlState) => void;
  onApplySavedView?: (view: SavedTableView) => void;
  forceUrlSyncOnMount?: boolean;
}

const sortFromGameQuery: Record<string, { id: string; desc: boolean }> = {
  dateDesc: { id: 'date', desc: true },
  scoreDesc: { id: 'score', desc: true },
  scoreAsc: { id: 'score', desc: false },
  marginDesc: { id: 'margin', desc: true },
  marginAsc: { id: 'margin', desc: false },
  combinedDesc: { id: 'combinedScore', desc: true },
};

function initialPortableState(
  registry: TableRegistryEntry,
  state: Partial<PortableTableState> = {},
  urlState: TableUrlState = {},
): PortableTableState {
  const hiddenColumns = Object.fromEntries(registry.columns.filter(column => column.hidden).map(column => [column.id, false]));
  const usesGameQuery = registry.id === 'history-games';
  const filters = [...(state.columnFilters || [])]
    .filter(filter => !(usesGameQuery && ((urlState.gameResult && filter.id === 'result') ||
      ((Number.isFinite(urlState.gameMinScore) || Number.isFinite(urlState.gameMaxScore)) && filter.id === 'score'))));
  if (usesGameQuery && urlState.gameResult) filters.push({ id: 'result', value: urlState.gameResult });
  if (usesGameQuery && (Number.isFinite(urlState.gameMinScore) || Number.isFinite(urlState.gameMaxScore))) {
    filters.push({ id: 'score', value: { min: urlState.gameMinScore ?? null, max: urlState.gameMaxScore ?? null } });
  }
  const urlSort = usesGameQuery && urlState.gameSort ? sortFromGameQuery[urlState.gameSort] : null;
  return {
    sorting: urlSort ? [urlSort] : state.sorting || registry.defaultSorting,
    columnFilters: filters,
    quickFilters: state.quickFilters || [],
    columnVisibility: { ...hiddenColumns, ...(state.columnVisibility || {}) },
    columnPinning: state.columnPinning || { left: registry.defaultPinned, right: [] },
    pageSize: state.pageSize || registry.defaultPageSize,
  };
}

function gameQueryFromState(
  state: PortableTableState,
  previous: TableUrlState = {},
): TableUrlState {
  const resultFilter = state.columnFilters.find(filter => filter.id === 'result')?.value;
  const scoreFilter = state.columnFilters.find(filter => filter.id === 'score')?.value as any;
  const quickResult = state.quickFilters.includes('wins') ? 'W' : state.quickFilters.includes('losses') ? 'L' : null;
  const sorting = state.sorting[0];
  const sortKey = Object.entries(sortFromGameQuery).find(([, value]) => value.id === sorting?.id && value.desc === sorting?.desc)?.[0] || null;
  const quickMinimum = state.quickFilters.includes('150-plus') ? 150 : null;
  const filterMinimum = Number.isFinite(Number(scoreFilter?.min)) && scoreFilter?.min !== null ? Number(scoreFilter.min) : null;
  const filterMaximum = Number.isFinite(Number(scoreFilter?.max)) && scoreFilter?.max !== null ? Number(scoreFilter.max) : null;
  return {
    gameResult: String(resultFilter || quickResult || '') || null,
    gameMinScore: filterMinimum === null ? quickMinimum : Math.max(filterMinimum, quickMinimum || filterMinimum),
    gameMaxScore: filterMaximum,
    gameSort: sortKey === 'dateDesc' ? null : sortKey,
    gameLimit: previous.gameLimit ?? null,
  };
}

function pinnedClass(column: any): string {
  return column.getIsPinned?.() === 'start' ? ' table-column-pinned' : '';
}

function compareSortValues(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

export default function InteractiveTable({
  registry,
  rows,
  context = {},
  initialState,
  urlState,
  onUrlStateChange,
  onApplySavedView,
  forceUrlSyncOnMount = false,
}: InteractiveTableProps) {
  const startingState = useMemo(() => initialPortableState(registry, initialState, urlState), []);
  const [quickFilters, setQuickFilters] = useState(startingState.quickFilters);
  const [gameLimit, setGameLimit] = useState<number | null>(registry.id === 'history-games' && typeof urlState?.gameLimit === 'number' && Number.isFinite(urlState.gameLimit) ? urlState.gameLimit : null);
  const initialUrlEffect = useRef(true);
  const data = useMemo(
    () => filterByQuickFilters(rows, quickFilters, registry.quickFilters, context),
    [rows, quickFilters, registry.quickFilters, context],
  );
  const columns = useMemo(() => registry.columns.map(definition => ({
    id: definition.id,
    accessorFn: definition.accessor || ((row: DarlingTableRow) => row[definition.id]),
    header: definition.label,
    cell: (info: any) => definition.render
      ? definition.render(info.getValue(), info.row.original)
      : String(info.getValue() ?? '—'),
    enableSorting: definition.sortable !== false,
    sortFn: definition.sortAccessor
      ? (rowA: any, rowB: any) => compareSortValues(definition.sortAccessor?.(rowA.original), definition.sortAccessor?.(rowB.original))
      : undefined,
    sortDescFirst: definition.sortDescFirst,
    enableColumnFilter: !!definition.filterType,
    filterFn: definition.filterType === 'number-range'
      ? numberRangeFilter
      : definition.filterType === 'enum'
        ? enumFilter
        : textFilter,
    size: definition.width || 140,
  })), [registry.columns]);

  const table: any = useTable({
    key: registry.id,
    features,
    columns: columns as any,
    data,
    getRowId: (row: DarlingTableRow) => row.id,
    getRowCanExpand: (row: any) => registry.expandable && !!(row.original.details?.length || row.original.links?.length),
    enableSortingRemoval: true,
    enableMultiSort: true,
    isMultiSortEvent: (event: any) => !!event?.shiftKey,
    autoResetPageIndex: true,
    initialState: {
      sorting: startingState.sorting,
      columnFilters: startingState.columnFilters,
      columnVisibility: startingState.columnVisibility,
      columnPinning: { start: startingState.columnPinning.left, end: startingState.columnPinning.right },
      pagination: { pageIndex: 0, pageSize: startingState.pageSize },
      expanded: {},
    },
  } as any, (state: any) => ({
    sorting: state.sorting,
    columnFilters: state.columnFilters,
    columnVisibility: state.columnVisibility,
    columnPinning: state.columnPinning,
    pagination: state.pagination,
    expanded: state.expanded,
  }));

  const portableState: PortableTableState = {
    sorting: table.state.sorting || [],
    columnFilters: table.state.columnFilters || [],
    quickFilters,
    columnVisibility: table.state.columnVisibility || {},
    columnPinning: {
      left: table.state.columnPinning?.start || [],
      right: table.state.columnPinning?.end || [],
    },
    pageSize: table.state.pagination?.pageSize || registry.defaultPageSize,
  };

  useEffect(() => {
    table.setPageIndex?.(0);
    table.setExpanded?.({});
  }, [quickFilters]);

  useEffect(() => {
    if (!onUrlStateChange || registry.id !== 'history-games') return;
    if (initialUrlEffect.current && !forceUrlSyncOnMount) {
      initialUrlEffect.current = false;
      return;
    }
    initialUrlEffect.current = false;
    onUrlStateChange(gameQueryFromState(portableState, { ...urlState, gameLimit }));
  }, [JSON.stringify(portableState.sorting), JSON.stringify(portableState.columnFilters), JSON.stringify(quickFilters)]);

  const applyState = (next: PortableTableState, nextUrlState?: TableUrlState) => {
    const combined = initialPortableState(registry, next, nextUrlState);
    const valid = sanitizePortableState(
      combined,
      registry.columns.map(column => column.id),
      registry.quickFilters.map(filter => filter.id),
    );
    table.setSorting?.(valid.sorting);
    table.setColumnFilters?.(valid.columnFilters);
    table.setColumnVisibility?.(valid.columnVisibility);
    table.setColumnPinning?.({ start: valid.columnPinning.left.slice(0, 1), end: valid.columnPinning.right.slice(0, 1) });
    table.setPageSize?.(valid.pageSize);
    table.setPageIndex?.(0);
    table.setExpanded?.({});
    setQuickFilters(valid.quickFilters);
    setGameLimit(registry.id === 'history-games' && typeof nextUrlState?.gameLimit === 'number' && Number.isFinite(nextUrlState.gameLimit) ? nextUrlState.gameLimit : null);
  };

  const reset = () => {
    applyState(initialPortableState(registry, initialState));
    if (onUrlStateChange && registry.id === 'history-games') {
      onUrlStateChange({
        gameResult: null,
        gameMinScore: null,
        gameMaxScore: null,
        gameSort: null,
        gameLimit: null,
      });
    }
  };
  const prePaginatedRows = table.getPrePaginatedRowModel?.().rows || [];
  const filteredCount = prePaginatedRows.length;
  const limit = gameLimit;
  const pageRows = table.getRowModel().rows;
  const visibleRows = limit ? prePaginatedRows.slice(0, Math.max(0, limit)) : pageRows;
  const resultCount = limit ? Math.min(filteredCount, limit) : filteredCount;
  const visibleColumnCount = table.getVisibleLeafColumns?.().length || registry.columns.length;
  const currentUrlState = registry.id === 'history-games'
    ? { ...urlState, ...gameQueryFromState(portableState, { ...urlState, gameLimit }) }
    : urlState;

  return (
    <div class="interactive-table-shell" data-table-id={registry.id}>
      <TableToolbar
        table={table}
        registry={registry}
        context={context}
        activeQuickFilters={quickFilters}
        onToggleQuickFilter={id => {
          const definition = registry.quickFilters.find(filter => filter.id === id);
          if (definition) setQuickFilters(active => toggleQuickFilter(active, definition, registry.quickFilters));
        }}
        resultCount={resultCount}
        totalCount={rows.length}
        state={portableState}
        urlState={currentUrlState}
        onApplyState={applyState}
        onApplySavedView={view => {
          applyState(view.state, view.urlState);
          if (onApplySavedView && (view.urlState || (view.context && !tableContextsMatch(context, view.context)))) onApplySavedView(view);
        }}
        onReset={reset}
      />
      <div class="interactive-table-scroll table-wrap" tabIndex={0} aria-label={`${registry.id.replaceAll('-', ' ')} table`}>
        <table class="interactive-table" id={registry.tableElementId}>
          <thead>
            {table.getHeaderGroups().map((headerGroup: any) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header: any) => {
                  const sorted = header.column.getIsSorted?.();
                  const definition = registry.columns.find(column => column.id === header.column.id);
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                      class={`${pinnedClass(header.column)}${definition?.hideOnMobile ? ' table-low-priority' : ''}`}
                    >
                      {header.isPlaceholder ? null : (
                        <SortableHeader
                          column={header.column}
                          label={definition?.label || header.column.id}
                          filtered={header.column.getIsFiltered?.()}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.length ? visibleRows.map((row: any) => {
              const detailId = `${registry.tableElementId}-details-${String(row.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
              return (
                <Fragment key={row.id}>
                  <tr class={row.original.rowClass || ''}>
                    {row.getVisibleCells().map((cell: any, index: number) => {
                      const definition = registry.columns.find(column => column.id === cell.column.id);
                      return (
                        <td key={cell.id} class={`${pinnedClass(cell.column)}${definition?.hideOnMobile ? ' table-low-priority' : ''}`}>
                          {index === 0 && row.getCanExpand?.() ? (
                            <button
                              type="button"
                              class="table-expand-button"
                              aria-expanded={row.getIsExpanded?.()}
                              aria-controls={detailId}
                              onClick={row.getToggleExpandedHandler?.()}
                            >
                              <span aria-hidden="true">{row.getIsExpanded?.() ? '−' : '+'}</span>
                              <span class="sr-only">{row.getIsExpanded?.() ? 'Collapse' : 'Expand'} row details</span>
                            </button>
                          ) : null}
                          <table.FlexRender cell={cell} />
                        </td>
                      );
                    })}
                  </tr>
                  {row.getIsExpanded?.() ? <ExpandedRow row={row.original} colSpan={visibleColumnCount} detailId={detailId} /> : null}
                </Fragment>
              );
            }) : (
              <tr><td colSpan={visibleColumnCount} class="muted table-empty-state">{registry.emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!limit && filteredCount > portableState.pageSize ? (
        <div class="table-pagination" aria-label="Table pagination">
          <button type="button" class="btn" disabled={!table.getCanPreviousPage?.()} onClick={() => table.previousPage?.()}>Previous</button>
          <span>Page {(table.state.pagination?.pageIndex || 0) + 1} of {table.getPageCount?.() || 1}</span>
          <button type="button" class="btn" disabled={!table.getCanNextPage?.()} onClick={() => table.nextPage?.()}>Next</button>
          <label>
            <span>Rows</span>
            <select value={portableState.pageSize} onChange={event => table.setPageSize?.(Number((event.currentTarget as any).value))}>
              {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
