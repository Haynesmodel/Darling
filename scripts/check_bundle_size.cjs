#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function measureBundle(root = process.cwd(), outputDir = 'dist') {
  const budget = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/bundle-budget.json'), 'utf8'));
  const limits = budget.budgets;
  const manifestPath = path.join(root, outputDir, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { errors: [`${outputDir}/.vite/manifest.json is missing`], chunks: [], budget };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const byId = new Map();
  const chunks = Object.entries(manifest).filter(([, entry]) => entry.file?.endsWith('.js')).map(([id, entry]) => {
    const contents = fs.readFileSync(path.join(root, outputDir, entry.file));
    const chunk = { id, name: entry.name || '', file: entry.file, imports: entry.imports || [], isEntry: !!entry.isEntry, isDynamicEntry: !!entry.isDynamicEntry, bytes: contents.length, gzipBytes: zlib.gzipSync(contents, { level: 9 }).length };
    byId.set(id, chunk);
    return chunk;
  }).sort((a, b) => b.bytes - a.bytes);
  const closure = startIds => {
    const ids = new Set();
    const visit = id => {
      if (ids.has(id) || !byId.has(id)) return;
      ids.add(id);
      byId.get(id).imports.forEach(visit);
    };
    startIds.forEach(visit);
    return [...ids].map(id => byId.get(id));
  };
  const bytesFor = list => list.reduce((sum, chunk) => sum + chunk.bytes, 0);
  const gzipFor = list => list.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  const errors = [];
  const entry = chunks.find(chunk => chunk.isEntry);
  const entryClosure = entry ? closure([entry.id]) : [];
  const requiredEntries = {};
  for (const [name, id] of Object.entries(limits.required_dynamic_entries || {})) {
    const found = byId.get(id);
    requiredEntries[name] = found || null;
    if (!found) errors.push(`required dynamic entry ${name} (${id}) is missing`);
    else if (!found.isDynamicEntry) errors.push(`required entry ${name} (${id}) is not marked as a dynamic entry`);
  }
  const namedDataChunk = requiredEntries['load-league-assets'] || chunks.find(chunk => chunk.id.includes('load-league-assets') || chunk.file.includes('load-league-assets'));
  const dataChunk = namedDataChunk?.isDynamicEntry ? namedDataChunk : null;
  const historyChunk = requiredEntries.history;
  const initialHistory = entry && historyChunk && dataChunk ? closure([entry.id, historyChunk.id, dataChunk.id]) : [];
  const pulseChunk = requiredEntries['league-pulse'];
  const pulseRoute = entry && pulseChunk ? closure([entry.id, pulseChunk.id, ...(dataChunk ? [dataChunk.id] : [])]) : [];
  const totalGzipBytes = gzipFor(chunks);
  const vendorCopies = chunks.filter(chunk => /(?:charting-vendor|chart-runtime)/.test(`${chunk.id} ${chunk.name} ${chunk.file}`));

  if (!entry) errors.push('production JavaScript entry chunk is missing');
  else {
    if (entry.bytes > limits.entry_chunk_max_bytes) errors.push(`entry chunk ${entry.bytes} bytes exceeds ${limits.entry_chunk_max_bytes}`);
    if (limits.entry_chunk_gzip_max_bytes && entry.gzipBytes > limits.entry_chunk_gzip_max_bytes) errors.push(`entry chunk ${entry.gzipBytes} gzip exceeds ${limits.entry_chunk_gzip_max_bytes}`);
  }
  if (limits.require_data_runtime_chunk && !dataChunk) errors.push(namedDataChunk ? 'data loader chunk exists but is not marked as a dynamic entry' : 'data loader and generated validators were not split into a dedicated dynamic chunk');
  if (limits.initial_history_gzip_max_bytes && gzipFor(initialHistory) > limits.initial_history_gzip_max_bytes) errors.push(`initial History route ${gzipFor(initialHistory)} gzip exceeds ${limits.initial_history_gzip_max_bytes}`);
  if (limits.pulse_route_gzip_max_bytes && gzipFor(pulseRoute) > limits.pulse_route_gzip_max_bytes) errors.push(`cold Pulse route ${gzipFor(pulseRoute)} gzip exceeds ${limits.pulse_route_gzip_max_bytes}`);
  if (pulseRoute.some(chunk => /(?:charting-vendor|chart-runtime)/.test(`${chunk.id} ${chunk.name} ${chunk.file}`))) errors.push('cold Pulse route contains Plot/chart runtime');
  if (limits.feature_chunk_gzip_max_bytes) Object.entries(requiredEntries).filter(([name]) => name !== 'load-league-assets').forEach(([name, chunk]) => {
    if (chunk && chunk.gzipBytes > limits.feature_chunk_gzip_max_bytes) errors.push(`${name} feature chunk ${chunk.gzipBytes} gzip exceeds ${limits.feature_chunk_gzip_max_bytes}`);
  });
  if (limits.non_validator_chunk_max_bytes) chunks.filter(chunk => !/asset-validators/.test(`${chunk.id} ${chunk.file}`)).forEach(chunk => {
    if (chunk.bytes > limits.non_validator_chunk_max_bytes) errors.push(`${chunk.file} is ${chunk.bytes} bytes; non-validator maximum is ${limits.non_validator_chunk_max_bytes}`);
  });
  for (const token of limits.forbidden_initial_modules || []) {
    const leaked = entryClosure.find(chunk => chunk.id.includes(token) || chunk.file.includes(token));
    if (leaked) errors.push(`initial static closure contains forbidden module ${leaked.id}`);
  }
  if (limits.plot_vendor_max_copies !== undefined && vendorCopies.length > limits.plot_vendor_max_copies) errors.push(`Plot/vendor emitted ${vendorCopies.length} copies; maximum is ${limits.plot_vendor_max_copies}`);
  if (totalGzipBytes > limits.total_javascript_gzip_max_bytes) errors.push(`total JavaScript gzip ${totalGzipBytes} bytes exceeds ${limits.total_javascript_gzip_max_bytes}`);
  return { errors, chunks, totalGzipBytes, dataChunk, entry, entryClosure, initialHistory, initialHistoryGzipBytes: gzipFor(initialHistory), initialHistoryBytes: bytesFor(initialHistory), pulseRoute, pulseRouteGzipBytes: gzipFor(pulseRoute), pulseRouteBytes: bytesFor(pulseRoute), requiredEntries, vendorCopies, budget };
}

