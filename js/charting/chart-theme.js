const CHART_COLORS = {
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
};

const OWNER_COLORS = [
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
];

function cssVar(name, fallback, doc = null) {
  const root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root?.documentElement || typeof getComputedStyle !== 'function') return fallback;
  const value = getComputedStyle(root.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function chartFont(doc = null) {
  const root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root?.body || typeof getComputedStyle !== 'function') {
    return 'system-ui, -apple-system, Segoe UI, Roboto, Inter, Ubuntu, Helvetica Neue, Arial, sans-serif';
  }
  return getComputedStyle(root.body).fontFamily;
}

function chartTheme(opts = {}) {
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

function hashString(value) {
  const text = String(value || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function ownerColorScale(owners = [], overrides = new Map()) {
  const order = [...new Set((owners || []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  const colorByOwner = new Map();
  order.forEach((owner, index) => {
    colorByOwner.set(owner, overrides.get(owner) || OWNER_COLORS[index % OWNER_COLORS.length]);
  });
  return owner => colorByOwner.get(owner) || OWNER_COLORS[hashString(owner) % OWNER_COLORS.length];
}

export {
  CHART_COLORS,
  OWNER_COLORS,
  chartFont,
  chartTheme,
  ownerColorScale,
};
