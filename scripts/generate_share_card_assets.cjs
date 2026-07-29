#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const PORTABLE_GLYPHS = Object.freeze({
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  ',': ['00000', '00000', '00000', '00000', '00110', '00100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
});

const PORTABLE_CLASS_STYLE = Object.freeze({
  brand: Object.freeze({ size: 28, scale: 4, fill: '#f8fafc', spacing: 3 }),
  eye: Object.freeze({ size: 16, scale: 2, fill: 'accent', spacing: 1 }),
  label: Object.freeze({ size: 16, scale: 2, fill: '#f8fafc', spacing: 1 }),
  title: Object.freeze({ size: 56, scale: 8, fill: '#f8fafc', spacing: 0 }),
  metric: Object.freeze({ size: 28, scale: 2, fill: '#f8fafc', spacing: 0 }),
  soft: Object.freeze({ size: 16, scale: 1, fill: '#b8c4d8', spacing: 0 }),
  foot: Object.freeze({ size: 15, scale: 2, fill: '#b8c4d8', spacing: 0 }),
});

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

function decodePortableText(value) {
  return value
    .replace(/&(amp|lt|gt|quot|apos);/g, entity => ({
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
    })[entity])
    .toUpperCase()
    .replaceAll(/[–—]/g, '-')
    .replaceAll('·', '.');
}

function portableTextPath(text, x, baseline, style, anchor = 'start') {
  const scale = style.scale;
  const advance = 6 * scale + style.spacing;
  const normalized = decodePortableText(text);
  const width = normalized.length ? normalized.length * advance - scale - style.spacing : 0;
  const startX = anchor === 'end' ? x - width : x;
  const top = baseline - 7 * scale;
  const commands = [];
  [...normalized].forEach((character, characterIndex) => {
    const glyph = PORTABLE_GLYPHS[character];
    if (!glyph) throw new Error(`Default share card portable font is missing ${JSON.stringify(character)}`);
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((bit, columnIndex) => {
        if (bit === '1') {
          commands.push(`M${startX + characterIndex * advance + columnIndex * scale} ${top + rowIndex * scale}h${scale}v${scale}h-${scale}z`);
        }
      });
    });
  });
  return commands.join('');
}

function renderPortableShareCardSvg(svg, accent) {
  return svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (element, attributes, text) => {
    const read = name => attributes.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
    const className = read('class');
    const baseStyle = PORTABLE_CLASS_STYLE[className];
    if (!baseStyle) throw new Error(`Default share card portable font has no style for ${JSON.stringify(className)}`);
    const style = {
      ...baseStyle,
      size: Number(read('font-size')) || baseStyle.size,
      fill: baseStyle.fill === 'accent' ? accent : baseStyle.fill,
    };
    if (className === 'soft' && style.size >= 24) style.scale = 2;
    const pathData = portableTextPath(
      text,
      Number(read('x')),
      Number(read('y')),
      style,
      read('text-anchor'),
    );
    return `<path d="${pathData}" fill="${style.fill}" shape-rendering="crispEdges"/>`;
  });
}

async function generateShareCardBuffer() {
  const { renderShareCardSvg } = await import('../js/share-card-svg.js');
  const svg = renderPortableShareCardSvg(
    renderShareCardSvg(DEFAULT_SHARE_SPEC),
    '#f4c95d',
  );
  return sharp(Buffer.from(svg))
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
  decodePortableText,
  generateShareCardAssets,
  generateShareCardBuffer,
  portableTextPath,
  renderPortableShareCardSvg,
  runCli,
};
