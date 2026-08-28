const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const lore = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/LeagueLore.json')));
const byId = new Map(lore.entries.map(entry => [entry.id, entry]));
const coverageBundles = path.join(process.cwd(), 'coverage', 'test-bundles');
fs.mkdirSync(coverageBundles, { recursive: true });
const loreBundleDir = fs.mkdtempSync(path.join(coverageBundles, 'league-lore-'));
const loreRuntimePath = path.join(loreBundleDir, 'lore-lazy.cjs');
const buildLoreModule = (entryPoint, outfile) => esbuild.buildSync({
  entryPoints: [entryPoint], outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node24',
  loader: { '.css': 'empty' }, sourcemap: 'inline', sourcesContent: true, logLevel: 'silent',
});
buildLoreModule(path.join(__dirname, '../src/lore/lore-lazy.ts'), loreRuntimePath);
const lorePresentationPath = path.join(loreBundleDir, 'lore-presentation.cjs');
buildLoreModule(path.join(__dirname, '../src/lore/lore-presentation.ts'), lorePresentationPath);
const { createLazyLoreService } = require(loreRuntimePath);
const lorePresentation = require(lorePresentationPath);
test.after(() => fs.rmSync(loreBundleDir, { recursive: true, force: true }));

test('League Lore preserves the supplied year and sensitivity corrections', () => {
  assert.equal(byId.get('punishment-connor-cheesesteak').season, 2025);
  assert.equal(byId.get('punishment-connor-cheesesteak').completed_year, 2026);
  assert.equal(byId.get('2022-championship-context').sensitivity, 'respectful');
  const championship = byId.get('2022-championship-context').body.join(' ');
  assert.doesNotMatch(championship, /101\.08|100\.40/);
  assert.match(championship, /Tee Higgins/);
  assert.match(championship, /active players/);
  assert.equal(byId.get('almanac-nuss-saunders').category, 'league-moment');
  assert.equal(byId.get('almanac-nuss-saunders').season, 2014);
  assert.deepEqual(byId.get('almanac-nuss-saunders').anchors, [{ type: 'season', season: 2014 }]);
  assert.equal(byId.get('punishment-nuss-standup').season, 2019);
  assert.equal(byId.get('punishment-rishi-ihop').season, 2020);
  assert.match(byId.get('punishment-rishi-ihop').body.join(' '), /8 hours.*16 pancakes/i);
  assert.equal(byId.get('punishment-joe-lochte').season, 2015);
  assert.match(byId.get('almanac-nuss-draft-defense').body.join(' '), /took the first defense.*responsible for the second defense/i);
  assert.equal(byId.get('almanac-connor-leveon').category, 'league-moment');
  assert.match(byId.get('almanac-connor-leveon').provenance, /factual narrative detail/);
});

test('disabled lore root suppresses every optional lore surface', async () => {
  const disabled = JSON.parse(JSON.stringify(lore));
  disabled.enabled = false;
  const service = runtimeFactory();
  service.hydrate(disabled);
  assert.equal(service.entry('record-42'), null);
  assert.deepEqual(service.searchDocuments(), []);
  assert.equal(service.trigger('record-42-history'), false);
  assert.equal(await service.reveal('entry', 'record-42'), false);
});

