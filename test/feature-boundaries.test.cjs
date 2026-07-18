const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkFeatureBoundaries, featureDirectoryForImport, staticImports } = require('../scripts/check_feature_boundaries.cjs');

test('feature architecture boundaries pass for the repository', () => {
  assert.deepEqual(checkFeatureBoundaries(process.cwd()), []);
});

test('static import parser ignores dynamic feature loaders', () => {
  assert.deepEqual(staticImports("import type { A } from './a';\nconst load = () => import('../features/history/controller');\n"), ['./a']);
});

test('feature import resolver identifies sibling-relative feature directories', () => {
  assert.equal(featureDirectoryForImport('/repo', 'src/features/history/controller.ts', '../rivalry/controller'), 'rivalry');
  assert.equal(featureDirectoryForImport('/repo', 'src/features/history/controller.ts', './history-table'), 'history');
});

test('feature boundary checker rejects eager shell imports', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-boundary-'));
  try {
    fs.mkdirSync(path.join(root, 'src', 'app', 'services'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'features', 'history'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'styles'), { recursive: true });
    fs.mkdirSync(path.join(root, 'js'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'main.tsx'), "import './features/history/controller';\n");
    fs.writeFileSync(path.join(root, 'src', 'app', 'app-controller.ts'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'src', 'app', 'feature-registry.ts'), "export const x = { history: () => import('../features/history/controller'), current: () => import('../features/current/controller'), rivalry: () => import('../features/rivalry/controller'), trophy: () => import('../features/trophy/controller'), dynasty: () => import('../features/dynasty/controller'), draft: () => import('../features/draft/controller'), gauntlet: () => import('../features/gauntlet/controller') };\n");
    fs.writeFileSync(path.join(root, 'src', 'features', 'history', 'controller.ts'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'src', 'styles', 'app.css'), '@import "./features/history.css";\n');
    const failures = checkFeatureBoundaries(root);
    assert.ok(failures.some(failure => failure.includes('statically imports feature')));
    assert.ok(failures.some(failure => failure.includes('must not import feature styles')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('feature boundary checker rejects sibling-relative cross-feature imports', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-cross-feature-'));
  try {
    fs.mkdirSync(path.join(root, 'src', 'app', 'services'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'features', 'history'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'features', 'rivalry'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'styles'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'main.tsx'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'src', 'app', 'app-controller.ts'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'src', 'app', 'feature-registry.ts'), "export const x = { history: () => import('../features/history/controller'), current: () => import('../features/current/controller'), rivalry: () => import('../features/rivalry/controller'), trophy: () => import('../features/trophy/controller'), dynasty: () => import('../features/dynasty/controller'), draft: () => import('../features/draft/controller'), gauntlet: () => import('../features/gauntlet/controller') };\n");
    fs.writeFileSync(path.join(root, 'src', 'features', 'history', 'controller.ts'), "import '../rivalry/controller';\n");
    fs.writeFileSync(path.join(root, 'src', 'features', 'rivalry', 'controller.ts'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'src', 'styles', 'app.css'), '@layer reset, base, components, utilities;\n');
    const failures = checkFeatureBoundaries(root);
    assert.ok(failures.some(failure => failure.includes('imports another feature directory')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
