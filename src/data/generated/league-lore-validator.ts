// Compact browser guard for the optional LeagueLore asset. Full structural and
// semantic validation remains in scripts/data/schema-validation.cjs.
import type { LeagueLore } from './asset-types';

export function isLeagueLore(value: unknown): value is LeagueLore {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (value as any).schema_version === 1
    && typeof (value as any).enabled === 'boolean'
    && Array.isArray((value as any).entries)
    && Array.isArray((value as any).triggers));
}
