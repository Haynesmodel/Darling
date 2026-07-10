interface SortableHeaderProps {
  column: any;
  label: string;
  filtered?: boolean;
}

export default function SortableHeader({ column, label, filtered }: SortableHeaderProps) {
  if (!column.getCanSort?.()) return <span>{label}</span>;
  const sorted = column.getIsSorted?.();
  const priority = sorted ? column.getSortIndex?.() + 1 : null;
  const direction = sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'unsorted';
  return (
    <button
      type="button"
      class={`table-sort-button${filtered ? ' is-filtered' : ''}`}
      onClick={column.getToggleSortingHandler?.()}
      aria-label={`Sort ${label}; currently ${direction}`}
      title={`Sort ${label}. Shift-click to add a secondary sort.`}
    >
      <span>{label}</span>
      <span class="table-sort-indicator" aria-hidden="true">
        {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
        {priority && priority > 1 ? <sup>{priority}</sup> : null}
      </span>
      {filtered ? <span class="table-filter-dot" aria-label="Filtered">•</span> : null}
    </button>
  );
}