test('Almanac inventory covers all ten owner sections and reviewed narrative clusters', () => {
  const almanac = lore.entries.filter(entry => entry.almanac_edition === 2024 && entry.provenance.includes('Darling 2024 Almanac'));
  const owners = ['Joe', 'Joel', 'Shap', 'Singer', 'Nuss', 'Plot', 'Zubs', 'Connor', 'Rishi', 'Zook'];
  for (const owner of owners) {
    const entries = almanac.filter(entry => entry.owners.includes(owner));
    assert.ok(entries.length >= 2, `${owner} needs distinct reviewed Almanac entries`);
    assert.ok(entries.some(entry => entry.anchors.length > 0), `${owner} needs a canonical or season anchor`);
    assert.ok(entries.every(entry => entry.provenance.includes('Darling 2024 Almanac')), `${owner} entry provenance is incomplete`);
  }
  for (const id of [
    'almanac-shap-scheduling', 'almanac-shap-first-pick', 'almanac-singer-relay',
    'almanac-singer-counterfactual', 'almanac-nuss-saunders', 'almanac-nuss-baldwin',
    'almanac-nuss-draft-defense', 'almanac-nuss-relay', 'almanac-plot-controversy', 'almanac-plot-vpc-trade',
    'almanac-connor-profile', 'almanac-connor-leveon', 'almanac-connor-saunders',
    'almanac-zubs-run', 'almanac-zook-draft-absence', 'almanac-joe-commissioner',
    'almanac-joel-commissioner', 'almanac-rishi-keys', 'almanac-joe-collapse',
    'almanac-rishi-beerpong',
  ]) {
    const entry = byId.get(id);
    assert.ok(entry, `missing Almanac cluster ${id}`);
    assert.ok(lore.collections.some(collection => collection.entry_ids.includes(id)), `${id} is not reachable from a collection`);
    assert.ok(entry.search_terms.length >= 2, `${id} needs deterministic search terms`);
    assert.match(entry.provenance, /reviewed page/);
  }
  assert.match(byId.get('almanac-nuss-relay').body.join(' '), /tree.*dizzy bat.*three spins/i);
  assert.match(byId.get('almanac-rishi-keys').body.join(' '), /intentional.*Vive.*first five/i);
  assert.match(byId.get('almanac-zook-draft-absence').body.join(' '), /did not try.*2015–18.*missing/i);
  assert.match(byId.get('almanac-plot-controversy').body.join(' '), /kicked out of the J.*three later one-sided trades/i);
});

test('Singer lawn story is in Draft Weekend, never Punishment Museum', () => {
  const punishment = lore.collections.find(collection => collection.id === 'punishment-museum');
  const draftWeekend = lore.collections.find(collection => collection.id === 'draft-weekend-museum');
  assert.equal(punishment.entry_ids.includes('singer-lawn-story'), false);
  assert.equal(draftWeekend.entry_ids.includes('singer-lawn-story'), true);
});

test('commissioner display labels and Plot slogan remain exact', () => {
  assert.deepEqual(lore.commissioner_terms.map(term => term.display_term), ['Haynes, 2014–2017', 'Joel, 2017–2023', 'Zubs, 2023–2025', 'Plotnick, 2025–Present']);
  assert.match(byId.get('2025-plot-administration').teaser, /Plotnick, 2025–Present/);
  assert.match(byId.get('2025-plot-administration').body.join(' '), /^Joel was a snake, Zubs was a flake, but Plot- he let them eat cake$/);
});

test('presentation catalog keeps each migrated effect on its native treatment', () => {
  const presentations = new Map(lore.effects.map(effect => [effect.id, effect.presentation]));
  for (const [id, presentation] of [
    ['blue-bloods', 'rattle'], ['commish', 'cake'], ['bagel-shower', 'bagel-shower'],
    ['flies', 'flies'], ['suitcase', 'suitcase'], ['podium', 'podium'],
    ['snake-tail', 'snake-tail'], ['chairs', 'chairs'], ['crown', 'crown'], ['saunders-fog', 'fog'],
  ]) assert.equal(presentations.get(id), presentation);
  assert.equal(presentations.get('target'), 'target');
  assert.equal(presentations.get('ticket'), 'ticket');
  assert.equal(presentations.get('blank-document'), 'blank-document');
  assert.equal(lore.triggers.find(trigger => trigger.id === 'draft-podium').effect_id, 'target');
  assert.equal(lore.triggers.find(trigger => trigger.id === 'connor-collapse-story').effect_id, 'ticket');
  for (const id of ['plot-admin', 'zook-points-story', 'connor-collapse-story', 'plot-rankings-story']) assert.equal(lore.triggers.find(trigger => trigger.id === id).surface, 'history');
  assert.equal(lore.effects.find(effect => effect.id === 'respectful-static')?.presentation, 'static');
});

function runtimeFactory() {
  const presenter = async () => ({ showLore() {} });
  const service = createLazyLoreService(presenter);
  service.hydrate(lore);
  return service;
}

function runtimeWithClock(clock, onReveal = () => {}) {
  const service = createLazyLoreService(async () => ({ showLore: onReveal }), clock);
  service.hydrate(lore);
  return service;
}

