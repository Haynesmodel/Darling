import { render } from 'preact';
import InteractiveTable from '../components/tables/InteractiveTable';
import { getTableRegistryEntry } from './table-registry';
import { readSavedViews } from './table-saved-views';
import { adaptHistoryGameRows } from './rows/history-game-rows';
import { adaptHistoryOpponentRows } from './rows/history-opponent-rows';
import { adaptHistorySeasonRows } from './rows/history-season-rows';
import { adaptHistoryWeekRows } from './rows/history-week-rows';
import { adaptRivalryGameRows } from './rows/rivalry-game-rows';
import { adaptRivalrySeasonRows } from './rows/rivalry-season-rows';
import { adaptCurrentProjectedRows, adaptCurrentStandingRows } from './rows/current-standing-rows';
import { adaptTrophySeasonRows } from './rows/trophy-season-rows';
import type {
  DarlingTableRow,
  DarlingTableRuntime,
  TableContext,
  TableId,
  TableRenderPayload,
} from './table-types';

function adaptRows(tableId: TableId, rows: unknown[], context: TableContext): DarlingTableRow[] {
  switch (tableId) {
    case 'history-games': return adaptHistoryGameRows(rows, context);
    case 'history-weeks': return adaptHistoryWeekRows(rows, context);
    case 'history-opponents': return adaptHistoryOpponentRows(rows, context);
    case 'history-seasons': return adaptHistorySeasonRows(rows, context);
    case 'rivalry-games': return adaptRivalryGameRows(rows, context);
    case 'rivalry-seasons': return adaptRivalrySeasonRows(rows, context);
    case 'current-standings': return adaptCurrentStandingRows(rows, context);
    case 'current-projected': return adaptCurrentProjectedRows(rows, context);
    case 'trophy-seasons': return adaptTrophySeasonRows(rows, context);
  }
}

export function createTableRuntime(): DarlingTableRuntime {
  return {
    render(tableId: TableId, payload: TableRenderPayload) {
      const baseRegistry = getTableRegistryEntry(tableId);
      const context = payload.context || {};
      const registry = tableId === 'history-opponents' && context.isLeague
        ? {
            ...baseRegistry,
            columns: baseRegistry.columns.map((column, index) => index === 0 ? { ...column, label: 'Team' } : column),
          }
        : baseRegistry;
      const mount = document.getElementById(registry.mountId);
      if (!mount) return;
      render(
        <InteractiveTable
          key={`${tableId}:${payload.instanceKey || 'default'}`}
          registry={registry}
          rows={adaptRows(tableId, payload.rows || [], context)}
          context={context}
          initialState={payload.initialState}
          urlState={payload.urlState}
          onUrlStateChange={payload.onUrlStateChange}
        />,
        mount,
      );
    },
    unmount(tableId: TableId) {
      const mount = document.getElementById(getTableRegistryEntry(tableId).mountId);
      if (mount) render(null, mount);
    },
    listSavedViews() {
      return readSavedViews();
    },
  };
}
