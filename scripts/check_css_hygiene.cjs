const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

function listCssFiles(root, directory = 'src') {
  const files = [];
  const stack = [path.join(root, directory)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith('.css')) {
        files.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    }
  }
  return files.sort();
}

function lineBudgetFor(file, budgets) {
  if (budgets.lineBudgets[file]) return budgets.lineBudgets[file];
  return file.includes('/features/')
    ? budgets.defaultFeatureLineBudget
    : budgets.defaultSharedLineBudget;
}

function importedCssFiles(root, appPath, files) {
  const source = fs.readFileSync(path.join(root, appPath), 'utf8');
  const ast = postcss.parse(source, { from: appPath });
  const imported = new Set();
  const layers = new Map();
  const roots = [appPath, ...files.filter(file => file.endsWith('.entry.css'))];
  const visit = (cssPath, inheritedLayer = 'unlayered') => {
    if (cssPath !== appPath) imported.add(cssPath);
    const css = fs.readFileSync(path.join(root, cssPath), 'utf8');
    const cssAst = postcss.parse(css, { from: cssPath });
    cssAst.walkAtRules('import', rule => {
      const match = rule.params.match(/^["']([^"']+\.css)["']/);
      if (!match) return;
      const resolved = path.normalize(path.join(path.dirname(cssPath), match[1]));
      const normalized = resolved.split(path.sep).join('/');
      const layer = rule.params.match(/\blayer\(([^)]+)\)/)?.[1]?.trim() || inheritedLayer;
      if (!layers.has(normalized)) layers.set(normalized, layer);
      if (!imported.has(normalized)) visit(normalized, layer);
    });
  };
  roots.forEach(rootPath => visit(rootPath));
  return { ast, imported, layers };
}

function selectorContext(rule) {
  const contexts = [];
  let parent = rule.parent;
  while (parent) {
    if (parent.type === 'atrule') contexts.unshift(`@${parent.name} ${parent.params}`.trim());
    parent = parent.parent;
  }
  return contexts.join(' > ');
}

function checkCssHygiene(root = process.cwd()) {
  const budgetPath = path.join(root, 'scripts/data/css-budget.json');
  const budgets = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
  const files = listCssFiles(root);
  const failures = [];
  const appPath = 'src/styles/app.css';
  const { ast: appAst, imported, layers } = importedCssFiles(root, appPath, files);
  const layeredSelectors = new Map();

  appAst.nodes.forEach(node => {
    if (node.type !== 'atrule' || !['import', 'layer'].includes(node.name)) {
      failures.push(`${appPath} must contain imports and the cascade-layer declaration only.`);
    }
  });

  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const lineCount = source.split(/\r?\n/).length;
    const lineBudget = lineBudgetFor(file, budgets);
    if (lineCount > lineBudget) {
      failures.push(`${file} has ${lineCount} lines; budget is ${lineBudget}.`);
    }

    const importantCount = (source.match(/!important\b/g) || []).length;
    const importantBudget = budgets.importantBudgets[file] || 0;
    if (importantCount > importantBudget) {
      failures.push(`${file} has ${importantCount} !important declarations; budget is ${importantBudget}.`);
    }

    const hardcodedColors = source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [];
    const hardcodedBudget = budgets.hardcodedColorBudgets[file] || 0;
    if (hardcodedColors.length > hardcodedBudget) {
      failures.push(`${file} has ${hardcodedColors.length} hard-coded colors; budget is ${hardcodedBudget}.`);
    }

    const ast = postcss.parse(source, { from: file });
    const selectors = new Set();
    ast.walkRules(rule => {
      const selector = rule.selector.replace(/\s+/g, ' ').trim();
      const key = `${selectorContext(rule)}|${selector}`;
      if (selectors.has(key)) failures.push(`${file} repeats selector "${selector}" in the same context.`);
      selectors.add(key);
      if (file !== appPath) {
        const layeredKey = `${layers.get(file) || 'unlayered'}|${key}`;
        const previousFile = layeredSelectors.get(layeredKey);
        if (previousFile && previousFile !== file) {
          failures.push(`${file} and ${previousFile} repeat selector "${selector}" in the same cascade layer and context.`);
        } else {
          layeredSelectors.set(layeredKey, file);
        }
      }
    });
    ast.walkDecls(declaration => {
      if (
        (declaration.prop === 'outline' || declaration.prop === 'outline-style')
        && /^(?:0|none)$/i.test(declaration.value.trim())
      ) {
        failures.push(`${file} uses ${declaration.prop}:${declaration.value} without a canonical focus replacement.`);
      }
    });
  }

  for (const file of files) {
    if (file === appPath) continue;
    if (!imported.has(file)) failures.push(`${file} is not imported by ${appPath}.`);
  }

  return failures;
}

function runCli(root = process.cwd()) {
  const failures = checkCssHygiene(root);
  if (failures.length) {
    failures.forEach(failure => console.error(`CSS hygiene: ${failure}`));
    return 1;
  }
  console.log('CSS hygiene checks passed.');
  return 0;
}

if (require.main === module) {
  process.exit(runCli());
}

module.exports = {
  checkCssHygiene,
  runCli,
};
