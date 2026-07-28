const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let temp;
let preference;

test.before(async () => {
  const coverageBundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(coverageBundles, { recursive: true });
  temp = fs.mkdtempSync(path.join(coverageBundles, 'owner-preference-'));
  const outfile = path.join(temp, 'owner-preference.mjs');
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../src/app/services/owner-preference-service.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
  });
  preference = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    value(key) { return values.get(key); },
  };
}

function fakeWindow(localStorage) {
  const listeners = new Set();
  return {
    localStorage,
    addEventListener(type, listener) { if (type === 'storage') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'storage') listeners.delete(listener); },
    dispatch(event) { listeners.forEach(listener => listener(event)); },
    listenerCount: () => listeners.size,
  };
}

test('normalizes owners and restores only an exact canonical stored value', () => {
  const key = preference.FAVORITE_OWNER_STORAGE_KEY;
  const stored = storage({ [key]: 'Joel' });
  const service = preference.createOwnerPreferenceService([' Zubs ', 'Joel', '', 'Joel'], fakeWindow(stored));
  assert.deepEqual(service.validOwners(), ['Joel', 'Zubs']);
  assert.deepEqual(service.getSnapshot(), { owner: 'Joel', persisted: true, revision: 0 });

  const stale = storage({ [key]: 'joel' });
  const staleService = preference.createOwnerPreferenceService(['Joel'], fakeWindow(stale));
  assert.deepEqual(staleService.getSnapshot(), { owner: null, persisted: true, revision: 0 });
  assert.equal(stale.value(key), undefined);
});

test('set, change, clear, and repeated operations publish exactly once per state change', () => {
  const key = preference.FAVORITE_OWNER_STORAGE_KEY;
  const stored = storage();
  const service = preference.createOwnerPreferenceService(['Joe', 'Joel'], fakeWindow(stored));
  const updates = [];
  service.subscribe(snapshot => updates.push(snapshot));

  assert.equal(service.set('Joe').accepted, true);
  assert.equal(stored.value(key), 'Joe');
  assert.equal(service.set('Joe').snapshot.revision, 1);
  assert.equal(service.set('Joel').snapshot.revision, 2);
  assert.equal(service.set(null).snapshot.revision, 3);
  assert.equal(service.set(null).snapshot.revision, 3);
  assert.equal(updates.length, 3);
  assert.equal(stored.value(key), undefined);
});

test('invalid owners are observably rejected without mutation or publication', () => {
  const stored = storage();
  const service = preference.createOwnerPreferenceService(['Joe'], fakeWindow(stored));
  let updates = 0;
  service.subscribe(() => { updates += 1; });
  const result = service.set('joe');
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'invalid-owner');
  assert.deepEqual(service.getSnapshot(), { owner: null, persisted: true, revision: 0 });
  assert.equal(updates, 0);
});

test('storage access and write failures retain a session-only preference without throwing', () => {
  const deniedWindow = fakeWindow(null);
  Object.defineProperty(deniedWindow, 'localStorage', { get() { throw new Error('denied'); } });
  const denied = preference.createOwnerPreferenceService(['Joe'], deniedWindow);
  const deniedResult = denied.set('Joe');
  assert.deepEqual(deniedResult.snapshot, { owner: 'Joe', persisted: false, revision: 1 });
  assert.equal(deniedResult.reason, 'storage-unavailable');

  const quota = storage();
  quota.setItem = () => { throw new Error('quota'); };
  const service = preference.createOwnerPreferenceService(['Joe'], fakeWindow(quota));
  assert.doesNotThrow(() => service.set('Joe'));
  assert.deepEqual(service.getSnapshot(), { owner: 'Joe', persisted: false, revision: 1 });
  assert.equal(service.getSnapshot().owner, 'Joe');
});

test('explicit storage options and read failures remain deterministic', () => {
  const noStorage = preference.createOwnerPreferenceService(
    ['Joe'],
    fakeWindow(storage()),
    { storage: null, storageKey: 'custom.favorite' },
  );
  assert.deepEqual(noStorage.getSnapshot(), { owner: null, persisted: false, revision: 0 });
  assert.equal(noStorage.set(null).reason, 'storage-unavailable');

  const unreadable = storage();
  unreadable.getItem = () => { throw new Error('read blocked'); };
  const readFailure = preference.createOwnerPreferenceService(['Joe'], fakeWindow(unreadable));
  assert.deepEqual(readFailure.getSnapshot(), { owner: null, persisted: false, revision: 0 });

  const uncleareable = storage({ [preference.FAVORITE_OWNER_STORAGE_KEY]: 'Stale' });
  uncleareable.removeItem = () => { throw new Error('remove blocked'); };
  const clearFailure = preference.createOwnerPreferenceService(['Joe'], fakeWindow(uncleareable));
  assert.deepEqual(clearFailure.getSnapshot(), { owner: null, persisted: false, revision: 0 });
});

test('storage events synchronize canonical values, ignore other keys, and clear stale values', () => {
  const key = preference.FAVORITE_OWNER_STORAGE_KEY;
  const stored = storage();
  const win = fakeWindow(stored);
  const service = preference.createOwnerPreferenceService(['Joe', 'Joel'], win);
  const updates = [];
  service.subscribe(snapshot => updates.push(snapshot));
  win.dispatch({ key: 'other', newValue: 'Joe' });
  win.dispatch({ key, newValue: 'Joel' });
  win.dispatch({ key, newValue: 'Stale' });
  win.dispatch({ key, newValue: null });
  assert.equal(updates.length, 2);
  assert.deepEqual(service.getSnapshot(), { owner: null, persisted: true, revision: 2 });
});

test('unsubscribe and dispose remove listeners and prevent later notifications', () => {
  const key = preference.FAVORITE_OWNER_STORAGE_KEY;
  const win = fakeWindow(storage());
  const service = preference.createOwnerPreferenceService(['Joe'], win);
  let updates = 0;
  const unsubscribe = service.subscribe(() => { updates += 1; });
  unsubscribe();
  service.set('Joe');
  assert.equal(updates, 0);
  service.subscribe(() => { updates += 1; });
  service.dispose();
  assert.equal(win.listenerCount(), 0);
  service.set(null);
  win.dispatch({ key, newValue: 'Joe' });
  assert.equal(updates, 0);
  assert.doesNotThrow(() => service.dispose());
  const afterDispose = service.subscribe(() => { updates += 1; });
  afterDispose();
  assert.equal(updates, 0);
});
