import type { QuickFilterDefinition } from './table-types';

export function toggleQuickFilter(
  active: string[],
  filter: QuickFilterDefinition,
  definitions: QuickFilterDefinition[],
): string[] {
  if (active.includes(filter.id)) return active.filter(id => id !== filter.id);
  const sameGroup = new Set(
    definitions
      .filter(item => filter.group && item.group === filter.group)
      .map(item => item.id),
  );
  return [...active.filter(id => !sameGroup.has(id)), filter.id];
}

export function filterByQuickFilters<T>(
  rows: T[],
  active: string[],
  definitions: QuickFilterDefinition[],
  context: Record<string, unknown> = {},
): T[] {
  if (!active.length) return rows;
  const byId = new Map(definitions.map(definition => [definition.id, definition]));
  const predicates = active.map(id => byId.get(id)).filter(Boolean) as QuickFilterDefinition[];
  return rows.filter(row => predicates.every(definition => definition.test(row as any, context)));
}
