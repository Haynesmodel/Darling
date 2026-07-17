import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: process.env.VITE_BASE_PATH || '/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    manifest: true,
    rolldownOptions: {
      output: {
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
