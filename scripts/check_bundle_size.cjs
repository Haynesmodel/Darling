#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function measureBundle(root = process.cwd(), outputDir = 'dist') {
  const budget = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/bundle-budget.json'), 'utf8'));
  const manifestPath = path.join(root, outputDir, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { errors: [`${outputDir}/.vite/manifest.json is missing`], chunks: [], budget };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const chunks = Object.entries(manifest)
    .filter(([, entry]) => entry.file?.endsWith('.js'))
    .map(([id, entry]) => {
      const filePath = path.join(root, outputDir, entry.file);
      const contents = fs.readFileSync(filePath);
      return {
        id,
        file: entry.file,
        isEntry: !!entry.isEntry,
        isDynamicEntry: !!entry.isDynamicEntry,
        bytes: contents.length,
        gzipBytes: zlib.gzipSync(contents, { level: 9 }).length,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
  const errors = [];
  const entry = chunks.find(chunk => chunk.isEntry);
  const namedDataChunk = chunks.find(chunk => chunk.id.includes('load-league-assets') || chunk.file.includes('load-league-assets'));
  const dataChunk = namedDataChunk?.isDynamicEntry ? namedDataChunk : null;
  const totalGzipBytes = chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  if (!entry) errors.push('production JavaScript entry chunk is missing');
  else if (entry.bytes > budget.budgets.entry_chunk_max_bytes) {
    errors.push(`entry chunk ${entry.bytes} bytes exceeds ${budget.budgets.entry_chunk_max_bytes}`);
  }
  if (budget.budgets.require_data_runtime_chunk && !dataChunk) {
    errors.push(namedDataChunk
      ? 'data loader chunk exists but is not marked as a dynamic entry'
      : 'data loader and generated validators were not split into a dedicated dynamic chunk');
  }
  if (totalGzipBytes > budget.budgets.total_javascript_gzip_max_bytes) {
    errors.push(`total JavaScript gzip ${totalGzipBytes} bytes exceeds ${budget.budgets.total_javascript_gzip_max_bytes}`);
  }
  return { errors, chunks, totalGzipBytes, dataChunk, budget };
}

if (require.main === module) {
  const result = measureBundle();
  console.log(`Bundle baseline ${result.budget.baseline.commit}: ${result.budget.baseline.largest_chunk_bytes} bytes / ${result.budget.baseline.largest_chunk_gzip_bytes} gzip in one chunk.`);
  result.chunks.forEach(chunk => {
    console.log(`- ${chunk.file}: ${chunk.bytes} bytes, ${chunk.gzipBytes} gzip${chunk.isEntry ? ' (entry)' : chunk.isDynamicEntry ? ' (dynamic)' : ''}`);
  });
  if (result.errors.length) {
    result.errors.forEach(error => console.error(`ERROR [BUNDLE_BUDGET] ${error}`));
    process.exit(1);
  }
  console.log(`Bundle budget passed; total JavaScript gzip ${result.totalGzipBytes} bytes.`);
}

module.exports = { measureBundle };
