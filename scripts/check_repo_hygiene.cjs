/* Guard repository conventions that are easy to regress during small edits. */
const fs = require('node:fs');
const path = require('node:path');

function read(root, relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function jsFiles(root, dir, opts = {}) {
  const files = [];
  const excludedDirs = new Set(opts.excludedDirs || []);
  const start = path.join(root, dir);
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absPath = path.join(current, entry.name);
      const relPath = path.relative(root, absPath);
      if (entry.isDirectory()) {
        if (!excludedDirs.has(relPath)) stack.push(absPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(relPath);
      }
    }
  }
  return files.sort();
}

function checkRepoHygiene(root = process.cwd()) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const pkg = JSON.parse(read(root, 'package.json'));
  if (pkg.type !== 'module') {
    fail('package.json must declare "type": "module" for browser/test helpers.');
  }

  const indexHtml = read(root, 'index.html');
  const classicScripts = [...indexHtml.matchAll(/<script(?![^>]*\btype=["']module["'])[^>]*\bsrc=["'][^"']+\.js["'][^>]*>/g)];
  if (classicScripts.length) {
    fail(`index.html must not load classic JavaScript scripts: ${classicScripts.map(match => match[0]).join(', ')}`);
  }
  if (!/<script\s+type=["']module["']\s+src=["']js\/app\.js["']><\/script>/.test(indexHtml)) {
    fail('index.html must load js/app.js as the single module entrypoint.');
  }
  if (!fs.existsSync(path.join(root, 'js/charting/vendor/charting-vendor.js'))) {
    fail('js/charting/vendor/charting-vendor.js must exist. Run npm run build:charts after changing chart dependencies.');
  }

  const sourceJsFiles = jsFiles(root, 'js', {
    excludedDirs: [path.join('js', 'charting', 'vendor')],
  });

  for (const relPath of sourceJsFiles) {
    const src = read(root, relPath);
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

  for (const relPath of sourceJsFiles.filter(file => file !== 'js/app.js')) {
    const src = read(root, relPath);
    if (!/\bexport\s*\{/.test(src)) {
      fail(`${relPath} must export named helper APIs.`);
    }
  }

  return failures;
}

function runCli(root = process.cwd()) {
  const failures = checkRepoHygiene(root);
  if (failures.length) {
    for (const failure of failures) console.error(`Repo hygiene: ${failure}`);
    return 1;
  }

  console.log('Repo hygiene checks passed.');
  return 0;
}

if (require.main === module) {
  process.exit(runCli());
}

module.exports = {
  checkRepoHygiene,
  runCli,
};
