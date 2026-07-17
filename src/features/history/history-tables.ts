import { getTableRegistryEntry } from '../../tables/table-registry';
import { adaptHistoryGameRows } from '../../tables/rows/history-game-rows';
import { adaptHistoryOpponentRows } from '../../tables/rows/history-opponent-rows';
import { adaptHistorySeasonRows } from '../../tables/rows/history-season-rows';
import { adaptHistoryWeekRows } from '../../tables/rows/history-week-rows';
import type { DarlingTableRuntime, TableId, TableRowAdapter } from '../../tables/table-types';

const tables: Array<[TableId, TableRowAdapter]> = [
  ['history-games', adaptHistoryGameRows],
  ['history-weeks', adaptHistoryWeekRows],
  ['history-opponents', adaptHistoryOpponentRows],
  ['history-seasons', adaptHistorySeasonRows],
];

export function registerHistoryTables(runtime: DarlingTableRuntime): void {
  tables.forEach(([id, adapter]) => runtime.register(id, getTableRegistryEntry(id), adapter));
}
