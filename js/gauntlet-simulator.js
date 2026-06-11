const DEFAULT_HISTOGRAM_BINS = 18;
const DEFAULT_BLOWOUT_MARGIN = 20;
const DEFAULT_CLOSE_GAME_MARGIN = 5;

function seedText(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hashSeed(value) {
  const text = seedText(value);
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function seededRng(seed) {
  let state = hashSeed(seed) || 1;
  return function rng() {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state >>>= 0;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function gaussianSample(mean, stdev, rng) {
  if (!Number.isFinite(stdev) || stdev <= 0) return mean;
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = Math.max(rng(), Number.EPSILON);
  const mag = Math.sqrt(-2 * Math.log(u1));
  const z0 = mag * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdev;
}

function weightedSample(events, rng) {
  const clean = events.filter(event => Number.isFinite(event?.score) && Number.isFinite(event?.weight) && event.weight > 0);
  if (!clean.length) return null;
  const totalWeight = clean.reduce((acc, event) => acc + event.weight, 0);
  if (!totalWeight) return null;
  let target = rng() * totalWeight;
  for (const event of clean) {
    target -= event.weight;
    if (target <= 0) return event.score;
  }
  return clean[clean.length - 1].score;
}

function drawScore(teamSeason, model, rng) {
  const scoreEvents = Array.isArray(teamSeason?.scoreEvents) ? teamSeason.scoreEvents : [];
  const scores = Array.isArray(teamSeason?.scores) ? teamSeason.scores : [];
  if (!scores.length) {
    return Number.isFinite(teamSeason?.mean) ? teamSeason.mean : 0;
  }

  if (model === 'historical') {
    if (scoreEvents.length) {
      const sampled = weightedSample(scoreEvents, rng);
      if (sampled !== null) return sampled;
    }
    const index = Math.min(scores.length - 1, Math.floor(rng() * scores.length));
    return scores[index];
  }

  const mean = Number.isFinite(teamSeason?.mean)
    ? teamSeason.mean
    : (scoreEvents.length
      ? (() => {
        const totalWeight = scoreEvents.reduce((acc, event) => acc + event.weight, 0);
        if (!totalWeight) return 0;
        return scoreEvents.reduce((acc, event) => acc + (event.score * event.weight), 0) / totalWeight;
      })()
      : scores.reduce((a, b) => a + b, 0) / scores.length);
  const stdev = Number.isFinite(teamSeason?.stdev)
    ? teamSeason.stdev
    : (scoreEvents.length
      ? (() => {
        const totalWeight = scoreEvents.reduce((acc, event) => acc + event.weight, 0);
        if (!totalWeight) return 0;
        const variance = scoreEvents.reduce((acc, event) => acc + (event.weight * ((event.score - mean) ** 2)), 0) / totalWeight;
        return Math.sqrt(variance);
      })()
      : 0);
  const min = Number.isFinite(teamSeason?.min) ? teamSeason.min : Math.min(...scores);
  const max = Number.isFinite(teamSeason?.max) ? teamSeason.max : Math.max(...scores);
  const raw = gaussianSample(mean, stdev, rng);
  return Math.min(max, Math.max(min, raw));
}

function quantileSorted(sortedValues, q) {
  if (!sortedValues.length) return 0;
  if (q <= 0) return sortedValues[0];
  if (q >= 1) return sortedValues[sortedValues.length - 1];
  const pos = (sortedValues.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sortedValues[lower];
  const weight = pos - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function histogramBins(values, opts = {}) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return [];

  const binCount = Math.max(1, Math.min(50, Math.floor(Number.isFinite(opts.bins) ? opts.bins : DEFAULT_HISTOGRAM_BINS)));
  const min = Number.isFinite(opts.min) ? opts.min : clean.reduce((acc, value) => Math.min(acc, value), clean[0]);
  const max = Number.isFinite(opts.max) ? opts.max : clean.reduce((acc, value) => Math.max(acc, value), clean[0]);

  if (min === max) {
    return [{ start: min - 0.5, end: max + 0.5, count: clean.length }];
  }

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

function simulateMatchup(teamSeasonA, teamSeasonB, opts = {}) {
  const model = opts.model === 'historical' ? 'historical' : 'hybrid';
  const simulations = Math.max(1, Math.min(50000, Math.floor(Number.isFinite(opts.simulations) ? opts.simulations : 10000)));
  const includePostseason = !!opts.includePostseason;
  const seed = opts.seed ?? `${teamSeasonA?.id || 'A'}|${teamSeasonB?.id || 'B'}|${model}|${includePostseason ? 'postseason' : 'regular'}|${simulations}`;
  const rng = seededRng(seed);
  const blowoutMargin = Number.isFinite(opts.blowoutMargin) ? opts.blowoutMargin : DEFAULT_BLOWOUT_MARGIN;
  const closeGameMargin = Number.isFinite(opts.closeGameMargin) ? opts.closeGameMargin : DEFAULT_CLOSE_GAME_MARGIN;

  const scoresA = [];
  const scoresB = [];
  const margins = [];
  let winsA = 0;
  let winsB = 0;
  let actualWinsA = 0;
  let actualWinsB = 0;
  let ties = 0;
  let blowoutWinsA = 0;
  let blowoutWinsB = 0;
  let closeGames = 0;
  let totalA = 0;
  let totalB = 0;

  for (let i = 0; i < simulations; i += 1) {
    const scoreA = drawScore(teamSeasonA, model, rng);
    const scoreB = drawScore(teamSeasonB, model, rng);
    const margin = scoreA - scoreB;

    scoresA.push(scoreA);
    scoresB.push(scoreB);
    margins.push(margin);
    totalA += scoreA;
    totalB += scoreB;

    if (margin > 0) {
      winsA += 1;
      actualWinsA += 1;
      if (margin >= blowoutMargin) blowoutWinsA += 1;
    } else if (margin < 0) {
      winsB += 1;
      actualWinsB += 1;
      if (-margin >= blowoutMargin) blowoutWinsB += 1;
    } else {
      winsA += 0.5;
      winsB += 0.5;
      ties += 1;
    }

    if (Math.abs(margin) <= closeGameMargin) closeGames += 1;
  }

  const sortedMargins = margins.slice().sort((a, b) => a - b);
  const avgA = totalA / simulations;
  const avgB = totalB / simulations;
  const avgMargin = avgA - avgB;
  const medianMargin = quantileSorted(sortedMargins, 0.5);

  return {
    model,
    simulations,
    seed,
    winsA,
    winsB,
    actualWinsA,
    actualWinsB,
    ties,
    pctA: winsA / simulations,
    pctB: winsB / simulations,
    avgA,
    avgB,
    avgMargin,
    medianMargin,
    blowoutPctA: blowoutWinsA / simulations,
    blowoutPctB: blowoutWinsB / simulations,
    closeGamePct: closeGames / simulations,
    scoresA,
    scoresB,
    margins,
    blowoutMargin,
    closeGameMargin,
    includePostseason,
  };
}

export {
  DEFAULT_BLOWOUT_MARGIN,
  DEFAULT_CLOSE_GAME_MARGIN,
  hashSeed,
  seededRng,
  gaussianSample,
  weightedSample,
  drawScore,
  simulateMatchup,
  histogramBins,
};
