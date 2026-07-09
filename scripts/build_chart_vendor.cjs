const path = require('node:path');
const esbuild = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outfile = path.join(repoRoot, 'js/charting/vendor/charting-vendor.js');

esbuild.build({
  stdin: {
    contents: [
      "export * as Plot from '@observablehq/plot';",
    ].join('\n'),
    resolveDir: repoRoot,
    sourcefile: 'charting-vendor-entry.js',
    loader: 'js',
  },
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'linked',
  logLevel: 'info',
}).catch(error => {
  console.error(error);
  process.exit(1);
});
