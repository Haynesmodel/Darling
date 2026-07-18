import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: process.env.VITE_BASE_PATH || '/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    // Keep external maps for diagnostics without adding one unique map URL to
    // every transport chunk; those comments count against the aggregate budget.
    sourcemap: 'hidden',
    manifest: true,
    rolldownOptions: {
      output: {
        // Runtime and tests resolve chunks through the manifest, so transport
        // filenames can stay compact without sacrificing feature diagnostics.
        chunkFileNames: 'assets/[hash:6].js',
        // These neutral helpers are shared by several lazy features. Keeping them
        // together avoids tiny duplicate transport wrappers without pulling a
        // feature implementation into the shell.
        codeSplitting: {
          groups: [
            {
              name: 'chart-runtime',
              test: /(?:charting-vendor|plot-charts)\.js$/,
              priority: 2,
              minSize: 0,
            },
            {
              name: 'shared-feature-core',
              test: /(?:core-helpers|facet-helpers|head-to-head-context|season-mode)\.(?:js|ts)$/,
              minSize: 0,
            },
          ],
        },
      },
    },
  },
});
