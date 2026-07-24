#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const normalizeId = value => String(value || '').replaceAll('\\', '/');
const chunkLabel = chunk => `${normalizeId(chunk.id)} ${normalizeId(chunk.name)} ${normalizeId(chunk.file)}`;
const matchesToken = (chunk, token) => chunkLabel(chunk).includes(normalizeId(token));
const bytesFor = list => list.reduce((sum, chunk) => sum + chunk.bytes, 0);
const gzipFor = list => list.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);

function collectClosure(byId, startIds) {
  const ids = new Set();
  const visit = id => {
    if (ids.has(id) || !byId.has(id)) return;
    ids.add(id);
    byId.get(id).imports.forEach(visit);
  };
  startIds.forEach(visit);
  return [...ids].map(id => byId.get(id));
}

function routeMeasurement(staticChunks, settledChunks) {
  return {
    staticChunks,
    settledChunks,
    staticBytes: bytesFor(staticChunks),
    staticGzipBytes: gzipFor(staticChunks),
    settledBytes: bytesFor(settledChunks),
    settledGzipBytes: gzipFor(settledChunks),
  };
}

function measureBundle(root = process.cwd(), outputDir = 'dist') {
  const budget = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/bundle-budget.json'), 'utf8'));
  const limits = budget.budgets;
  const manifestPath = path.join(root, outputDir, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { errors: [`${outputDir}/.vite/manifest.json is missing`], chunks: [], routes: {}, budget };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const byId = new Map();
  const byNormalizedId = new Map();
  const chunks = Object.entries(manifest)
    .filter(([, entry]) => entry.file?.endsWith('.js'))
    .map(([id, manifestEntry]) => {
      const contents = fs.readFileSync(path.join(root, outputDir, manifestEntry.file));
      const chunk = {
        id,
        name: manifestEntry.name || '',
        file: manifestEntry.file,
        imports: manifestEntry.imports || [],
        dynamicImports: manifestEntry.dynamicImports || [],
        isEntry: !!manifestEntry.isEntry,
        isDynamicEntry: !!manifestEntry.isDynamicEntry,
        bytes: contents.length,
        gzipBytes: zlib.gzipSync(contents, { level: 9 }).length,
      };
      byId.set(id, chunk);
      byNormalizedId.set(normalizeId(id), chunk);
      return chunk;
    })
    .sort((a, b) => b.bytes - a.bytes);

  const errors = [];
  const entry = chunks.find(chunk => chunk.isEntry);
  const resolveConfiguredEntry = id => byId.get(id) || byNormalizedId.get(normalizeId(id)) || null;
  const requiredEntries = {};
  for (const [name, id] of Object.entries(limits.required_dynamic_entries || {})) {
    const found = resolveConfiguredEntry(id);
    requiredEntries[name] = found;
    if (!found) errors.push(`required dynamic entry ${name} (${id}) is missing`);
    else if (!found.isDynamicEntry) errors.push(`required entry ${name} (${id}) is not marked as a dynamic entry`);
  }

  const namedDataChunk = requiredEntries['load-league-assets']
    || chunks.find(chunk => matchesToken(chunk, 'load-league-assets'));
  const dataChunk = namedDataChunk?.isDynamicEntry ? namedDataChunk : null;
  const entryClosure = entry ? collectClosure(byId, [entry.id]) : [];
  const chartRuntimes = chunks.filter(chunk => chunk.name === 'chart-runtime');
  const chartRuntime = chartRuntimes.length === 1 ? chartRuntimes[0] : null;
  const vendorCopies = chunks.filter(chunk => /(?:charting-vendor|chart-runtime)/.test(chunkLabel(chunk)));
  const routes = {};

  for (const [routeName, featureChunk] of Object.entries(requiredEntries)) {
    if (routeName === 'load-league-assets' || !entry || !featureChunk) continue;
    const roots = [entry.id, featureChunk.id, ...(dataChunk ? [dataChunk.id] : [])];
    const staticChunks = collectClosure(byId, roots);
    const settledRoots = [...roots];
    const requestedDynamics = limits.settled_dynamic_entries?.[routeName] || [];
    for (const token of requestedDynamics) {
      const dynamicId = featureChunk.dynamicImports.find(id => {
        const target = byId.get(id);
        return normalizeId(id) === normalizeId(token) || (target && matchesToken(target, token));
      });
      if (!dynamicId) errors.push(`settled route ${routeName} cannot resolve configured dynamic import ${token}`);
      else settledRoots.push(dynamicId);
    }
    routes[routeName] = routeMeasurement(staticChunks, collectClosure(byId, settledRoots));
  }

  const totalGzipBytes = gzipFor(chunks);

  if (!entry) errors.push('production JavaScript entry chunk is missing');
  else {
    if (entry.bytes > limits.entry_chunk_max_bytes) {
      errors.push(`entry chunk ${entry.bytes} bytes exceeds ${limits.entry_chunk_max_bytes}`);
    }
    if (limits.entry_chunk_gzip_max_bytes && entry.gzipBytes > limits.entry_chunk_gzip_max_bytes) {
      errors.push(`entry chunk ${entry.gzipBytes} gzip exceeds ${limits.entry_chunk_gzip_max_bytes}`);
    }
  }
  if (limits.require_data_runtime_chunk && !dataChunk) {
    errors.push(namedDataChunk
      ? 'data loader chunk exists but is not marked as a dynamic entry'
      : 'data loader and generated validators were not split into a dedicated dynamic chunk');
  }
  if (limits.chart_runtime_exact_copies !== undefined && chartRuntimes.length !== limits.chart_runtime_exact_copies) {
    errors.push(`chart-runtime emitted ${chartRuntimes.length} named copies; required ${limits.chart_runtime_exact_copies}`);
  }
  if (chartRuntime) {
    if (limits.chart_runtime_max_bytes && chartRuntime.bytes > limits.chart_runtime_max_bytes) {
      errors.push(`chart-runtime ${chartRuntime.bytes} bytes exceeds ${limits.chart_runtime_max_bytes}`);
    }
    if (limits.chart_runtime_gzip_max_bytes && chartRuntime.gzipBytes > limits.chart_runtime_gzip_max_bytes) {
      errors.push(`chart-runtime ${chartRuntime.gzipBytes} gzip exceeds ${limits.chart_runtime_gzip_max_bytes}`);
    }
    for (const routeName of limits.chart_runtime_excluded_routes || []) {
      if (routes[routeName]?.settledChunks.some(chunk => chunk.id === chartRuntime.id)) {
        errors.push(`${routeName} route contains chart-runtime`);
      }
    }
    for (const routeName of limits.chart_runtime_required_routes || []) {
      if (!routes[routeName]?.settledChunks.some(chunk => chunk.id === chartRuntime.id)) {
        errors.push(`${routeName} settled route is missing chart-runtime`);
      }
    }
    for (const routeName of limits.chart_runtime_dynamic_routes || []) {
      if (routes[routeName]?.staticChunks.some(chunk => chunk.id === chartRuntime.id)) {
        errors.push(`${routeName} static route contains chart-runtime; it must remain dynamic`);
      }
      if (!routes[routeName]?.settledChunks.some(chunk => chunk.id === chartRuntime.id)) {
        errors.push(`${routeName} settled route is missing its dynamic chart-runtime`);
      }
    }
    if (entryClosure.some(chunk => chunk.id === chartRuntime.id)) {
      errors.push('initial static closure contains chart-runtime');
    }
  }
  for (const [routeName, maximum] of Object.entries(limits.route_settled_gzip_max_bytes || {})) {
    const route = routes[routeName];
    if (!route) errors.push(`route budget configured for missing route ${routeName}`);
    else if (route.settledGzipBytes > maximum) {
      errors.push(`${routeName} settled route ${route.settledGzipBytes} gzip exceeds ${maximum}`);
    }
  }
  if (limits.feature_chunk_gzip_max_bytes) {
    Object.entries(requiredEntries)
      .filter(([name]) => name !== 'load-league-assets')
      .forEach(([name, chunk]) => {
        if (chunk && chunk.gzipBytes > limits.feature_chunk_gzip_max_bytes) {
          errors.push(`${name} feature chunk ${chunk.gzipBytes} gzip exceeds ${limits.feature_chunk_gzip_max_bytes}`);
        }
      });
  }
  if (limits.non_validator_chunk_max_bytes) {
    chunks
      .filter(chunk => !matchesToken(chunk, 'asset-validators'))
      .forEach(chunk => {
        if (chunk.bytes > limits.non_validator_chunk_max_bytes) {
          errors.push(`${chunk.file} is ${chunk.bytes} bytes; non-validator maximum is ${limits.non_validator_chunk_max_bytes}`);
        }
      });
  }
  for (const token of limits.forbidden_initial_modules || []) {
    const leaked = entryClosure.find(chunk => matchesToken(chunk, token));
    if (leaked) errors.push(`initial static closure contains forbidden module ${leaked.id}`);
  }
  if (limits.plot_vendor_max_copies !== undefined && vendorCopies.length > limits.plot_vendor_max_copies) {
    errors.push(`Plot/vendor emitted ${vendorCopies.length} copies; maximum is ${limits.plot_vendor_max_copies}`);
  }
  if (totalGzipBytes > limits.total_javascript_gzip_max_bytes) {
    errors.push(`total JavaScript gzip ${totalGzipBytes} bytes exceeds ${limits.total_javascript_gzip_max_bytes}`);
  }

  const history = routes.history || routeMeasurement([], []);
  const pulse = routes['league-pulse'] || routeMeasurement([], []);
  return {
    errors,
    chunks,
    totalGzipBytes,
    dataChunk,
    entry,
    entryClosure,
    chartRuntime,
    chartRuntimes,
    routes,
    initialHistory: history.staticChunks,
    initialHistoryGzipBytes: history.staticGzipBytes,
    initialHistoryBytes: history.staticBytes,
    pulseRoute: pulse.staticChunks,
    pulseRouteGzipBytes: pulse.staticGzipBytes,
    pulseRouteBytes: pulse.staticBytes,
    requiredEntries,
    vendorCopies,
    budget,
  };
}

if (require.main === module) {
  const result = measureBundle();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Bundle baseline ${result.budget.baseline.commit}: ${result.budget.baseline.largest_chunk_bytes} bytes / ${result.budget.baseline.largest_chunk_gzip_bytes} gzip in one chunk.`);
    result.chunks.forEach(chunk => console.log(`- ${chunk.file}: ${chunk.bytes} bytes, ${chunk.gzipBytes} gzip${chunk.isEntry ? ' (entry)' : chunk.isDynamicEntry ? ' (dynamic)' : ''}`));
    if (result.chartRuntime) console.log(`Chart runtime: ${result.chartRuntime.bytes} bytes, ${result.chartRuntime.gzipBytes} gzip.`);
    const routeRows = Object.entries(result.routes);
    if (routeRows.length) {
      console.log('Route                     Static gzip   Settled gzip');
      routeRows.forEach(([name, route]) => {
        console.log(`${name.padEnd(25)} ${String(route.staticGzipBytes).padStart(11)}   ${String(route.settledGzipBytes).padStart(12)}`);
      });
    }
    const dynamics = Object.entries(result.requiredEntries || {}).filter(([, chunk]) => chunk).map(([name]) => name);
    if (dynamics.length) console.log(`Required dynamic entries: ${dynamics.join(', ')}.`);
    if (!result.errors.length) console.log(`Bundle budget passed; total JavaScript gzip ${result.totalGzipBytes} bytes.`);
  }
  if (result.errors.length) {
    result.errors.forEach(error => console.error(`ERROR [BUNDLE_BUDGET] ${error}`));
    process.exit(1);
  }
}

module.exports = {
  collectClosure,
  measureBundle,
  normalizeId,
  routeMeasurement,
};
