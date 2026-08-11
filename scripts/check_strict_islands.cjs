#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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
    if (node.type === 'TSTypeAliasDeclaration'
      && node.typeAnnotation?.type === 'TSTypeReference'
      && node.typeAnnotation.typeName?.type === 'Identifier'
      && node.typeAnnotation.typeName.name === 'ReturnType') {
      const query = node.typeAnnotation.typeParameters?.params?.[0];
      const expression = query?.type === 'TSTypeQuery' ? query.exprName : null;
      if (expression?.type === 'TSQualifiedName'
        && expression.left?.type === 'Identifier' && expression.left.name === 'JSON'
        && expression.right?.type === 'Identifier' && expression.right.name === 'parse') {
        failures.push(`${relative} derives an implicit any type from JSON.parse`);
      }
    }
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
  const failures = [];
  const typescriptRoot = path.dirname(require.resolve('typescript/package.json'));
  const result = spawnSync(process.execPath, [
    path.join(typescriptRoot, 'bin', 'tsc'),
    '-p',
    tsconfigPath,
    '--listFilesOnly',
    '--pretty',
    'false',
  ], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push(`tsconfig.strict.json: ${(result.stderr || result.stdout || result.error?.message || 'TypeScript project resolution failed').trim()}`);
    return failures;
  }
  const strictFiles = new Set(result.stdout.split(/\r?\n/).filter(Boolean).map(filename => path.resolve(filename)));
  for (const filename of sourceFiles(root, config.paths)) {
    const relative = normalize(path.relative(root, filename));
    if (!strictFiles.has(path.resolve(filename))) {
      failures.push(`${relative} is missing from the tsconfig.strict.json project`);
    }
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

module.exports = { checkSource, checkStrictIslands, normalize, sourceFiles };