function loreGuard() {
  const source = fs.readFileSync(path.join(__dirname, '../src/data/generated/league-lore-validator.ts'), 'utf8');
  const { code } = esbuild.transformSync(source, { loader: 'ts', format: 'cjs', target: 'node24' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports.isLeagueLore;
}

test('generated LeagueLore guard accepts schema boundaries and rejects empty required arrays', () => {
  const isLeagueLore = loreGuard();
  const edge = JSON.parse(JSON.stringify(lore));
  edge.updated_at = '2100-12-31';
  edge.source_policy.numeric_authority = ['x'];
  edge.collections[0].title = 't'.repeat(180);
  edge.collections[0].summary = 's'.repeat(500);
  edge.entries[0].title = 't'.repeat(180);
  edge.entries[0].teaser = 't'.repeat(180);
  edge.entries[0].body = ['b'.repeat(500)];
  edge.effects[0].label = 'l'.repeat(100);
  edge.effects[0].symbol = 's'.repeat(12);
  edge.effects[0].duration_ms = 2500;
  assert.equal(isLeagueLore(edge), true);
  // These cases deliberately mirror schema allowances: top-level arrays and
  // match owners are not uniqueItems, while referenced ID lists are.
  edge.source_policy.numeric_authority = [' '];
  edge.owners.push({ owner: 'Joe', aliases: [] });
  const matched = edge.triggers.find(trigger => trigger.match);
  if (matched?.match) matched.match.owners = ['Nuss', 'Nuss'];
  edge.collections[0].entry_ids = ['a'.repeat(100)];
  assert.equal(isLeagueLore(edge), true);
  edge.collections[0].entry_ids = [];
  assert.equal(isLeagueLore(edge), false);
  edge.collections[0].entry_ids = ['a'.repeat(100)];
  const rivalry = edge.entries.find(entry => entry.anchors.some(anchor => anchor.type === 'rivalry'))?.anchors.find(anchor => anchor.type === 'rivalry');
  if (rivalry) rivalry.slug = 'both-is-invalid';
  assert.equal(isLeagueLore(edge), false);
  if (rivalry) delete rivalry.slug;
  edge.entries[0].body = [];
  assert.equal(isLeagueLore(edge), false);
  edge.entries[0].body = ['b'.repeat(501)];
  assert.equal(isLeagueLore(edge), false);
  edge.entries[0].body = ['b'.repeat(500)];
  edge.entries[0].title = 't'.repeat(181);
  assert.equal(isLeagueLore(edge), false);
});

test('typed trigger runtime accepts valid facts and rejects wrong contexts', () => {
  const featureTriggers = lore.triggers.filter(trigger => !['search', 'collection-open'].includes(trigger.activation));
  for (const trigger of featureTriggers) {
    const service = runtimeFactory();
    const match = trigger.match || {};
    const positive = {
      owner: trigger.id === 'owner-emblem' ? 'Connor' : match.owner,
      season: match.season,
      value: match.activation_value || (trigger.id === 'dynasty-joel-elevator' ? '2016' : 'value'),
      activation_value: match.activation_value,
      owners: match.owners,
    };
    if (trigger.activation === 'theme-sequence') {
      assert.equal(service.trigger(trigger.id, { value: 'system' }), false);
      assert.equal(service.trigger(trigger.id, { value: 'light' }), false);
      assert.equal(service.trigger(trigger.id, { value: 'dark' }), false);
      assert.equal(service.trigger(trigger.id, { value: 'system' }), false);
      assert.equal(service.trigger(trigger.id, { value: 'light' }), false);
      assert.equal(service.trigger(trigger.id, { value: 'dark' }), true);
    } else if (trigger.id === 'dynasty-joel-elevator') {
      assert.equal(service.trigger(trigger.id, { value: '2016' }), false);
      assert.equal(service.trigger(trigger.id, { value: '2017' }), true);
    } else if (trigger.activation === 'triple-activate') {
      assert.equal(service.trigger(trigger.id, { ...positive, value: 'same' }), false);
      assert.equal(service.trigger(trigger.id, { ...positive, value: 'same' }), false);
      assert.equal(service.trigger(trigger.id, { ...positive, value: 'same' }), true);
      const fresh = runtimeFactory();
      assert.equal(fresh.trigger(trigger.id, { ...positive, value: 'first' }), false);
      assert.equal(fresh.trigger(trigger.id, { ...positive, value: 'second' }), false);
      assert.equal(fresh.trigger(trigger.id, { ...positive, value: 'second' }), false);
    } else {
      assert.equal(service.trigger(trigger.id, positive), true, trigger.id);
    }
    if (match.owner) assert.equal(runtimeFactory().trigger(trigger.id, { ...positive, owner: 'not-the-owner' }), false);
    if (match.season !== undefined) assert.equal(runtimeFactory().trigger(trigger.id, { ...positive, season: match.season + 1 }), false);
    if (match.owners) {
      const reversed = [...match.owners].reverse();
      assert.equal(runtimeFactory().trigger(trigger.id, { ...positive, owners: reversed }), trigger.activation === 'triple-activate' ? false : true);
      assert.equal(runtimeFactory().trigger(trigger.id, { ...positive, owners: [match.owners[0]] }), false);
    }
  }
});

test('trigger runtime enforces monotonic windows, target signatures, and lifecycle cleanup', async () => {
  let at = 0;
  let reveals = 0;
  const service = runtimeWithClock(() => at, () => { reveals += 1; });
  const ownerContext = { owner: 'Connor', value: '' };
  assert.equal(service.trigger('owner-emblem', ownerContext), false);
  assert.equal(service.trigger('owner-emblem', ownerContext), false);
  assert.equal(service.trigger('owner-emblem', ownerContext), true);
  await Promise.resolve();
  assert.equal(reveals, 1);
  at += 4001;
  assert.equal(service.trigger('owner-emblem', ownerContext), false);
  assert.equal(service.trigger('owner-emblem', { owner: 'Rishi', value: '' }), false);
  assert.equal(service.trigger('owner-emblem', { owner: 'Rishi', value: '' }), false);
  assert.equal(service.trigger('owner-emblem', { owner: 'Rishi', value: '' }), true);
  const missingOwner = runtimeWithClock(() => at);
  assert.equal(missingOwner.trigger('owner-emblem', { owner: 'Plot', value: '' }), false);
  assert.equal(missingOwner.trigger('owner-emblem', { owner: 'Plot', value: '' }), false);
  assert.equal(missingOwner.trigger('owner-emblem', { owner: 'Plot', value: '' }), false);
  const session = runtimeWithClock(() => at);
  assert.equal(session.trigger('theme-sunday-night', { value: 'system' }), false);
  session.clearTransient();
  assert.equal(session.trigger('theme-sunday-night', { value: 'light' }), false);
  const scope = service.createScope('route');
  let cleared = 0;
  scope.onClear(() => { cleared += 1; });
  scope.clear();
  scope.clear();
  assert.equal(cleared, 1);
});

test('triple activation resets when its target signature changes', () => {
  const service = runtimeWithClock(() => 0);
  assert.equal(service.trigger('trophy-bagel', { value: 'A' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'A' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'B' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'A' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'A' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'A' }), true);
});

test('scope-once triggers suppress repeats until the route scope clears', () => {
  const service = runtimeWithClock(() => 0);
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), true);
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), false);
  service.clearTransient();
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), true);
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), false);
  assert.equal(service.trigger('trophy-bagel', { value: 'Zook' }), false);
});

