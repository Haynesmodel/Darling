const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const environment = { origin: 'https://example.com', basePath: '/Darling/' };
let temp;
let share;

function candidate(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'matchup:2025-17-a-b',
    kind: 'matchup',
    eyebrow: '2025 Championship',
    title: 'Alpha vs Beta',
    subtitle: 'Alpha wins',
    metrics: [
      { label: 'Alpha', value: '120.50', detail: 'Winner' },
      { label: 'Beta', value: '100.25', detail: 'Final' },
    ],
    canonicalUrl: 'https://example.com/Darling/?tab=current',
    sourceLabel: 'Current Season',
    dataVersion: 'sha256:fixture',
    altText: 'Alpha defeated Beta, 120.50 to 100.25.',
    accent: 'red',
    filename: 'darling-matchup-alpha-beta.png',
    ...overrides,
  };
}

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-share-spec-'));
  await esbuild.build({
    entryPoints: [
      path.join(root, 'src/share/share-card-spec.ts'),
      path.join(root, 'src/share/share-card-builders.ts'),
      path.join(root, 'js/share-card-svg.js'),
    ],
    outdir: temp,
    bundle: true,
    splitting: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    entryNames: '[name]',
    logLevel: 'silent',
  });
  const spec = await import(`${pathToFileURL(path.join(temp, 'share-card-spec.js')).href}?${Date.now()}`);
  const builders = await import(`${pathToFileURL(path.join(temp, 'share-card-builders.js')).href}?${Date.now()}`);
  const svg = await import(`${pathToFileURL(path.join(temp, 'share-card-svg.js')).href}?${Date.now()}`);
  share = { ...spec, ...builders, ...svg };
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('valid specs normalize, freeze, and serialize deterministically at 1200x630', () => {
  const result = share.validateShareCardSpec(candidate({ title: '  Alpha   vs   Beta  ' }), environment);
  assert.equal(result.ok, true);
  assert.equal(result.spec.title, 'Alpha vs Beta');
  assert.equal(Object.isFrozen(result.spec), true);
  assert.equal(Object.isFrozen(result.spec.metrics), true);
  const first = share.renderShareCardSvg(result.spec);
  assert.equal(first, share.renderShareCardSvg(result.spec));
  assert.match(first, /width="1200" height="630"/);
  assert.match(first, /<title id="title">Alpha vs Beta<\/title>/);
  assert.match(first, /<desc id="desc">Alpha defeated Beta/);
  assert.doesNotMatch(first, /foreignObject|<script|onload=|xlink:href|<image/i);
});

test('text and metric boundaries return stable error codes', () => {
  const exact = candidate({
    id: 'i'.repeat(96),
    eyebrow: 'e'.repeat(48),
    title: 't'.repeat(90),
    subtitle: 's'.repeat(140),
    sourceLabel: 'l'.repeat(48),
    dataVersion: 'd'.repeat(96),
    altText: 'a'.repeat(240),
    metrics: Array.from({ length: 4 }, (_, index) => ({
      label: `${index}`.padEnd(32, 'l'),
      value: `${index}`.padEnd(48, 'v'),
      detail: `${index}`.padEnd(80, 'd'),
    })),
  });
  assert.equal(share.validateShareCardSpec(exact, environment).ok, true);
  assert.equal(share.validateShareCardSpec(candidate({ title: 'x'.repeat(91) }), environment).code, 'INVALID_TEXT');
  assert.equal(share.validateShareCardSpec(candidate({ title: 'bad\ntext' }), environment).code, 'INVALID_TEXT');
  assert.equal(share.validateShareCardSpec(candidate({ metrics: exact.metrics.concat({ label: 'x', value: 'y' }) }), environment).code, 'TOO_MANY_METRICS');
  assert.equal(share.validateShareCardSpec(candidate({ metrics: [{ label: 'x', value: 'y' }] }), environment).code, 'INCOMPLETE_DATA');
  assert.equal(share.validateShareCardSpec(candidate({ kind: 'unknown' }), environment).code, 'UNSUPPORTED_KIND');
  assert.equal(share.validateShareCardSpec(candidate({ accent: 'orange' }), environment).code, 'INVALID_TEXT');
});

test('canonical URLs and filenames fail closed', () => {
  for (const canonicalUrl of [
    'https://attacker.example/Darling/',
    'https://example.com/outside/',
    'javascript:alert(1)',
  ]) assert.equal(share.validateShareCardSpec(candidate({ canonicalUrl }), environment).code, 'INVALID_URL');
  for (const filename of ['../card.png', 'folder/card.png', 'card.svg', 'Bad.png']) {
    assert.equal(share.validateShareCardSpec(candidate({ filename }), environment).code, 'INVALID_TEXT');
  }
  const hashed = share.validateShareCardSpec(candidate({ canonicalUrl: 'https://example.com/Darling/?tab=current#private' }), environment);
  assert.equal(hashed.ok, true);
  assert.equal(hashed.spec.canonicalUrl.includes('#'), false);
});

test('all five XML metacharacters are escaped without creating markup', () => {
  const text = `A & B < C > D "quote" 'single'`;
  const result = share.validateShareCardSpec(candidate({ title: text, altText: text }), environment);
  assert.equal(result.ok, true);
  const svg = share.renderShareCardSvg(result.spec);
  for (const entity of ['&amp;', '&lt;', '&gt;', '&quot;', '&apos;']) assert.ok(svg.includes(entity));
  assert.equal(svg.includes('< C >'), false);
});

test('builders accept zero-value Trophy facts and reject incomplete stories', () => {
  const facts = {
    id: 'owner',
    eyebrow: 'Trophy Case',
    title: 'Owner',
    metrics: [{ label: 'Darlings', value: '0' }, { label: 'Saunders', value: '0' }],
    canonicalHref: 'https://example.com/Darling/?tab=trophy',
    sourceLabel: 'Trophy Case',
    dataVersion: 'fixture',
    altText: 'Owner has zero Darlings and zero Saunders titles.',
  };
  assert.equal(share.buildShareCard('trophy', facts, environment).ok, true);
  assert.equal(share.buildShareCard('trophy', { ...facts, complete: false }, environment).code, 'INCOMPLETE_DATA');
});
