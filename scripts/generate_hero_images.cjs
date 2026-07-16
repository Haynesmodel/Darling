#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');

const HERO_WIDTHS = [480, 768, 1280, 1920];
const FORMATS = [
  { ext: 'avif', options: { quality: 50, effort: 6 } },
  { ext: 'webp', options: { quality: 76 } },
  { ext: 'jpg', options: { quality: 78, mozjpeg: true } },
];

function readGitSource(root, gitPath) {
  const result = spawnSync('git', ['show', `HEAD:${gitPath}`], {
    cwd: root,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status === 0 && result.stdout?.length) return result.stdout;
  return null;
}

function resolveSource(root, requestedSource) {
  const candidates = [
    requestedSource,
    process.env.DARLING_HERO_SOURCE,
    path.join(root, 'assets', 'LeaguePic.jpeg'),
    path.join(root, 'assets', 'hero', 'league-1920.jpg'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate) ? candidate : path.join(root, candidate);
    if (fs.existsSync(absolute)) return { input: absolute, label: path.relative(root, absolute) || absolute };
  }

  const gitSource = readGitSource(root, 'assets/LeaguePic.jpeg');
  if (gitSource) return { input: gitSource, label: 'HEAD:assets/LeaguePic.jpeg' };

  throw new Error([
    'Missing hero regeneration source.',
    'Download assets/LeaguePic.jpeg from iCloud, restore assets/hero/league-1920.jpg,',
    'pass a source path, or set DARLING_HERO_SOURCE.',
  ].join(' '));
}

async function generateHeroImages(root = process.cwd(), requestedSource = process.argv[2]) {
  const outDir = path.join(root, 'assets', 'hero');
  fs.mkdirSync(outDir, { recursive: true });

  const source = resolveSource(root, requestedSource);
  const sourceImage = sharp(source.input, { limitInputPixels: false }).rotate();
  const metadata = await sourceImage.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read hero source dimensions from ${source.label}`);
  }

  const outputs = [];
  for (const width of HERO_WIDTHS) {
    for (const format of FORMATS) {
      const filePath = path.join(outDir, `league-${width}.${format.ext}`);
      let image = sharp(source.input, { limitInputPixels: false })
        .rotate()
        .resize({
          width,
          withoutEnlargement: true,
        });
      if (format.ext === 'avif') image = image.avif(format.options);
      else if (format.ext === 'webp') image = image.webp(format.options);
      else image = image.jpeg(format.options);
      await image.toFile(filePath);
      outputs.push(filePath);
    }
  }

  return {
    source: source.label,
    outputs,
  };
}

async function runCli() {
  try {
    const result = await generateHeroImages();
    console.log(`Generated ${result.outputs.length} hero images from ${result.source}`);
    result.outputs.forEach(filePath => {
      const size = fs.statSync(filePath).size;
      console.log(`- ${path.relative(process.cwd(), filePath)} ${(size / 1024).toFixed(1)} KB`);
    });
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  FORMATS,
  HERO_WIDTHS,
  generateHeroImages,
  resolveSource,
};
