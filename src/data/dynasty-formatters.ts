export function formatDynastyScore(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(1));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}