test('reveal forwards canonical facts to the presentation boundary', async () => {
  let received;
  const service = runtimeWithClock(() => 0, (...args) => { received = args; });
  await service.reveal('entry', 'record-42', { context: { facts: { score: '42.00' } } });
  assert.equal(received[0].id, 'record-42');
  assert.deepEqual(received[3].context, { facts: { score: '42.00' } });
});

test('anchored numeric lore derives facts from canonical games', async () => {
  let received;
  const service = createLazyLoreService(async () => ({ showLore: (...args) => { received = args; } }));
  service.hydrate(lore, { leagueGames: [{ season: 2019, date: '2019-11-17', teamA: 'Joe', teamB: 'Nuss', scoreA: 1, scoreB: 2, week: 12, round: null, type: 'Regular' }], seasonSummaries: [] });
  await service.reveal('entry', 'record-42', { context: { facts: { score: '42.00' } } });
  assert.equal(received[3].context.facts.score, 'Nuss 2.00');
  assert.equal(received[3].context.facts.opponent, 'Joe');
});

test('anchored record selector follows the entry anchor and owner orientation', async () => {
  let received;
  const altered = JSON.parse(JSON.stringify(lore));
  altered.entries.find(entry => entry.id === 'record-42').anchors[0].game.season = 2018;
  altered.entries.find(entry => entry.id === 'record-42').anchors[0].game.week = 1;
  const service = createLazyLoreService(async () => ({ showLore: (...args) => { received = args; } }));
  service.hydrate(altered, { leagueGames: [{ season: 2018, date: '2018-09-09', teamA: 'Nuss', teamB: 'Joe', scoreA: 3.21, scoreB: 88, week: 1, round: null, type: 'Regular' }], seasonSummaries: [] });
  await service.reveal('entry', 'record-42', { context: { owner: 'Nuss', facts: { score: 'stale' } } });
  assert.equal(received[3].context.facts.score, 'Nuss 3.21');
  assert.equal(received[3].context.facts.opponent, 'Joe');
});

