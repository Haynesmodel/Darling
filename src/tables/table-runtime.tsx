import { render } from 'preact';
import InteractiveTable from '../components/tables/InteractiveTable';
import './table.entry.css';
import { readSavedViews, tableContextsMatch } from './table-saved-views';
import type {
  DarlingTableRuntime,
  SavedTableView,
  TableContext,
  TableId,
  TableRegistryEntry,
  TableRenderPayload,
  TableRowAdapter,
} from './table-types';

const pendingSavedViews = new Map<TableId, SavedTableView>();

export function createTableRuntime(): DarlingTableRuntime {
  const registrations = new Map<TableId, { definition: TableRegistryEntry; adapter: TableRowAdapter }>();
  const registration = (tableId: TableId) => {
    const found = registrations.get(tableId);
    if (!found) throw new Error(`Table ${tableId} is not registered. Register it from its owning feature before rendering.`);
    return found;
  };
  return {
    register(tableId, definition, adapter) {
      if (definition.id !== tableId) throw new Error(`Table definition ${definition.id} cannot be registered as ${tableId}`);
      const existing = registrations.get(tableId);
      if (existing) {
        if (existing.definition === definition && existing.adapter === adapter) return;
        throw new Error(`Table ${tableId} is already registered`);
      }
      registrations.set(tableId, { definition, adapter });
    },
    isRegistered(tableId) {
      return registrations.has(tableId);
    },
    render(tableId: TableId, payload: TableRenderPayload) {
      const { definition: baseRegistry, adapter } = registration(tableId);
      const context = payload.context || {};
      const registry = tableId === 'history-opponents' && context.isLeague
        ? {
            ...baseRegistry,
            columns: baseRegistry.columns.map((column, index) => index === 0 ? { ...column, label: 'Team' } : column),
          }
        : baseRegistry;
      const mount = document.getElementById(registry.mountId);
      if (!mount) return;
      const pendingView = pendingSavedViews.get(tableId);
      const restorePendingView = !!pendingView && tableContextsMatch(context, pendingView.context);
      if (restorePendingView) pendingSavedViews.delete(tableId);
      render(
        <InteractiveTable
          key={`${tableId}:${payload.instanceKey || 'default'}:${restorePendingView ? pendingView?.id : 'current'}`}
          registry={registry}
          rows={adapter(payload.rows || [], context)}
          context={context}
          initialState={restorePendingView ? pendingView?.state : payload.initialState}
          urlState={payload.urlState}
          onUrlStateChange={payload.onUrlStateChange}
          forceUrlSyncOnMount={restorePendingView}
          onApplySavedView={view => {
            if (!payload.onContextChange) return;
            pendingSavedViews.set(tableId, view);
            payload.onContextChange(view.context || {}, view.urlState);
          }}
        />,
        mount,
      );
    },
    unmount(tableId: TableId) {
      const mount = document.getElementById(registration(tableId).definition.mountId);
      if (mount) render(null, mount);
    },
    listSavedViews() {
      return readSavedViews();
    },
  };
}
