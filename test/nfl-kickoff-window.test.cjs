const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const gateScript = indexHtml.match(/<script>\s*((?:(?!<\/script>)[\s\S])*data-nfl-kickoff-dismiss[\s\S]*?)<\/script>/)?.[1];
assert.ok(gateScript, 'the shell kickoff gate script should be present');

function runGate(iso, { dismissed = false, search = '' } = {}) {
  const welcome = { hidden: true };
  const dismiss = { addEventListener(type, handler) { if (type === 'click') this.click = handler; } };
  const mainContent = { focused: false, focus() { this.focused = true; } };
  const store = new Map(dismissed ? [['darling.nfl-kickoff-welcome.dismissed.2026', 'true']] : []);
  const document = { addEventListener() {}, querySelector(selector) { return { '[data-nfl-kickoff-welcome]': welcome, '[data-nfl-kickoff-dismiss]': dismiss, '#mainContent': mainContent }[selector] || null; } };
  const RealDate = Date;
  const fixedTime = new RealDate(iso).getTime();
  class FixedDate extends RealDate { constructor(...args) { super(args.length ? args[0] : fixedTime); } static now() { return fixedTime; } }
  vm.runInNewContext(gateScript, { Date: FixedDate, Intl, URLSearchParams, document, window: { localStorage: { getItem(key) { return store.get(key) ?? null; }, setItem(key, value) { store.set(key, value); } }, setInterval() {}, addEventListener() {}, location: { search } } });
  return { welcome, dismiss, mainContent, store };
}

test('the shell gate covers kickoff weekend in New York', () => {
  assert.equal(runGate('2026-09-09T03:59:59Z').welcome.hidden, true, 'before kickoff Wednesday in New York');
  assert.equal(runGate('2026-09-09T04:00:00Z').welcome.hidden, false, 'kickoff window start');
  assert.equal(runGate('2026-09-15T03:59:59Z').welcome.hidden, false, 'Monday night end');
  assert.equal(runGate('2026-09-15T04:00:00Z').welcome.hidden, true, 'after kickoff window');
  assert.equal(runGate('2026-09-10T12:00:00Z', { search: '?tab=draft' }).welcome.hidden, true, 'deep-linked feature route');
  assert.equal(runGate('2026-09-10T12:00:00Z', { search: '?tab=pulse' }).welcome.hidden, false, 'explicit home route');
});

test('dismissal persists and returns focus to the app', () => {
  const result = runGate('2026-09-10T12:00:00Z');
  result.dismiss.click();
  assert.equal(result.welcome.hidden, true);
  assert.equal(result.mainContent.focused, true);
  assert.equal(result.store.get('darling.nfl-kickoff-welcome.dismissed.2026'), 'true');
  assert.equal(runGate('2026-09-10T12:00:00Z', { dismissed: true }).welcome.hidden, true);
});