if (require.main === module) {
  const result = measureBundle();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Bundle baseline ${result.budget.baseline.commit}: ${result.budget.baseline.largest_chunk_bytes} bytes / ${result.budget.baseline.largest_chunk_gzip_bytes} gzip in one chunk.`);
    result.chunks.forEach(chunk => console.log(`- ${chunk.file}: ${chunk.bytes} bytes, ${chunk.gzipBytes} gzip${chunk.isEntry ? ' (entry)' : chunk.isDynamicEntry ? ' (dynamic)' : ''}`));
    if (result.initialHistory.length) console.log(`Cold History JavaScript: ${result.initialHistoryBytes} bytes, ${result.initialHistoryGzipBytes} gzip across ${result.initialHistory.length} chunks.`);
    if (result.pulseRoute.length) console.log(`Cold Pulse JavaScript: ${result.pulseRouteBytes} bytes, ${result.pulseRouteGzipBytes} gzip across ${result.pulseRoute.length} chunks.`);
    const dynamics = Object.entries(result.requiredEntries || {}).filter(([, chunk]) => chunk).map(([name]) => name);
    if (dynamics.length) console.log(`Required dynamic entries: ${dynamics.join(', ')}.`);
    if (!result.errors.length) console.log(`Bundle budget passed; total JavaScript gzip ${result.totalGzipBytes} bytes.`);
  }
  if (result.errors.length) {
    result.errors.forEach(error => console.error(`ERROR [BUNDLE_BUDGET] ${error}`));
    process.exit(1);
  }
}

module.exports = { measureBundle };
