import { getTableRegistryEntry } from '../../tables/table-registry';
import { adaptTrophySeasonRows } from '../../tables/rows/trophy-season-rows';
import type { DarlingTableRuntime } from '../../tables/table-types';

export function registerTrophyTables(runtime: DarlingTableRuntime): void {
  runtime.register('trophy-seasons', getTableRegistryEntry('trophy-seasons'), adaptTrophySeasonRows);
}
