const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadTsModule(entry) {
  const coverageBundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(coverageBundles, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(coverageBundles, 'theme-system-'));
  temporaryDirectories.push(outDir);
  const outfile = path.join(outDir, `${path.basename(entry, path.extname(entry))}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(process.cwd(), entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    sourcemap: 'inline',
    sourcesContent: true,
  });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}

const temporaryDirectories = [];
test.after(() => temporaryDirectories.forEach(directory => fs.rmSync(directory, { recursive: true, force: true })));

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createDocumentStub() {
  const props = {};
  return {
    props,
    document: {
      documentElement: {
        dataset: {},
        style: {
          setProperty(name, value) {
            props[name] = value;
          },
          removeProperty(name) {
            delete props[name];
          },
        },
      },
    },
  };
}

test('theme state resolves persisted, invalid, and system color schemes', async () => {
  const mod = await loadTsModule('src/theme/theme-state.ts');
  const darkWindow = {
    localStorage: createStorage({ [mod.COLOR_SCHEME_STORAGE_KEY]: 'dark' }),
    matchMedia: () => ({ matches: true }),
  };
  const invalidWindow = {
    localStorage: createStorage({ [mod.COLOR_SCHEME_STORAGE_KEY]: 'sepia' }),
    matchMedia: () => ({ matches: false }),
  };

  assert.equal(mod.readColorSchemePreference(darkWindow), 'dark');
  assert.equal(mod.resolveColorSchemePreference('dark', darkWindow), 'dark');
  assert.equal(mod.readColorSchemePreference(invalidWindow), 'system');
  assert.equal(mod.resolveColorSchemePreference('system', darkWindow), 'dark');
  assert.equal(mod.resolveColorSchemePreference('system', invalidWindow), 'light');
});

test('theme state falls back safely when storage or media preferences are unavailable', async () => {
  const mod = await loadTsModule('src/theme/theme-state.ts');
  const blockedStorage = Object.defineProperty({}, 'localStorage', {
    get() { throw new Error('storage disabled'); },
  });
  const unreadableStorage = {
    localStorage: {
      getItem() { throw new Error('storage denied'); },
      setItem() { throw new Error('storage denied'); },
      removeItem() {},
    },
  };
  const blockedMedia = { matchMedia() { throw new Error('media unavailable'); } };

  assert.equal(mod.readColorSchemePreference(blockedStorage), 'system');
  assert.equal(mod.readColorSchemePreference(unreadableStorage), 'system');
  assert.equal(mod.resolveColorSchemePreference('system', blockedMedia), 'light');
  assert.equal(mod.resolveColorSchemePreference('system', null), 'light');
  assert.doesNotThrow(() => mod.writeColorSchemePreference('dark', unreadableStorage));
  assert.doesNotThrow(() => mod.writeColorSchemePreference('light', blockedStorage));
});

test('system color scheme watcher supports legacy listeners and releases subscriptions', async () => {
  const mod = await loadTsModule('src/theme/theme-state.ts');
  let legacyListener;
  let removedListener;
  const media = {
    matches: false,
    addListener(listener) { legacyListener = listener; },
    removeListener(listener) { removedListener = listener; },
  };
  const onChange = () => {};
  const stop = mod.watchSystemColorScheme({ matchMedia: () => media }, onChange);

  assert.equal(legacyListener, onChange);
  stop();
  assert.equal(removedListener, onChange);
  assert.doesNotThrow(() => mod.watchSystemColorScheme({ matchMedia: () => ({ matches: true }) }, onChange)());
  assert.doesNotThrow(() => mod.watchSystemColorScheme({ matchMedia: () => { throw new Error('blocked'); } }, onChange)());
});

test('theme context derives owner, rivalry, and postseason modes', async () => {
  const mod = await loadTsModule('src/theme/theme-context.ts');

  assert.deepEqual(mod.buildOwnerThemeContext('Joe'), {
    accentKind: 'owner',
    owner: 'Joe',
    seasonMode: 'regular',
  });
  assert.deepEqual(mod.buildOwnerThemeContext('__ALL__'), {
    accentKind: 'league',
    seasonMode: 'regular',
  });
  assert.deepEqual(mod.buildRivalryThemeContext('Joe', 'Joel'), {
    accentKind: 'rivalry',
    rivalryA: 'Joe',
    rivalryB: 'Joel',
    seasonMode: 'regular',
  });
  assert.equal(mod.seasonModeFromLabels(['Regular', 'Saunders Final']), 'saunders');
  assert.equal(mod.seasonModeFromLabels(['Regular', 'Championship']), 'postseason');
  assert.equal(mod.seasonModeFromCurrentWeek({ week: 15, regularSeasonMaxWeek: 14 }), 'postseason');
});

test('theme application writes root attributes and owner variables', async () => {
  const mod = await loadTsModule('src/theme/apply-theme.ts');
  const stub = createDocumentStub();

  const applied = mod.applyThemeToDocument({
    colorSchemePreference: 'dark',
    resolvedColorScheme: 'dark',
    accentKind: 'owner',
    owner: 'Joe',
    seasonMode: 'postseason',
  }, stub.document);

  assert.equal(applied.accentKind, 'owner');
  assert.equal(stub.document.documentElement.dataset.colorScheme, 'dark');
  assert.equal(stub.document.documentElement.dataset.ownerTheme, 'Joe');
  assert.equal(stub.document.documentElement.dataset.seasonMode, 'postseason');
  assert.equal(stub.props['--owner-primary'], '#2563eb');
  assert.match(stub.props['--owner-soft'], /rgba/);
});

test('theme runtime persists choices and reacts to app context', async () => {
  const mod = await loadTsModule('src/theme/apply-theme.ts');
  const stub = createDocumentStub();
  const storage = createStorage();
  const listeners = [];
  const runtime = mod.createDarlingThemeRuntime({
    document: stub.document,
    window: {
      localStorage: storage,
      matchMedia: () => ({
        matches: false,
        addEventListener(type, listener) {
          listeners.push(listener);
        },
        removeEventListener() {},
      }),
    },
  });

  runtime.setColorSchemePreference('dark');
  assert.equal(storage.getItem('darling.colorScheme'), 'dark');
  assert.equal(stub.document.documentElement.dataset.colorScheme, 'dark');

  runtime.applyAppContext({ accentKind: 'rivalry', rivalryA: 'Joe', rivalryB: 'Joel', seasonMode: 'postseason' });
  assert.equal(stub.document.documentElement.dataset.accentTheme, 'rivalry');
  assert.equal(stub.document.documentElement.dataset.rivalryA, 'Joe');
  assert.equal(stub.document.documentElement.dataset.rivalryB, 'Joel');
  assert.equal(stub.props['--owner-a-primary'], '#2563eb');
  assert.equal(stub.props['--owner-b-primary'], '#b45309');
  assert.equal(listeners.length, 1);
  runtime.destroy();
});
