function seedText(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function hashSeed(value) {
  const text = seedText(value);
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function seededRng(seed) {
  let state = hashSeed(seed) || 1;
  return function rng() {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17; state >>>= 0;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

function gaussianSample(mean, stdev, rng) {
  if (!Number.isFinite(stdev) || stdev <= 0) return mean;
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = Math.max(rng(), Number.EPSILON);
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stdev;
}

export { gaussianSample, hashSeed, seededRng };
