const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const sourceCard = path.join(root, 'assets/share/darling-default-card.png');
const {
  decodePortableText,
  generateShareCardAssets,
  portableTextPath,
  renderPortableShareCardSvg,
  runCli: runGeneratorCli,
} = require('../scripts/generate_share_card_assets.cjs');
const { auditBuiltAssets, SHARE_CARD_MAX_BYTES } = require('../scripts/audit_built_assets.cjs');
const {
  isDeployableAsset,
  runCli: runSyncCli,
} = require('../scripts/sync_public_assets.cjs');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-share-assets-'));
  const source = path.join(directory, 'assets/share/darling-default-card.png');
  const built = path.join(directory, 'dist/assets/share/darling-default-card.png');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(path.dirname(built), { recursive: true });
  fs.copyFileSync(sourceCard, source);
  fs.copyFileSync(sourceCard, built);
  fs.writeFileSync(path.join(directory, 'dist/assets/asset-manifest.json'), JSON.stringify({
    assets: {}, media: { leagueHero: { variants: [] } },
  }));
  return { directory, source, built };
}

test('default card generation is deterministic and drift detection fails closed', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-share-generate-'));
  try {
    const output = path.join(directory, 'card.png');
    const generated = await generateShareCardAssets(root, { output });
    assert.equal(generated.buffer.equals(fs.readFileSync(sourceCard)), true);
    await generateShareCardAssets(root, { output, check: true });
    const mutated = fs.readFileSync(output);
    mutated[mutated.length - 1] ^= 1;
    fs.writeFileSync(output, mutated);
    await assert.rejects(generateShareCardAssets(root, { output, check: true }), /drifted/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('portable default-card text is platform-independent and fails closed', () => {
  assert.equal(decodePortableText('&lt;Darling&gt; &quot;2014–present&quot; &apos;ok&apos;'), '<DARLING> "2014-PRESENT" \'OK\'');
  assert.equal(decodePortableText('&amp;lt;'), '&LT;');
  const style = { size: 16, scale: 2, fill: '#fff', spacing: 1 };
  const start = portableTextPath('AB', 20, 40, style);
  const end = portableTextPath('AB', 20, 40, style, 'end');
  assert.match(start, /M20 /);
  assert.notEqual(start, end);
  assert.throws(() => portableTextPath('?', 0, 20, style), /portable font is missing/);

  const portable = renderPortableShareCardSvg(
    '<svg><text x="10" y="20" class="eye">A</text></svg>',
    '#abcdef',
  );
  assert.match(portable, /<path d="M/);
  assert.match(portable, /fill="#abcdef"/);
  assert.doesNotMatch(portable, /<text/);
  assert.throws(
    () => renderPortableShareCardSvg('<svg><text x="10" y="20" class="missing">A</text></svg>', '#fff'),
    /no style/,
  );
});

test('share generator and public sync CLIs report success and failure without hidden writes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-share-cli-'));
  const messages = [];
  const logger = {
    log: message => messages.push(String(message)),
    error: message => messages.push(String(message)),
  };
  try {
    assert.equal(await runGeneratorCli({ root: directory, args: [], logger }), 0);
    assert.equal(await runGeneratorCli({ root: directory, args: ['--check'], logger }), 0);
    assert.equal(runSyncCli(directory, logger), 0);
    assert.ok(messages.some(message => message.includes('Generated assets/share/darling-default-card.png')));
    assert.ok(messages.some(message => message.includes('Default share card is current')));
    assert.ok(messages.some(message => message.includes('Synced assets to public/assets')));

    const missing = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-share-cli-missing-'));
    try {
      assert.equal(await runGeneratorCli({ root: missing, args: ['--check'], logger }), 1);
      assert.equal(runSyncCli(missing, logger), 1);
      assert.ok(messages.some(message => message.includes('Default share card is missing')));
      assert.ok(messages.some(message => message.includes('Missing source assets directory')));
    } finally {
      fs.rmSync(missing, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('committed card is a bounded exact 1200x630 PNG', async () => {
  const bytes = fs.readFileSync(sourceCard);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.equal(metadata.format, 'png');
  assert.ok(bytes.length <= SHARE_CARD_MAX_BYTES);
});

test('share media allowlist accepts exactly one normalized path', () => {
  const assets = path.join(root, 'assets');
  assert.equal(isDeployableAsset(assets, path.join(assets, 'share/darling-default-card.png')), true);
  for (const relative of [
    'share/darling-default-card.jpg',
    'share/other.png',
    'share/nested/darling-default-card.png',
  ]) assert.equal(isDeployableAsset(assets, path.join(assets, relative)), false, relative);
});

test('built audit catches missing, mismatched, oversized, invalid, and wrong-size cards', () => {
  const { directory, source, built } = fixture();
  const original = fs.readFileSync(sourceCard);
  try {
    assert.deepEqual(auditBuiltAssets(directory), []);
    fs.rmSync(built);
    assert.ok(auditBuiltAssets(directory).some(error => /dist.*share.*missing/.test(error)));
    fs.writeFileSync(built, Buffer.from(original).fill(0, original.length - 1));
    assert.ok(auditBuiltAssets(directory).some(error => /differs/.test(error)));
    fs.writeFileSync(source, Buffer.from('not png'));
    fs.writeFileSync(built, Buffer.from('not png'));
    assert.ok(auditBuiltAssets(directory).some(error => /invalid PNG signature/.test(error)));
    const wrong = Buffer.from(original);
    wrong.writeUInt32BE(1199, 16);
    fs.writeFileSync(source, wrong);
    fs.writeFileSync(built, wrong);
    assert.ok(auditBuiltAssets(directory).some(error => /1200x630/.test(error)));
    const oversized = Buffer.concat([original, Buffer.alloc(SHARE_CARD_MAX_BYTES)]);
    fs.writeFileSync(source, oversized);
    fs.writeFileSync(built, oversized);
    assert.ok(auditBuiltAssets(directory).some(error => /exceeds/.test(error)));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('root metadata uses the absolute Open Graph and Twitter contract', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const image = 'https://haynesmodel.github.io/Darling/assets/share/darling-default-card.png';
  for (const fragment of [
    'property="og:title" content="The Darling"',
    'property="og:type" content="website"',
    'property="og:url" content="https://haynesmodel.github.io/Darling/"',
    `property="og:image" content="${image}"`,
    `property="og:image:secure_url" content="${image}"`,
    'property="og:image:type" content="image/png"',
    'property="og:image:width" content="1200"',
    'property="og:image:height" content="630"',
    'property="og:image:alt"',
    'name="twitter:card" content="summary_large_image"',
    `name="twitter:image" content="${image}"`,
    'name="twitter:image:alt"',
  ]) assert.ok(html.includes(fragment), fragment);
  assert.doesNotMatch(html, /rel="canonical"/);
});
