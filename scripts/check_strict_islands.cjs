#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

const normalize = value => String(value || '').replaceAll('\\', '/');

function sourceFiles(root, entries) {
  const files = [];
  const visit = target => {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      fs.readdirSync(target, { withFileTypes: true }).forEach(entry => visit(path.join(target, entry.name)));
    } else if (/\.(?:ts|tsx)$/.test(target) && !target.endsWith('.d.ts')) files.push(target);
  };
  entries.forEach(entry => visit(path.join(root, entry)));
  return files.sort();
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  Object.values(node).forEach(value => {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  });
}

function checkSource(relative, source, config) {
  const failures = [];
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', ...(relative.endsWith('.tsx') ? ['jsx'] : [])],
  });
  const directive = source.match(/@ts-(?:ignore|nocheck)\b/);
  if (directive) failures.push(`${relative} contains ${directive[0]}`);
  walk(ast, node => {
    if (node.type === 'TSAnyKeyword') failures.push(`${relative} contains explicit any`);
    if ((node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') && !node.computed
      && node.property?.type === 'Identifier' && node.property.name === 'innerHTML') {
      failures.push(`${relative} uses innerHTML`);
    }
    if ((node.type === 'CallExpression' || node.type === 'OptionalCallExpression')
      && node.callee?.type === 'MemberExpression' && !node.callee.computed
      && node.callee.property?.type === 'Identifier' && node.callee.property.name === 'insertAdjacentHTML') {
      failures.push(`${relative} uses insertAdjacentHTML`);
    }
    if (node.type === 'JSXAttribute' && node.name?.type === 'JSXIdentifier' && node.name.name === 'dangerouslySetInnerHTML') {
      failures.push(`${relative} uses dangerouslySetInnerHTML`);
    }
    if (node.type === 'ImportDeclaration') {
      const specifier = String(node.source.value || '');
      if (/(?:rivalry|trophy|dynasty|current-season)-(?:renderers|controls)\.js$/.test(specifier)) {
        failures.push(`${relative} imports a target legacy renderer/control (${specifier})`);
      }
      if (/js\/charting\/vendor\/charting-vendor\.js$/.test(normalize(specifier))
        && !config.direct_plot_vendor_import_exceptions.includes(relative)) {
        failures.push(`${relative} imports the generated Plot vendor directly`);
      }
      if (specifier === '@observablehq/plot' && node.importKind !== 'type') {
        failures.push(`${relative} imports Observable Plot as a runtime value`);
      }
    }
  });
  return [...new Set(failures)];
}

function checkStrictIslands(root = process.cwd()) {
  const manifestPath = path.join(root, 'scripts/data/strict-islands.json');
  const tsconfigPath = path.join(root, 'tsconfig.strict.json');
  const config = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  const includes = (tsconfig.include || []).map(normalize);
  const failures = [];
  for (const entry of config.paths) {
    const normalized = normalize(entry);
    if (!includes.some(include => include.startsWith(`${normalized}/`) || include === normalized)) {
      failures.push(`${normalized} is missing from tsconfig.strict.json include`);
    }
  }
  for (const filename of sourceFiles(root, config.paths)) {
    const relative = normalize(path.relative(root, filename));
    failures.push(...checkSource(relative, fs.readFileSync(filename, 'utf8'), config));
  }
  return failures;
}

if (require.main === module) {
  const failures = checkStrictIslands();
  if (failures.length) {
    failures.forEach(failure => console.error(`ERROR [STRICT_ISLAND] ${failure}`));
    process.exit(1);
  }
  console.log('Strict-island policy checks passed.');
}

module.exports = { checkSource, checkStrictIslands, normalize };
