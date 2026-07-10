import type { TableColumnDefinition } from '../../tables/table-types';

interface ColumnFilterMenuProps {
  column: TableColumnDefinition;
  value: any;
  onChange(value: unknown): void;
}

export default function ColumnFilterMenu({ column, value, onChange }: ColumnFilterMenuProps) {
  if (column.filterType === 'number-range') {
    const range = value && typeof value === 'object' ? value : {};
    return (
      <fieldset class="table-filter-fieldset">
        <legend>{column.label}</legend>
        <label>
          <span>Min</span>
          <input
            aria-label={`${column.label} minimum`}
            type="number"
            value={range.min ?? ''}
            onInput={(event) => onChange({ ...range, min: (event.currentTarget as any).value === '' ? null : Number((event.currentTarget as any).value) })}
          />
        </label>
        <label>
          <span>Max</span>
          <input
            aria-label={`${column.label} maximum`}
            type="number"
            value={range.max ?? ''}
            onInput={(event) => onChange({ ...range, max: (event.currentTarget as any).value === '' ? null : Number((event.currentTarget as any).value) })}
          />
        </label>
      </fieldset>
    );
  }

  if (column.filterType === 'enum') {
    return (
      <label class="table-filter-field">
        <span>{column.label}</span>
        <select
          aria-label={`Filter ${column.label}`}
          value={String(value ?? '')}
          onChange={(event) => onChange((event.currentTarget as any).value || undefined)}
        >
          <option value="">All</option>
          {(column.filterOptions || []).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }

  return (
    <label class="table-filter-field">
      <span>{column.label}</span>
      <input
        aria-label={`Filter ${column.label}`}
        type="search"
        value={String(value ?? '')}
        placeholder={`Search ${column.label.toLocaleLowerCase()}`}
        onInput={(event) => onChange((event.currentTarget as any).value)}
      />
    </label>
  );
}
