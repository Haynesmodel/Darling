/* Guard repository conventions that are easy to regress during small edits. */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function jsFiles(dir) {
  return fs.readdirSync(path.join(root, dir))
    .filter(name => name.endsWith('.js'))
    .map(name => path.join(dir, name));
}

const pkg = JSON.parse(read('package.json'));
if (pkg.type !== 'module') {
  fail('package.json must declare "type": "module" for browser/test helpers.');
}

const indexHtml = read('index.html');
const classicScripts = [...indexHtml.matchAll(/<script(?![^>]*\btype=["']module["'])[^>]*\bsrc=["'][^"']+\.js["'][^>]*>/g)];
if (classicScripts.length) {
  fail(`index.html must not load classic JavaScript scripts: ${classicScripts.map(match => match[0]).join(', ')}`);
}
if (!/<script\s+type=["']module["']\s+src=["']js\/app\.js["']><\/script>/.test(indexHtml)) {
  fail('index.html must load js/app.js as the single module entrypoint.');
}

for (const relPath of jsFiles('js')) {
  const src = read(relPath);
  for (const pattern of [
    { re: /\bmodule\.exports\b/, label: 'CommonJS exports' },
    { re: /\brequire\s*\(/, label: 'CommonJS require' },
    { re: /\bObject\.assign\s*\(\s*global\b/, label: 'global helper export' },
    { re: /\bglobal\.fetch\b/, label: 'global.fetch default' },
  ]) {
    if (pattern.re.test(src)) {
      fail(`${relPath} must not use ${pattern.label}.`);
    }
  }
}

for (const relPath of jsFiles('js').filter(file => file !== 'js/app.js' && file !== 'js/easter-eggs.js')) {
  const src = read(relPath);
  if (!/\bexport\s*\{/.test(src)) {
    fail(`${relPath} must export named helper APIs.`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`Repo hygiene: ${failure}`);
  process.exit(1);
}

console.log('Repo hygiene checks passed.');
