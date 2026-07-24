const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectClosure, measureBundle, normalizeId } = require('../scripts/check_bundle_size.cjs');

function withBundleFixture({ manifest, budgets, files = {} }, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-bundle-'));
  try {
    const assetDir = path.join(root, 'dist', 'assets');
    fs.mkdirSync(path.join(root, 'dist', '.vite'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts', 'data'), { recursive: true });
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts', 'data', 'bundle-budget.json'), JSON.stringify({
      baseline: { commit: 'fixture', largest_chunk_bytes: 1, largest_chunk_gzip_bytes: 1 },
      budgets: {
        entry_chunk_max_bytes: 10000,
        total_javascript_gzip_max_bytes: 10000,
        ...budgets,
      },
    }));
    fs.writeFileSync(path.join(root, 'dist', '.vite', 'manifest.json'), JSON.stringify(manifest));
    Object.values(manifest).forEach(entry => {
      if (!entry.file?.endsWith('.js')) return;
      fs.writeFileSync(path.join(root, 'dist', entry.file), files[entry.file] || `export const ${path.basename(entry.file, '.js').replaceAll('-', '_')} = true;\n`);
    });
    return callback(measureBundle(root), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('static closure deduplicates shared chunks and terminates cycles', () => {
  const shared = { id: 'shared', imports: ['cycle'], bytes: 2, gzipBytes: 2 };
  const cycle = { id: 'cycle', imports: ['shared'], bytes: 3, gzipBytes: 3 };
  const root = { id: 'root', imports: ['shared', 'cycle'], bytes: 1, gzipBytes: 1 };
  const byId = new Map([root, shared, cycle].map(chunk => [chunk.id, chunk]));
  assert.deepEqual(collectClosure(byId, ['root']).map(chunk => chunk.id), ['root', 'shared', 'cycle']);
});

test('route graph excludes shell dynamics and includes only configured settled imports', () => {
  withBundleFixture({
    budgets: {
      chart_runtime_exact_copies: 1,
      chart_runtime_excluded_routes: ['history'],
      chart_runtime_required_routes: ['current', 'draft'],
      chart_runtime_dynamic_routes: ['draft'],
      required_dynamic_entries: {
        current: 'src/features/current.ts',
        draft: 'src/features/draft.ts',
        history: 'src/features/history.ts',
        'load-league-assets': 'src/data/load.ts',
      },
      settled_dynamic_entries: {
        current: ['current-odds'],
        draft: ['chart-runtime'],
      },
    },
    manifest: {
      'index.html': {
        file: 'assets/index.js',
        isEntry: true,
        imports: ['_shared.js'],
        dynamicImports: ['src/features/current.ts', 'src/features/draft.ts', 'src/features/history.ts'],
      },
      '_shared.js': { file: 'assets/shared.js' },
      '_chart.js': { file: 'assets/chart.js', name: 'chart-runtime', imports: ['_shared.js'] },
      'src/data/load.ts': { file: 'assets/load.js', isDynamicEntry: true, imports: ['_shared.js'] },
      'src/features/current.ts': {
        file: 'assets/current.js',
        isDynamicEntry: true,
        imports: ['_chart.js', '_shared.js'],
        dynamicImports: ['js/current-odds.js'],
      },
      'js/current-odds.js': { file: 'assets/odds.js', name: 'current-odds', isDynamicEntry: true, imports: ['_chart.js'] },
      'src/features/draft.ts': { file: 'assets/draft.js', isDynamicEntry: true, dynamicImports: ['_chart.js'] },
      'src/features/history.ts': { file: 'assets/history.js', isDynamicEntry: true },
    },
  }, result => {
    assert.deepEqual(result.errors, []);
    assert.equal(result.routes.current.staticChunks.filter(chunk => chunk.name === 'chart-runtime').length, 1);
    assert.equal(result.routes.current.settledChunks.some(chunk => chunk.name === 'current-odds'), true);
    assert.equal(result.routes.draft.staticChunks.some(chunk => chunk.name === 'chart-runtime'), false);
    assert.equal(result.routes.draft.settledChunks.filter(chunk => chunk.name === 'chart-runtime').length, 1);
    assert.equal(result.routes.history.settledChunks.some(chunk => chunk.name === 'chart-runtime'), false);
    assert.equal(result.routes.history.settledChunks.some(chunk => chunk.id === 'src/features/current.ts'), false);
    assert.deepEqual(result.chunks.find(chunk => chunk.id === 'index.html').dynamicImports, [
      'src/features/current.ts',
      'src/features/draft.ts',
      'src/features/history.ts',
    ]);
  });
});

test('missing, duplicate, and non-chart route runtime leaks fail', () => {
  const baseBudgets = {
    chart_runtime_exact_copies: 1,
    chart_runtime_excluded_routes: ['history', 'league-pulse'],
    required_dynamic_entries: {
      history: 'src/features/history.ts',
      'league-pulse': 'src/features/pulse.ts',
    },
  };
  const baseManifest = {
    'index.html': { file: 'assets/index.js', isEntry: true },
    'src/features/history.ts': { file: 'assets/history.js', isDynamicEntry: true },
    'src/features/pulse.ts': { file: 'assets/pulse.js', isDynamicEntry: true },
  };
  withBundleFixture({ budgets: baseBudgets, manifest: baseManifest }, result => {
    assert.ok(result.errors.some(error => error.includes('emitted 0 named copies')));
  });
  withBundleFixture({
    budgets: baseBudgets,
    manifest: {
      ...baseManifest,
      '_chart-a.js': { file: 'assets/chart-a.js', name: 'chart-runtime' },
      '_chart-b.js': { file: 'assets/chart-b.js', name: 'chart-runtime' },
    },
  }, result => {
    assert.ok(result.errors.some(error => error.includes('emitted 2 named copies')));
  });
  withBundleFixture({
    budgets: baseBudgets,
    manifest: {
      ...baseManifest,
      'src/features/history.ts': { file: 'assets/history.js', isDynamicEntry: true, imports: ['_chart.js'] },
      '_chart.js': { file: 'assets/chart.js', name: 'chart-runtime' },
    },
  }, result => {
    assert.ok(result.errors.some(error => error.includes('history route contains chart-runtime')));
  });
});

test('raw, gzip, aggregate, and route overages report actual and allowed values', () => {
  withBundleFixture({
    budgets: {
      entry_chunk_max_bytes: 5,
      entry_chunk_gzip_max_bytes: 5,
      non_validator_chunk_max_bytes: 5,
      total_javascript_gzip_max_bytes: 5,
      required_dynamic_entries: { history: 'src/features/history.ts' },
      route_settled_gzip_max_bytes: { history: 5 },
    },
    manifest: {
      'index.html': { file: 'assets/index.js', isEntry: true },
      'src/features/history.ts': { file: 'assets/history.js', isDynamicEntry: true },
    },
    files: {
      'assets/index.js': 'export const application = "deliberately oversized";\n',
      'assets/history.js': 'export const history = "also deliberately oversized";\n',
    },
  }, result => {
    assert.ok(result.errors.some(error => /entry chunk \d+ bytes exceeds 5/.test(error)));
    assert.ok(result.errors.some(error => /entry chunk \d+ gzip exceeds 5/.test(error)));
    assert.ok(result.errors.some(error => /history settled route \d+ gzip exceeds 5/.test(error)));
    assert.ok(result.errors.some(error => /total JavaScript gzip \d+ bytes exceeds 5/.test(error)));
  });
});

test('configured entry matching is separator-independent and route JSON fields are stable', () => {
  withBundleFixture({
    budgets: {
      required_dynamic_entries: {
        history: 'src/features/history/history-controller.ts',
      },
    },
    manifest: {
      'index.html': { file: 'assets/index.js', isEntry: true },
      'src\\features\\history\\history-controller.ts': { file: 'assets/history.js', isDynamicEntry: true },
    },
  }, result => {
    assert.deepEqual(result.errors, []);
    assert.equal(normalizeId('src\\features\\history.ts'), 'src/features/history.ts');
    assert.deepEqual(Object.keys(result.routes.history).sort(), [
      'settledBytes',
      'settledChunks',
      'settledGzipBytes',
      'staticBytes',
      'staticChunks',
      'staticGzipBytes',
    ]);
  });
});
