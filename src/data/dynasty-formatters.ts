function formatDynastyScore(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return String(Number(value.toFixed(1)));
}

export { formatDynastyScore };
