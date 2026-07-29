#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const DEFAULT_SHARE_SPEC = Object.freeze({
  schemaVersion: 1,
  id: 'league:darling-default',
  kind: 'season-recap',
  eyebrow: 'League history · Current season · Rivalries',
  title: 'The Darling',
  subtitle: 'Trophies, Dynasty, Draft Spot, weekly recaps, and the stories behind the league.',
  metrics: Object.freeze([
    Object.freeze({ label: 'League history', value: '2014–present', detail: 'Every verified season' }),
    Object.freeze({ label: 'Current season', value: 'Weekly pulse', detail: 'Matchups and standings' }),
    Object.freeze({ label: 'Owners', value: 'Rivalries', detail: 'Records and trophies' }),
    Object.freeze({ label: 'Tools', value: 'Dynasty + Draft', detail: 'Deep league analysis' }),
  ]),
  canonicalUrl: 'https://haynesmodel.github.io/Darling/',
  sourceLabel: 'haynesmodel.github.io/Darling',
  dataVersion: 'league-default',
  altText: 'The Darling league site: history, current season, rivalries, trophies, Dynasty, Draft Spot, and weekly recaps.',
  accent: 'gold',
  filename: 'darling-default-card.png',
});

async function generateShareCardBuffer() {
  const { renderShareCardSvg } = await import('../js/share-card-svg.js');
  return sharp(Buffer.from(renderShareCardSvg(DEFAULT_SHARE_SPEC)))
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

async function generateShareCardAssets(root = process.cwd(), options = {}) {
  const output = options.output || path.join(root, 'assets', 'share', 'darling-default-card.png');
  const buffer = await generateShareCardBuffer();
  if (options.check) {
    if (!fs.existsSync(output)) throw new Error('Default share card is missing; run npm run generate:share-assets.');
    if (!buffer.equals(fs.readFileSync(output))) throw new Error('Default share card has drifted; run npm run generate:share-assets.');
    return { output, buffer, changed: false };
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const changed = !fs.existsSync(output) || !buffer.equals(fs.readFileSync(output));
  if (changed) fs.writeFileSync(output, buffer);
  return { output, buffer, changed };
}

async function runCli(options = {}) {
  const root = options.root || process.cwd();
  const args = options.args || process.argv.slice(2);
  const logger = options.logger || console;
  const check = args.includes('--check');
  try {
    const result = await generateShareCardAssets(root, { check });
    logger.log(check
      ? `Default share card is current (${result.buffer.length} bytes).`
      : `Generated ${path.relative(root, result.output)} (${result.buffer.length} bytes).`);
    return 0;
  } catch (error) {
    logger.error(error.message);
    return 1;
  }
}

if (require.main === module) runCli().then(code => { process.exitCode = code; });

module.exports = {
  DEFAULT_SHARE_SPEC,
  generateShareCardAssets,
  generateShareCardBuffer,
  runCli,
};
