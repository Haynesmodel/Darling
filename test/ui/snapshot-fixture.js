import fs from 'node:fs';
import path from 'node:path';
import canonicalJsonModule from '../../scripts/data/canonical-json.cjs';

const { canonicalJson, sha256Json } = canonicalJsonModule;
const root = process.cwd();
const canonicalManifest = readJson('assets/asset-manifest.json');
const canonicalAssets = Object.fromEntries([
  ...Object.entries(canonicalManifest.assets),
  ['DerivedStats', canonicalManifest.derived],
].map(([name, entry]) => [name, readJson(entry.path)]));

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function coverageFor(name, value) {
  const rows = Array.isArray(value) ? value : value?.games || value?.rows || [];
  if (name === 'Rivalries') return { rows: rows.length, season_min: null, season_max: null };
  const seasons = rows.map(row => Number(row.season)).filter(Number.isFinite);
  if (!seasons.length && Number.isFinite(value?.season)) seasons.push(Number(value.season));
  return {
    rows: rows.length,
    season_min: seasons.length ? Math.min(...seasons) : null,
    season_max: seasons.length ? Math.max(...seasons) : null,
  };
}

function normalizedBasePath(basePath) {
  const stripped = String(basePath || '/').replace(/^\/+|\/+$/g, '');
  return stripped ? `/${stripped}/` : '/';
}

function applyMutation(value, mutation, assets) {
  if (typeof mutation !== 'function') return clone(mutation);
  const result = mutation(value, assets);
  return result === undefined ? value : result;
}

function buildFixture({
  mutations = {},
  basePath = process.env.PLAYWRIGHT_SERVER === 'preview' ? '/Darling/' : '/',
} = {}) {
  const assets = clone(canonicalAssets);
  for (const [name, mutation] of Object.entries(mutations)) {
    if (!(name in assets)) throw new Error(`Unknown snapshot asset mutation: ${name}`);
    assets[name] = applyMutation(assets[name], mutation, assets);
  }

  const sourceHashes = {};
  for (const name of Object.keys(canonicalManifest.assets)) {
    sourceHashes[name] = sha256Json(assets[name]);
  }
  for (const dependency of ['H2H', 'Rivalries', 'SeasonSummary']) {
    assets.DerivedStats.source_hashes[dependency] = sourceHashes[dependency];
  }

  const manifest = clone(canonicalManifest);
  for (const [name, original] of Object.entries(canonicalManifest.assets)) {
    const body = canonicalJson(assets[name]);
    manifest.assets[name] = {
      ...original,
      ...coverageFor(name, assets[name]),
      bytes: Buffer.byteLength(body),
      sha256: sha256Json(assets[name]),
    };
  }
  const derivedBody = canonicalJson(assets.DerivedStats);
  manifest.derived = {
    ...canonicalManifest.derived,
    bytes: Buffer.byteLength(derivedBody),
    sha256: sha256Json(assets.DerivedStats),
    source_hashes: clone(assets.DerivedStats.source_hashes),
  };
  const versionInput = {
    source_hashes: Object.fromEntries(Object.entries(manifest.assets).map(([name, entry]) => [name, entry.sha256])),
    schema_versions: manifest.schema_versions,
    derived_generator_version: manifest.derived_generator_version,
    derived_hash: manifest.derived.sha256,
    media_hashes: manifest.media.leagueHero.variants.map(variant => [variant.path, variant.sha256]),
  };
  manifest.data_version = sha256Json(versionInput);

  const bodies = new Map([
    ['assets/asset-manifest.json', canonicalJson(manifest)],
    ...Object.entries(manifest.assets).map(([name, entry]) => [entry.path, canonicalJson(assets[name])]),
    [manifest.derived.path, derivedBody],
  ]);
  const entriesByPath = new Map([
    ...Object.values(manifest.assets).map(entry => [entry.path, entry]),
    [manifest.derived.path, manifest.derived],
  ]);
  const requests = [];
  const rejected = [];
  const expectedBasePath = normalizedBasePath(basePath);

  return {
    assets,
    manifest,
    basePath: expectedBasePath,
    requests,
    rejected,
    count(relativePath) {
      return requests.filter(request => request.relativePath === relativePath).length;
    },
    async observations(page) {
      return page.evaluate(() => globalThis.__darlingFetchObservations || []);
    },
    async install(page) {
      await page.addInitScript(() => {
        const nativeFetch = globalThis.fetch.bind(globalThis);
        const storageKey = 'darling.test.fetch-observations';
        try {
          globalThis.__darlingFetchObservations = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
        } catch {
          globalThis.__darlingFetchObservations = [];
        }
        globalThis.fetch = (input, init = {}) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          globalThis.__darlingFetchObservations.push({
            url: String(url),
            cache: init.cache || (typeof input === 'object' && input ? input.cache : undefined) || 'default',
          });
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(globalThis.__darlingFetchObservations));
          } catch {
            // Fetch observation persistence is best-effort in restricted browser contexts.
          }
          return nativeFetch(input, init);
        };
      });
      await page.route('**/assets/*.json*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const relativePath = [...bodies.keys()].find(candidate => url.pathname.endsWith(`/${candidate}`));
        if (!relativePath) return route.continue();
        const prefix = url.pathname.slice(0, -relativePath.length);
        const observation = {
          relativePath,
          url: request.url(),
          method: request.method(),
          basePath: prefix || '/',
          version: url.searchParams.get('v'),
        };
        requests.push(observation);
        if (prefix !== expectedBasePath) {
          rejected.push({ ...observation, reason: `expected base path ${expectedBasePath}` });
          return route.fulfill({ status: 404, body: 'Unexpected base path' });
        }
        if (relativePath === 'assets/asset-manifest.json') {
          if (url.search) {
            rejected.push({ ...observation, reason: 'manifest must be unversioned' });
            return route.fulfill({ status: 412, body: 'Manifest must be unversioned' });
          }
        } else {
          const entry = entriesByPath.get(relativePath);
          const expectedVersion = entry.sha256.replace('sha256:', '');
          if (url.searchParams.get('v') !== expectedVersion) {
            rejected.push({ ...observation, reason: `expected version ${expectedVersion}` });
            return route.fulfill({ status: 412, body: 'Unexpected asset version' });
          }
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: bodies.get(relativePath),
        });
      });
    },
  };
}

export { buildFixture as createSnapshotFixture };
