// Compact browser guard for the optional LeagueLore asset. Full structural and
// semantic validation remains in scripts/data/schema-validation.cjs.
import type { LeagueLore } from './asset-types';

const presentations = new Set(['dialog', 'overlay', 'callout', 'crown', 'fog', 'confetti', 'chairs', 'target', 'ticket', 'cake', 'rattle', 'bagel-shower', 'flies', 'suitcase', 'podium', 'snake-tail', 'static']);
const activations = new Set(['search', 'triple-activate', 'selection', 'filter-state', 'render-condition', 'theme-sequence', 'owner-emblem', 'collection-open']);
const categories = new Set(['season-moment', 'punishment', 'commissioner', 'draft-weekend', 'hall-of-asterisks', 'league-moment', 'micro-entry', 'record']);
const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isOwner = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isYear = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 2014 && value <= 2100);

export function isLeagueLore(value: unknown): value is LeagueLore {
  if (!isObject(value) || value.schema_version !== 1 || typeof value.enabled !== 'boolean' || typeof value.updated_at !== 'string') return false;
  if (!isObject(value.source_policy) || !Array.isArray(value.owners) || !Array.isArray(value.commissioner_terms) || !Array.isArray(value.collections) || !Array.isArray(value.effects) || !Array.isArray(value.entries) || !Array.isArray(value.triggers)) return false;
  if (!Array.isArray(value.source_policy.numeric_authority) || !Number.isInteger(value.source_policy.almanac_narrative_through)) return false;
  if (value.owners.some(owner => !isObject(owner) || !isOwner(owner.owner) || !Array.isArray(owner.aliases))) return false;
  if (value.effects.some(effect => !isObject(effect) || !isId(effect.id) || typeof effect.enabled !== 'boolean' || !presentations.has(effect.presentation) || !Number.isInteger(effect.duration_ms) || effect.duration_ms < 0 || effect.duration_ms > 2500)) return false;
  if (value.entries.some(entry => !isObject(entry) || !isId(entry.id) || !categories.has(entry.category) || typeof entry.title !== 'string' || typeof entry.teaser !== 'string' || !Array.isArray(entry.body) || !isYear(entry.season) || !isYear(entry.occurred_year) || !isYear(entry.completed_year) || !isYear(entry.almanac_edition) || !Array.isArray(entry.anchors) || !Array.isArray(entry.search_terms) || typeof entry.enabled !== 'boolean')) return false;
  if (value.collections.some(collection => !isObject(collection) || !isId(collection.id) || !Array.isArray(collection.entry_ids) || !Array.isArray(collection.search_terms) || typeof collection.enabled !== 'boolean')) return false;
  if (value.triggers.some(trigger => !isObject(trigger) || !isId(trigger.id) || !activations.has(trigger.activation) || (!trigger.entry_id && !trigger.collection_id) || typeof trigger.enabled !== 'boolean')) return false;
  return true;
}
