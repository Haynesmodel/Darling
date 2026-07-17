import { getTableRegistryEntry } from '../../tables/table-registry';
import { adaptRivalryGameRows } from '../../tables/rows/rivalry-game-rows';
import { adaptRivalrySeasonRows } from '../../tables/rows/rivalry-season-rows';
import type { DarlingTableRuntime } from '../../tables/table-types';

export function registerRivalryTables(runtime: DarlingTableRuntime): void {
  runtime.register('rivalry-games', getTableRegistryEntry('rivalry-games'), adaptRivalryGameRows);
  runtime.register('rivalry-seasons', getTableRegistryEntry('rivalry-seasons'), adaptRivalrySeasonRows);
}
