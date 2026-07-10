import type {
  PortableTableState,
  SavedTableView,
  TableContext,
  TableId,
} from './table-types';
import { TABLE_IDS } from './table-types';

export const TABLE_VIEWS_STORAGE_KEY = 'darling.tableViews.v1';
export const MAX_SAVED_TABLE_VIEWS = 25;

const PORTABLE_CONTEXT_KEYS = ['owner', 'rivalryA', 'rivalryB', 'selectedOwner', 'season'] as const;

function storageOrDefault(storage?: Storage | null): Storage | null {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function portableTableContext(context?: TableContext): TableContext | undefined {
  if (!context) return undefined;
  const portable = Object.fromEntries(
    PORTABLE_CONTEXT_KEYS
      .filter(key => Object.prototype.hasOwnProperty.call(context, key))
      .map(key => [key, context[key]]),
  ) as TableContext;
  return Object.keys(portable).length ? portable : undefined;
}

export function tableContextsMatch(current: TableContext = {}, saved?: TableContext): boolean {
  if (!saved) return true;
  const portableSaved = portableTableContext(saved) || {};
  return Object.entries(portableSaved).every(([key, value]) => current[key] === value);
}

function portableState(value: unknown): PortableTableState | null {
  if (!isRecord(value)) return null;
  return {
    sorting: Array.isArray(value.sorting)
      ? value.sorting.filter(item => isRecord(item) && typeof item.id === 'string').map(item => ({ id: String(item.id), desc: !!item.desc }))
      : [],
    columnFilters: Array.isArray(value.columnFilters)
      ? value.columnFilters.filter(item => isRecord(item) && typeof item.id === 'string').map(item => ({ id: String(item.id), value: item.value }))
      : [],
    quickFilters: Array.isArray(value.quickFilters) ? value.quickFilters.filter(item => typeof item === 'string') : [],
    columnVisibility: isRecord(value.columnVisibility)
      ? Object.fromEntries(Object.entries(value.columnVisibility).map(([key, visible]) => [key, visible !== false]))
      : {},
    columnPinning: isRecord(value.columnPinning)
      ? {
          left: Array.isArray(value.columnPinning.left) ? value.columnPinning.left.filter(item => typeof item === 'string') : [],
          right: Array.isArray(value.columnPinning.right) ? value.columnPinning.right.filter(item => typeof item === 'string') : [],
        }
      : { left: [], right: [] },
    pageSize: [25, 50, 100].includes(Number(value.pageSize)) ? Number(value.pageSize) : 25,
  };
}

export function readSavedViews(storage?: Storage | null): SavedTableView[] {
  const target = storageOrDefault(storage);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(TABLE_VIEWS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => {
      if (!isRecord(item) || item.version !== 1 || typeof item.id !== 'string' || typeof item.tableId !== 'string' || !TABLE_IDS.includes(item.tableId as TableId) || typeof item.name !== 'string') return [];
      const state = portableState(item.state);
      if (!state) return [];
      return [{
        id: item.id,
        version: 1,
        tableId: item.tableId as TableId,
        name: item.name.trim(),
        state,
        context: isRecord(item.context) ? portableTableContext(item.context as TableContext) : undefined,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
      } satisfies SavedTableView];
    }).filter(view => view.name).slice(0, MAX_SAVED_TABLE_VIEWS);
  } catch {
    return [];
  }
}

function writeSavedViews(views: SavedTableView[], storage?: Storage | null): boolean {
  const target = storageOrDefault(storage);
  if (!target) return false;
  try {
    target.setItem(TABLE_VIEWS_STORAGE_KEY, JSON.stringify(views.slice(0, MAX_SAVED_TABLE_VIEWS)));
    return true;
  } catch {
    return false;
  }
}

export function sanitizePortableState(
  state: PortableTableState,
  validColumnIds: string[],
  validQuickFilterIds: string[],
): PortableTableState {
  const columns = new Set(validColumnIds);
  const quickFilters = new Set(validQuickFilterIds);
  return {
    sorting: state.sorting.filter(item => columns.has(item.id)),
    columnFilters: state.columnFilters.filter(item => columns.has(item.id)),
    quickFilters: state.quickFilters.filter(id => quickFilters.has(id)),
    columnVisibility: Object.fromEntries(Object.entries(state.columnVisibility).filter(([id]) => columns.has(id))),
    columnPinning: {
      left: state.columnPinning.left.filter(id => columns.has(id)),
      right: state.columnPinning.right.filter(id => columns.has(id)),
    },
    pageSize: [25, 50, 100].includes(state.pageSize) ? state.pageSize : 25,
  };
}

export function saveView(
  tableId: TableId,
  name: string,
  state: PortableTableState,
  context?: TableContext,
  storage?: Storage | null,
  options: { replaceExisting?: boolean } = {},
): SavedTableView | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const views = readSavedViews(storage);
  const existing = views.find(view => view.tableId === tableId && view.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  if (existing && !options.replaceExisting) return null;
  const now = new Date().toISOString();
  const view: SavedTableView = {
    id: existing?.id || `${tableId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    tableId,
    name: trimmed,
    state,
    context: portableTableContext(context),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const next = [view, ...views.filter(item => item.id !== view.id)].slice(0, MAX_SAVED_TABLE_VIEWS);
  return writeSavedViews(next, storage) ? view : null;
}

export function renameView(id: string, name: string, storage?: Storage | null): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const views = readSavedViews(storage);
  const target = views.find(view => view.id === id);
  if (!target) return false;
  const collision = views.some(view => view.id !== id && view.tableId === target.tableId && view.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  if (collision) return false;
  target.name = trimmed;
  target.updatedAt = new Date().toISOString();
  return writeSavedViews(views, storage);
}

export function deleteView(id: string, storage?: Storage | null): boolean {
  const views = readSavedViews(storage);
  const next = views.filter(view => view.id !== id);
  return next.length !== views.length && writeSavedViews(next, storage);
}
