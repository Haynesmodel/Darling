const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { HERO_REQUIREMENTS } = require('./constants.cjs');
const { sha256Buffer } = require('./canonical-json.cjs');

function magicMatches(buffer, format) {
  if (format === 'jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (format === 'webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (format === 'avif') {
    if (buffer.length < 12 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
    return ['avif', 'avis', 'mif1'].includes(buffer.subarray(8, 12).toString('ascii'));
  }
  return false;
}

async function inspectHeroAssets(root = process.cwd()) {
  const errors = [];
  const warnings = [];
  const variants = [];
  let expectedRatio = null;

  for (const requirement of HERO_REQUIREMENTS) {
    const relativePath = `assets/hero/${requirement.file}`;
    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      errors.push(`ERROR [MEDIA_MISSING] ${relativePath}: runtime-required hero variant is missing`);
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    if (!magicMatches(buffer, requirement.format)) {
      errors.push(`ERROR [MEDIA_SIGNATURE] ${relativePath}: magic bytes do not match ${requirement.format}`);
      continue;
    }
    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch (error) {
      errors.push(`ERROR [MEDIA_DECODE] ${relativePath}: Sharp could not decode the image (${error.message})`);
      continue;
    }
    const actualFormat = metadata.format === 'jpg'
      ? 'jpeg'
      : metadata.format === 'heif' && requirement.format === 'avif'
        ? 'avif'
        : metadata.format;
    if (actualFormat !== requirement.format) errors.push(`ERROR [MEDIA_FORMAT] ${relativePath}: decoder reports ${actualFormat}, expected ${requirement.format}`);
    if (metadata.width !== requirement.width) errors.push(`ERROR [MEDIA_WIDTH] ${relativePath}: width ${metadata.width}, expected ${requirement.width}`);
    if (!metadata.height) errors.push(`ERROR [MEDIA_HEIGHT] ${relativePath}: decoder did not report a height`);
    const ratio = metadata.width && metadata.height ? metadata.width / metadata.height : null;
    if (requirement.width === 1920 && requirement.format === 'jpeg') expectedRatio = ratio;
    if (buffer.length > requirement.maxBytes) {
      errors.push(`ERROR [MEDIA_SIZE] ${relativePath}: ${(buffer.length / 1024).toFixed(1)} KB exceeds ${(requirement.maxBytes / 1024).toFixed(0)} KB`);
    }
    variants.push({
      path: relativePath,
      format: requirement.format,
      width: metadata.width || 0,
      height: metadata.height || 0,
      bytes: buffer.length,
      sha256: sha256Buffer(buffer),
      max_bytes: requirement.maxBytes,
      _ratio: ratio,
    });
  }

  if (expectedRatio) {
    for (const variant of variants) {
      if (variant._ratio && Math.abs(variant._ratio - expectedRatio) > 0.01) {
        errors.push(`ERROR [MEDIA_ASPECT_RATIO] ${variant.path}: aspect ratio ${variant._ratio.toFixed(3)} differs from ${expectedRatio.toFixed(3)}`);
      }
    }
  }
  variants.forEach(variant => delete variant._ratio);

  const sourcePath = path.join(root, 'assets', 'LeaguePic.jpeg');
  const placeholderPath = path.join(root, 'assets', '.LeaguePic.jpeg.icloud');
  const fallbackPath = path.join(root, 'assets', 'hero', 'league-1920.jpg');
  const sourceAvailable = fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile() && fs.statSync(sourcePath).size > 0;
  const sourceOffloaded = !sourceAvailable && fs.existsSync(placeholderPath);
  const fallbackAvailable = fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isFile() && fs.statSync(fallbackPath).size > 0;
  if (sourceOffloaded && fallbackAvailable) {
    warnings.push('WARN  [MEDIA_SOURCE_OFFLOADED] assets/LeaguePic.jpeg: original is offloaded to iCloud; runtime variants are valid and assets/hero/league-1920.jpg can regenerate them');
  } else if (!sourceAvailable && !fallbackAvailable) {
    errors.push('ERROR [MEDIA_REGENERATION_SOURCE_MISSING] assets/LeaguePic.jpeg: download the original from iCloud or restore assets/hero/league-1920.jpg before rebuilding the hero');
  }

  return {
    errors,
    warnings,
    variants: variants.sort((a, b) => a.path.localeCompare(b.path)),
    source: {
      role: 'regeneration-optional',
      path: 'assets/LeaguePic.jpeg',
      fallback: 'assets/hero/league-1920.jpg',
      available: sourceAvailable,
      offloaded: sourceOffloaded,
    },
  };
}

async function validateMedia(root = process.cwd(), manifest = null) {
  const result = await inspectHeroAssets(root);
  if (manifest?.media?.leagueHero?.variants) {
    const listed = new Map(manifest.media.leagueHero.variants.map(variant => [variant.path, variant]));
    for (const actual of result.variants) {
      const expected = listed.get(actual.path);
      if (!expected) {
        result.errors.push(`ERROR [MEDIA_MANIFEST_MISSING] ${actual.path}: variant is not listed in asset-manifest.json`);
        continue;
      }
      for (const field of ['format', 'width', 'height', 'bytes', 'sha256', 'max_bytes']) {
        if (actual[field] !== expected[field]) result.errors.push(`ERROR [MEDIA_MANIFEST_MISMATCH] ${actual.path}: ${field} does not match asset-manifest.json`);
      }
    }
  }
  return result;
}

module.exports = {
  inspectHeroAssets,
  magicMatches,
  validateMedia,
};
