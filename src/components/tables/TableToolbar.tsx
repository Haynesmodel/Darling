import ColumnFilterMenu from './ColumnFilterMenu';
import SavedViewsMenu from './SavedViewsMenu';
import type {
  PortableTableState,
  SavedTableView,
  TableContext,
  TableRegistryEntry,
} from '../../tables/table-types';

interface TableToolbarProps {
  table: any;
  registry: TableRegistryEntry;
  context: TableContext;
  activeQuickFilters: string[];
  onToggleQuickFilter(id: string): void;
  resultCount: number;
  totalCount: number;
  state: PortableTableState;
  onApplyState(state: PortableTableState): void;
  onApplySavedView(view: SavedTableView): void;
  onReset(): void;
}

export default function TableToolbar({
  table,
  registry,
  context,
  activeQuickFilters,
  onToggleQuickFilter,
  resultCount,
  totalCount,
  state,
  onApplyState,
  onApplySavedView,
  onReset,
}: TableToolbarProps) {
  return (
    <div class="interactive-table-toolbar">
      {registry.quickFilters.length ? (
        <div class="table-quick-filters" aria-label="Quick filters">
          {registry.quickFilters.map(filter => (
            <button
              type="button"
              key={filter.id}
              class={`table-quick-filter${activeQuickFilters.includes(filter.id) ? ' is-active' : ''}`}
              aria-pressed={activeQuickFilters.includes(filter.id)}
              onClick={() => onToggleQuickFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}
      <div class="table-toolbar-actions">
        <span class="table-result-count" aria-live="polite">{resultCount} of {totalCount}</span>
        <details class="table-menu table-filter-menu">
          <summary class="btn">Filters{state.columnFilters.length ? ` (${state.columnFilters.length})` : ''}</summary>
          <div class="table-menu-panel table-filter-grid">
            {registry.columns.filter(column => column.filterType).map(definition => {
              const column = table.getColumn(definition.id);
              return (
                <ColumnFilterMenu
                  key={definition.id}
                  column={definition}
                  value={column?.getFilterValue?.()}
                  onChange={value => {
                    column?.setFilterValue?.(value);
                    table.setPageIndex?.(0);
                  }}
                />
              );
            })}
          </div>
        </details>
        <details class="table-menu table-columns-menu">
          <summary class="btn">Columns</summary>
          <div class="table-menu-panel">
            {registry.columns.map(definition => {
              const column = table.getColumn(definition.id);
              if (!column) return null;
              return (
                <div class="table-column-option" key={definition.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={column.getIsVisible?.()}
                      onChange={column.getToggleVisibilityHandler?.()}
                    />
                    <span>{definition.label}</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={column.getIsPinned?.() === 'start'}
                      onChange={() => {
                        const alreadyPinned = column.getIsPinned?.() === 'start';
                        table.setColumnPinning?.({ start: alreadyPinned ? [] : [definition.id], end: [] });
                      }}
                    />
                    <span>Pin</span>
                  </label>
                </div>
              );
            })}
          </div>
        </details>
        <SavedViewsMenu
          registry={registry}
          context={context}
          state={state}
          onApplyState={onApplyState}
          onApplySavedView={onApplySavedView}
        />
        <button type="button" class="btn" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
}