test('pending presentation cannot reopen lore after transient clear', async () => {
  let resolve;
  let shown = 0;
  const presenter = () => new Promise(done => { resolve = done; });
  const service = createLazyLoreService(presenter);
  service.hydrate(lore);
  assert.equal(service.trigger('record-42-history'), true);
  service.clearTransient();
  resolve({ showLore() { shown += 1; } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(shown, 0);
});

test('presentation DOM contract covers replacement, reduced motion, collections, and dialog fallback', () => {
  class FakeElement {
    constructor(tagName, ownerDocument) {
      this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.open = false;
      this.classList = { add: value => { this.className = `${this.className || ''} ${value}`.trim(); } };
      this.style = { setProperty() {} };
    }
    append(...nodes) { nodes.forEach(node => { node.parentNode = this; this.children.push(node); }); }
    removeChild(node) { this.children = this.children.filter(child => child !== node); node.parentNode = null; }
    remove() { this.parentNode?.removeChild(this); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'open') this.open = true; }
    hasAttribute(name) { return this.attributes.has(name); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    dispatch(type, event = {}) { this.listeners.get(type)?.({ preventDefault() {}, shiftKey: false, key: type === 'keydown' ? 'Tab' : '', ...event }); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() { this.ownerDocument.activeElement = this; }
    querySelectorAll() { return this.children.filter(child => child.tagName === 'BUTTON'); }
  }
  class FakeDocument {
    constructor() {
      this.body = new FakeElement('body', this); this.body.classList = { add() {}, remove() {} }; this.activeElement = null;
    }
    createElement(tagName) { return new FakeElement(tagName, this); }
  }
  const doc = new FakeDocument();
  global.document = doc;
  const entry = byId.get('record-42');
  const effect = { id: 'test', label: 'Rattle', presentation: 'rattle', tone: 'playful', symbol: '✨', duration_ms: 2500 };
  const timers = [];
  const scope = { id: 'test', clears: 0, add() {}, onClear(callback) { this.cleanup = callback; }, timer(callback) { timers.push(callback); return 1; }, clear() { this.clears += 1; } };
  const opener = doc.createElement('button');
  lorePresentation.showLore(entry, new Map(), effect, { opener, scope, context: { facts: { score: '42.00', blank: null } } });
  const renderedDialog = doc.body.children.find(node => node.tagName === 'DIALOG');
  assert.equal(renderedDialog.children.some(node => node.textContent === 'Rattle'), true);
  assert.equal(doc.body.children.some(node => node.className?.includes('lore-overlay')), true);
  timers[0]();
  assert.equal(doc.body.children.some(node => node.className?.includes('lore-overlay')), false);
  renderedDialog.children[0].dispatch('click');
  assert.equal(scope.clears, 1);
  lorePresentation.setReducedMotion(true);
  lorePresentation.disposeLorePresentation();
  assert.equal(doc.activeElement, opener);

  const overlayEffect = { ...effect, presentation: 'overlay' };
  lorePresentation.showLore(entry, new Map(), overlayEffect, { opener, scope, context: {} });
  const firstBackdrop = doc.body.children.find(node => node.className?.includes('lore-backdrop'));
  assert.equal(firstBackdrop.attributes.get('data-lore-effect'), 'test');
  doc.body.children.find(node => node.tagName === 'DIALOG').children[0].dispatch('click');
  assert.equal(doc.body.children.some(node => node.className?.includes('lore-backdrop')), true);
  lorePresentation.showLore(entry, new Map(), { ...overlayEffect, id: 'butter-bowl', symbol: '🧈' }, { opener, scope, context: {} });
  const secondBackdrop = doc.body.children.find(node => node.className?.includes('lore-backdrop'));
  assert.equal(secondBackdrop.attributes.get('data-lore-effect'), 'butter-bowl');
  assert.notEqual(firstBackdrop.textContent, secondBackdrop.textContent);
  lorePresentation.disposeLorePresentation();
  assert.equal(doc.body.children.some(node => node.className?.includes('lore-backdrop')), false);

  const fallbackDoc = new FakeDocument();
  const originalCreate = fallbackDoc.createElement.bind(fallbackDoc);
  fallbackDoc.createElement = tagName => { const node = originalCreate(tagName); if (tagName === 'dialog') node.showModal = undefined; return node; };
  const collection = { id: 'collection', title: 'Collection', summary: 'Summary', entry_ids: ['record-42', 'missing'] };
  const fallbackOpener = fallbackDoc.createElement('button');
  lorePresentation.showLore(collection, new Map([[entry.id, entry]]), null, { opener: fallbackOpener, reducedMotion: true });
  const dialog = fallbackDoc.body.children.find(node => node.tagName === 'DIALOG');
  assert.equal(dialog.open, true);
  dialog.dispatch('keydown', { key: 'Escape' });
  dialog.dispatch('cancel');
  assert.equal(fallbackDoc.body.children.includes(dialog), false);
  delete global.document;
});

test('dynasty and theme sequences require the complete ordered gesture', () => {
  let at = 0;
  const service = runtimeWithClock(() => at);
  assert.equal(service.trigger('dynasty-joel-elevator', { value: '2016' }), false);
  at += 100;
  assert.equal(service.trigger('dynasty-joel-elevator', { value: '2017' }), true);
  assert.equal(service.trigger('dynasty-joel-elevator', { value: '2017' }), false);
  const theme = runtimeWithClock(() => at);
  for (const value of ['system', 'light', 'dark', 'system', 'light']) assert.equal(theme.trigger('theme-sunday-night', { value }), false);
  assert.equal(theme.trigger('theme-sunday-night', { value: 'dark' }), true);
  at += 5001;
  assert.equal(theme.trigger('theme-sunday-night', { value: 'system' }), false);
});

test('native feature surfaces expose the intended lore trigger controls', () => {
  const surfaces = {
    'src/features/history/history-controller.ts': ['championship-context', 'record-42-history', 'history-group-'],
    'js/curse-tracker.js': ['history-curse-flame'],
    'src/features/trophy/TrophyPage.tsx': ['trophy-championship', 'trophy-bagel', 'trophy-saunders'],
    'src/features/rivalry/RivalryPage.tsx': ['rivalry-terps', 'rivalry-butter'],
    'src/features/dynasty/DynastyPage.tsx': ['dynasty-joel-elevator', 'dynasty-dissolved', 'dynasty-last-standing'],
    'js/gauntlet-renderers.js': ['gauntlet-mirror'],
    'src/features/transactions/TransactionsPage.tsx': ['transactions-suitcase', 'transactions-receipt'],
    'src/features/draft-spot/DraftSpotHero.tsx': ['draft-boundary-first', 'draft-podium', 'draft-snake-tail', 'draft-rishi-pick-four'],
    'js/current-season-renderers.js': ['current-clinched', 'current-eliminated'],
    'src/features/owner-hub/OwnerHubPage.tsx': ['owner-emblem'],
  };
  for (const [filename, triggers] of Object.entries(surfaces)) {
    const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    for (const trigger of triggers) assert.match(source, new RegExp(trigger), `${filename} missing ${trigger}`);
  }
  assert.match(fs.readFileSync(path.join(__dirname, '../src/main.tsx'), 'utf8'), /theme-sunday-night/);
});

test('every migrated legacy group effect has a data-driven History trigger', () => {
  const effects = ['the-jews', 'churchill-baseball', 'blue-bloods', 'commish', 'fathers', 'hoosiers', 'married', 'birthday-boys', 'former-champions', 'educated', 'birds-clinch', 'sec', 'nuss-rishi', 'singer-nuss'];
  const triggers = new Map(lore.triggers.map(trigger => [trigger.id, trigger]));
  for (const effect of effects) {
    const trigger = triggers.get(`history-group-${effect}`);
    assert.equal(trigger?.effect_id, effect);
    assert.equal(trigger?.surface, 'history');
  }
});

test('rivalry lore targets the selected owner pair', () => {
  assert.equal(lore.triggers.find(trigger => trigger.id === 'rivalry-terps').entry_id, 'rivalry-nuss-rishi');
  assert.equal(lore.triggers.find(trigger => trigger.id === 'rivalry-butter').entry_id, 'rivalry-singer-nuss');
  assert.deepEqual(byId.get('rivalry-nuss-rishi').owners, ['Nuss', 'Rishi']);
  assert.deepEqual(byId.get('rivalry-singer-nuss').owners, ['Singer', 'Nuss']);
});
