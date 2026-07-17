#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

function filesUnder(root, directory, extensions = ['.ts', '.tsx', '.js']) {
  const results = [];
  const start = path.join(root, directory);
  if (!fs.existsSync(start)) return results;
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (extensions.includes(path.extname(entry.name))) results.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  return results.sort();
}

function staticImports(source) {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?!\()(?:(?:[^'";]+?\s+from\s+)?)["']([^"']+)["']/g)].map(match => match[1]);
}

function codeLines(source) {
  return source.split(/\r?\n/).filter(line => {
    const value = line.trim();
    return value && !value.startsWith('//') && !value.startsWith('/*') && !value.startsWith('*');
  }).length;
}

function checkFeatureBoundaries(root = process.cwd()) {
  const failures = [];
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const appFiles = filesUnder(root, 'src/app');
  for (const file of ['src/main.tsx', ...appFiles]) {
    if (file === 'src/app/feature-registry.ts') continue;
    for (const specifier of staticImports(read(file))) {
      if (specifier.includes('/features/')) failures.push(`${file} statically imports feature implementation ${specifier}`);
    }
  }
  for (const file of filesUnder(root, 'src/features')) {
    const ownFeature = file.split('/')[2];
    for (const specifier of staticImports(read(file))) {
      const match = specifier.match(/features\/([^/]+)/);
      if (match && match[1] !== ownFeature) failures.push(`${file} imports another feature directory (${specifier})`);
    }
  }
  for (const file of filesUnder(root, 'src/app/services')) {
    if (staticImports(read(file)).some(specifier => specifier.includes('/features/'))) failures.push(`${file} imports a feature implementation`);
  }
  if (fs.existsSync(path.join(root, 'js/history-controller.js'))) failures.push('js/history-controller.js must be deleted or reduced to an explicitly allowlisted compatibility shim');
  const registry = read('src/app/feature-registry.ts');
  ['history', 'current', 'rivalry', 'trophy', 'dynasty', 'draft', 'gauntlet'].forEach(id => {
    if (!new RegExp(`${id}:\\s*\\(\\)\\s*=>\\s*import\\(`).test(registry)) failures.push(`feature registry must use a literal dynamic loader for ${id}`);
  });
  if (/from\s+["'][^"']*features\//.test(registry)) failures.push('feature registry must not statically import feature modules');
  const controllers = filesUnder(root, 'src/features').filter(file => /(?:controller|feature)\.ts$/.test(file));
  for (const file of controllers) {
    const lines = codeLines(read(file));
    if (lines > 650) failures.push(`${file} has ${lines} code lines; controller maximum is 650`);
  }
  const appLines = codeLines(read('src/app/app-controller.ts'));
  if (appLines > 500) failures.push(`src/app/app-controller.ts has ${appLines} code lines; maximum is 500`);
  if (/styles\/features|\.\/features\//.test(read('src/styles/app.css'))) failures.push('src/styles/app.css must not import feature styles');
  return failures;
}

function runCli(root = process.cwd()) {
  const failures = checkFeatureBoundaries(root);
  if (failures.length) {
    failures.forEach(failure => console.error(`Feature boundary: ${failure}`));
    return 1;
  }
  console.log('Feature boundary checks passed.');
  return 0;
}

if (require.main === module) process.exit(runCli());
module.exports = { checkFeatureBoundaries, runCli, staticImports };
