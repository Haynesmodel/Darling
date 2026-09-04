const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const gateScript = indexHtml.match(/<script>\s*((?:(?!<\/script>)[\s\S])*data-draft-weekend-dismiss[\s\S]*?)<\/script>/)?.[1];
assert.ok(gateScript, 'the shell date gate script should be present');

function runGate(iso, { dismissed = false } = {}) {
  const welcome = { hidden: true };
  const dismiss = { addEventListener(type, handler) { if (type === 'click') this.click = handler; } };
  const mainContent = { focused: false, focus() { this.focused = true; } };
  const store = new Map(dismissed ? [['darling.draft-weekend-welcome.dismissed.2026', 'true']] : []);
  const document = {
    querySelector(selector) {
      return {
        '[data-draft-weekend-welcome]': welcome,
        '[data-draft-weekend-dismiss]': dismiss,
        '#mainContent': mainContent,
      }[selector] || null;
    },
  };
  const RealDate = Date;
  const fixedTime = new RealDate(iso).getTime();
  class FixedDate extends RealDate {
    constructor(...args) { super(args.length ? args[0] : fixedTime); }
    static now() { return fixedTime; }
  }
  vm.runInNewContext(gateScript, {
    Date: FixedDate,
    Intl,
    document,
    window: {
      localStorage: {
        getItem(key) { return store.get(key) ?? null; },
        setItem(key, value) { store.set(key, value); },
      },
      setInterval() {},
    },
  });
  return { welcome, dismiss, mainContent, store };
}

test('the production shell gate uses the New York calendar and the full weekend window', () => {
  assert.equal(runGate('2026-09-04T03:59:59Z').welcome.hidden, true, 'before Friday in New York');
  assert.equal(runGate('2026-09-04T04:00:00Z').welcome.hidden, false, 'Friday start');
  assert.equal(runGate('2026-09-08T03:59:59Z').welcome.hidden, false, 'Monday end');
  assert.equal(runGate('2026-09-08T04:00:00Z').welcome.hidden, true, 'after Monday in New York');
});

test('the production shell gate persists dismissal and returns focus to the app', () => {
  const result = runGate('2026-09-04T12:00:00Z');
  result.dismiss.click();
  assert.equal(result.welcome.hidden, true);
  assert.equal(result.mainContent.focused, true);
  assert.equal(result.store.get('darling.draft-weekend-welcome.dismissed.2026'), 'true');
  assert.equal(runGate('2026-09-04T12:00:00Z', { dismissed: true }).welcome.hidden, true);
});
