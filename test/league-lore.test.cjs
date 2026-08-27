const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const lore = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/LeagueLore.json')));
const byId = new Map(lore.entries.map(entry => [entry.id, entry]));

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
  assert.equal(lore.effects.find(effect => effect.id === 'respectful-static')?.presentation, 'static');
});

function runtimeFactory() {
  const source = fs.readFileSync(path.join(__dirname, '../src/lore/lore-lazy.ts'), 'utf8');
  const { code } = esbuild.transformSync(source, { loader: 'ts', format: 'cjs', target: 'node24' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  const presenter = async () => ({ showLore() {} });
  const service = module.exports.createLazyLoreService(presenter);
  service.hydrate(lore);
  return service;
}

function runtimeWithClock(clock, onReveal = () => {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lore/lore-lazy.ts'), 'utf8');
  const { code } = esbuild.transformSync(source, { loader: 'ts', format: 'cjs', target: 'node24' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  const service = module.exports.createLazyLoreService(async () => ({ showLore: onReveal }), clock);
  service.hydrate(lore);
  return service;
}

test('typed trigger runtime accepts valid facts and rejects wrong contexts', () => {
  const featureTriggers = lore.triggers.filter(trigger => !['search', 'collection-open'].includes(trigger.activation));
  for (const trigger of featureTriggers) {
    const service = runtimeFactory();
    const match = trigger.match || {};
    const positive = {
      owner: match.owner,
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

test('reveal forwards canonical facts to the presentation boundary', async () => {
  let received;
  const service = runtimeWithClock(() => 0, (...args) => { received = args; });
  await service.reveal('entry', 'record-42', { context: { facts: { score: '42.00' } } });
  assert.equal(received[0].id, 'record-42');
  assert.deepEqual(received[3].context, { facts: { score: '42.00' } });
});

test('pending presentation cannot reopen lore after transient clear', async () => {
  let resolve;
  let shown = 0;
  const presenter = () => new Promise(done => { resolve = done; });
  const source = fs.readFileSync(path.join(__dirname, '../src/lore/lore-lazy.ts'), 'utf8');
  const { code } = esbuild.transformSync(source, { loader: 'ts', format: 'cjs', target: 'node24' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  const service = module.exports.createLazyLoreService(presenter);
  service.hydrate(lore);
  assert.equal(service.trigger('record-42-history'), true);
  service.clearTransient();
  resolve({ showLore() { shown += 1; } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(shown, 0);
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
