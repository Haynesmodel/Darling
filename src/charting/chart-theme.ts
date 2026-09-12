export const CHART_COLORS = Object.freeze({
  blue: '#2563eb',
  amber: '#f59e0b',
  green: '#16a34a',
  red: '#dc2626',
  violet: '#8b5cf6',
  cyan: '#0891b2',
  lime: '#65a30d',
  pink: '#db2777',
  orange: '#ea580c',
  teal: '#0f766e',
  slate: '#475569',
  border: '#e5e7eb',
  grid: '#dbe3ee',
  muted: '#6b7280',
  text: '#111827',
  panel: '#ffffff',
});

export const OWNER_COLORS = Object.freeze([
  CHART_COLORS.blue,
  CHART_COLORS.amber,
  '#10b981',
  '#ef4444',
  CHART_COLORS.violet,
  '#0ea5e9',
  '#84cc16',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#7c3aed',
  '#dc2626',
]);

export interface ChartThemeOptions {
  doc?: Document | null;
}

function cssVar(name: string, fallback: string, doc: Document | null = null): string {
  const root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root?.documentElement || typeof getComputedStyle !== 'function') return fallback;
  return getComputedStyle(root.documentElement).getPropertyValue(name).trim() || fallback;
}

export function chartFont(doc: Document | null = null): string {
  const root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root?.body || typeof getComputedStyle !== 'function') {
    return 'system-ui, -apple-system, Segoe UI, Roboto, Inter, Ubuntu, Helvetica Neue, Arial, sans-serif';
  }
  return getComputedStyle(root.body).fontFamily;
}

export function chartTheme(opts: ChartThemeOptions = {}) {
  const doc = opts.doc || null;
  return {
    fontFamily: chartFont(doc),
    background: 'transparent',
    color: cssVar('--text', CHART_COLORS.text, doc),
    muted: cssVar('--muted', CHART_COLORS.muted, doc),
    grid: cssVar('--border', CHART_COLORS.grid, doc),
    panel: cssVar('--panel', CHART_COLORS.panel, doc),
    accent: cssVar('--accent', CHART_COLORS.blue, doc),
    marginLeft: 56,
    marginRight: 24,
    marginTop: 28,
    marginBottom: 44,
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function ownerColorScale(
  owners: readonly string[] = [],
  overrides: ReadonlyMap<string, string> = new Map(),
): (owner: string) => string {
  const order = [...new Set(owners.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const colorByOwner = new Map<string, string>();
  order.forEach((owner, index) => {
    colorByOwner.set(owner, overrides.get(owner) || OWNER_COLORS[index % OWNER_COLORS.length] || CHART_COLORS.blue);
  });
  return owner => colorByOwner.get(owner) || OWNER_COLORS[hashString(owner) % OWNER_COLORS.length] || CHART_COLORS.blue;
}
