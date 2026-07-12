import type { ComponentChildren } from 'preact';

export const TABLE_IDS = [
  'history-opponents',
  'history-seasons',
  'history-weeks',
  'history-games',
  'rivalry-seasons',
  'rivalry-games',
  'current-standings',
  'current-projected',
  'trophy-seasons',
] as const;

export type TableId = typeof TABLE_IDS[number];

export type ColumnFilterType = 'text' | 'enum' | 'number-range';

export interface PortableTableState {
  sorting: Array<{ id: string; desc: boolean }>;
  columnFilters: Array<{ id: string; value: unknown }>;
  quickFilters: string[];
  columnVisibility: Record<string, boolean>;
  columnPinning: { left: string[]; right: string[] };
  pageSize: number;
}

export interface SavedTableView {
  id: string;
  version: 1;
  tableId: TableId;
  name: string;
  state: PortableTableState;
  context?: TableContext;
  urlState?: TableUrlState;
  createdAt: string;
  updatedAt: string;
}

export interface TableContext {
  owner?: string | null;
  rivalryA?: string | null;
  rivalryB?: string | null;
  selectedOwner?: string | null;
  season?: number;
  [key: string]: unknown;
}

export interface DarlingTableRow {
  id: string;
  rowClass?: string;
  details?: Array<{ label: string; value: string }>;
  links?: Array<{ label: string; href: string }>;
  [key: string]: unknown;
}

export interface TableColumnDefinition {
  id: string;
  label: string;
  accessor?: (row: DarlingTableRow) => unknown;
  sortAccessor?: (row: DarlingTableRow) => unknown;
  render?: (value: unknown, row: DarlingTableRow) => ComponentChildren;
  sortable?: boolean;
  sortDescFirst?: boolean;
  filterType?: ColumnFilterType;
  filterOptions?: string[];
  hideOnMobile?: boolean;
  hidden?: boolean;
  width?: number;
}

export interface QuickFilterDefinition {
  id: string;
  label: string;
  group?: string;
  test: (row: DarlingTableRow, context: TableContext) => boolean;
}

export interface TableRegistryEntry {
  id: TableId;
  mountId: string;
  tableElementId: string;
  columns: TableColumnDefinition[];
  defaultSorting: PortableTableState['sorting'];
  defaultPinned: string[];
  defaultPageSize: number;
  quickFilters: QuickFilterDefinition[];
  builtInViews?: Array<{ name: string; state: Partial<PortableTableState> }>;
  emptyMessage: string;
  expandable: boolean;
}

export interface TableUrlState {
  seasons?: number[];
  weeks?: number[];
  opps?: string[];
  types?: string[];
  rounds?: string[];
  gameResult?: string | null;
  gameMinScore?: number | null;
  gameMaxScore?: number | null;
  gameSort?: string | null;
  gameLimit?: number | null;
}

export interface TableRenderPayload {
  rows: unknown[];
  context?: TableContext;
  instanceKey?: string;
  initialState?: Partial<PortableTableState>;
  urlState?: TableUrlState;
  onUrlStateChange?: (state: TableUrlState) => void;
  onContextChange?: (context: TableContext, urlState?: TableUrlState) => void;
}

export interface DarlingTableRuntime {
  render(tableId: TableId, payload: TableRenderPayload): void;
  unmount(tableId: TableId): void;
  listSavedViews(): SavedTableView[];
}
