const DEFAULT_HISTOGRAM_BINS = 18;

function histogramBins(values, opts = {}) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return [];

  const binCount = Math.max(1, Math.min(50, Math.floor(Number.isFinite(opts.bins) ? opts.bins : DEFAULT_HISTOGRAM_BINS)));
  const min = Number.isFinite(opts.min) ? opts.min : clean.reduce((acc, value) => Math.min(acc, value), clean[0]);
  const max = Number.isFinite(opts.max) ? opts.max : clean.reduce((acc, value) => Math.max(acc, value), clean[0]);

  if (min === max) return [{ start: min - 0.5, end: max + 0.5, count: clean.length }];

  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: min + index * width,
    end: index === binCount - 1 ? max : min + (index + 1) * width,
    count: 0,
  }));

  for (const value of clean) {
    let index = Math.floor((value - min) / width);
    if (!Number.isFinite(index)) continue;
    if (index < 0) index = 0;
    if (index >= binCount) index = binCount - 1;
    bins[index].count += 1;
  }
  return bins;
}

export { histogramBins };
