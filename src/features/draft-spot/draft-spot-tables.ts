import { getTableRegistryEntry } from '../../tables/table-registry';
import { adaptDraftSpotRows } from '../../tables/rows/draft-spot-rows';
import type { DarlingTableRuntime } from '../../tables/table-types';

export function registerDraftSpotTables(runtime: DarlingTableRuntime): void {
  runtime.register('draft-rows', getTableRegistryEntry('draft-rows'), adaptDraftSpotRows);
}
