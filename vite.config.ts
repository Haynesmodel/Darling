import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import instrumentLibrary from 'istanbul-lib-instrument';
import { minify } from 'terser';

const collectCoverage = process.env.COLLECT_COVERAGE === '1';
const { createInstrumenter } = instrumentLibrary;

function toPosix(value: string) {
  return value.split(path.sep).join('/');
}

function isCoverageSource(id: string) {
  const filename = id.split('?')[0];
  const relative = toPosix(path.relative(process.cwd(), filename));
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return false;
  if (relative.endsWith('.d.ts')) return false;
  if (relative.startsWith('src/data/generated/') || relative.startsWith('js/charting/vendor/')) return false;
  return /^src\/.*\.(?:ts|tsx)$/.test(relative) || /^js\/.*\.js$/.test(relative);
}

function createCoveragePlugin() {
  const instrumenter = createInstrumenter({
    coverageGlobalScopeFunc: false,
    coverageGlobalScope: 'globalThis',
    preserveComments: true,
    produceSourceMap: true,
    autoWrap: true,
    esModules: true,
    compact: false,
    parserPlugins: ['typescript', 'jsx'],
  });
  return {
    name: 'darling:istanbul',
    apply: 'serve' as const,
    enforce: 'pre' as const,
    transform(source: string, id: string, options?: { ssr?: boolean }) {
      if (options?.ssr || !isCoverageSource(id)) return null;
      const filename = id.split('?')[0];
      const code = instrumenter.instrumentSync(source, filename);
      return { code, map: instrumenter.lastSourceMap() };
    },
  };
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string) => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (/\.(?:cjs|js|mjs|ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(filename);
    });
  };
  [
    'js',
    'src',
  ].forEach(directory => visit(path.join(root, directory)));
  return files;
}

function createPropertyCompactionPlugin() {
  const root = process.cwd();
  const propertySources = new Map<string, Set<string>>();
  // These literal keys are selected through FEATURE_IDS, so Terser cannot see
  // their computed property access while processing an individual chunk.
  const publicProperties = new Set([
    'pulse', 'owner', 'transactions', 'history', 'current', 'rivalry', 'trophy', 'dynasty', 'draft', 'gauntlet',
    // DOM dataset and Window diagnostics are observable contracts, including
    // from accessibility tooling and the production browser suite.
    'accentTheme', 'activeFeature', 'bound', 'chartState', 'colorScheme',
    'colorSchemePreference', 'darlingAccessibility', 'darlingDataDiagnostics',
    'darlingDataLoader', 'darlingFeatureDiagnostics', 'darlingSearch', 'darlingTables',
    'darlingTheme', 'featureId', 'featureMessage', 'featureState', 'heroMode',
    'loadedAssets', 'manifestVersion', 'optionalAssetFailures',
    'player',
    // Dynasty score component keys are iterated into visible breakdown labels.
    'consistency', 'hardware', 'penalties', 'regularSeason', 'scoringDominance',
    'navigationGroup', 'ready', 'reducedMotion', 'seasonMode', 'sectionId',
    'seed', 'seedSource', 'value', 'windowKey',
    // Preact plugins and JSX runtime share these option-hook names.
    'debounceRendering', 'diffed', 'event', 'unmount', 'vnode',
  ]);
  const compactableProperty = (name: string) => /^[a-z][A-Za-z0-9]{2,}$/.test(name);
  const analyzedFiles = new Set<string>();
  const analyzeProperties = (filename: string, source: string) => {
    if (analyzedFiles.has(filename)) return;
    analyzedFiles.add(filename);
    const sourceFile = parse(source, {
      sourceType: 'module',
      plugins: [
        ...(filename.endsWith('.ts') || filename.endsWith('.tsx') ? ['typescript' as const] : []),
        ...(filename.endsWith('.tsx') ? ['jsx' as const] : []),
      ],
    });
    const dynamicDictionaries = new Set<string>();
    const dictionaryKeys = new Map<string, string[]>();
    const objectKeys = (value: unknown) => {
      if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'ObjectExpression'
        || !('properties' in value) || !Array.isArray(value.properties)) return [];
      return value.properties.flatMap(item => {
        const key = (item as Record<string, unknown>).key;
        return key && typeof key === 'object' && 'type' in key && key.type === 'Identifier'
          && 'name' in key && typeof key.name === 'string' ? [key.name] : [];
      });
    };
    const remember = (name: unknown) => {
      if (!name || typeof name !== 'object' || !('type' in name) || name.type !== 'Identifier'
        || !('name' in name) || typeof name.name !== 'string') return;
      const tableApi = filename.includes('/node_modules/@tanstack/table-core/')
        ? name.name.match(/^(?:cell|column|header|row|table)_(.+)$/)
        : null;
      if (tableApi) {
        publicProperties.add(name.name);
        publicProperties.add(tableApi[1]);
      }
      if (!compactableProperty(name.name)) return;
      const sources = propertySources.get(name.name) || new Set<string>();
      sources.add(filename);
      propertySources.set(name.name, sources);
    };
    const rememberPublic = (name: unknown) => {
      if (name && typeof name === 'object' && 'type' in name
        && (name.type === 'Identifier' || name.type === 'JSXIdentifier')
        && 'name' in name && typeof name.name === 'string') publicProperties.add(name.name);
    };
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (record.type === 'MemberExpression' || record.type === 'OptionalMemberExpression') {
        remember(record.property);
        if (record.computed) {
          const object = record.object as Record<string, unknown> | undefined;
          if (object?.type === 'Identifier' && typeof object.name === 'string') dynamicDictionaries.add(object.name);
          objectKeys(object).forEach(key => publicProperties.add(key));
        }
      }
      else if (record.type === 'ObjectProperty' || record.type === 'ObjectMethod'
        || record.type === 'ClassProperty' || record.type === 'ClassMethod'
        || record.type === 'TSPropertySignature' || record.type === 'TSMethodSignature') remember(record.key);
      else if (record.type === 'JSXAttribute') {
        remember(record.name);
        rememberPublic(record.name);
      }
      if (record.type === 'ExportNamedDeclaration') {
        const declaration = record.declaration as Record<string, unknown> | undefined;
        if (declaration?.type === 'VariableDeclaration' && Array.isArray(declaration.declarations)) {
          declaration.declarations.forEach(item => rememberPublic((item as Record<string, unknown>).id));
        } else {
          rememberPublic(declaration?.id);
        }
        if (Array.isArray(record.specifiers)) {
          record.specifiers.forEach(item => rememberPublic((item as Record<string, unknown>).exported));
        }
      }
      if (record.type === 'VariableDeclarator') {
        const id = record.id as Record<string, unknown> | undefined;
        if (id?.type === 'Identifier' && typeof id.name === 'string') {
          dictionaryKeys.set(id.name, objectKeys(record.init));
        }
      }
      Object.values(record).forEach(value => {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      });
    };
    visit(sourceFile);
    dynamicDictionaries.forEach(name => dictionaryKeys.get(name)?.forEach(key => publicProperties.add(key)));
  };
  sourceFiles(root).forEach(filename => analyzeProperties(filename, fs.readFileSync(filename, 'utf8')));
  return {
    name: 'darling:compact-runtime-properties',
    apply: 'build' as const,
    enforce: 'post' as const,
    transform(code: string, id: string) {
      const filename = id.split('?')[0];
      if (/\/node_modules\/(?:preact|@tanstack)\//.test(filename)) analyzeProperties(filename, code);
      return null;
    },
    renderChunk: {
      order: 'post' as const,
      async handler(
        code: string,
        chunk: { isEntry?: boolean; name?: string; moduleIds?: string[] },
        outputOptions: { format?: string; sourcemap?: unknown },
      ) {
        // Preact's delegated event dispatcher is sensitive to unsafe
        // compression, but its generated property keys remain consistent
        // within the chunk and can still be compacted.
        const preactChunk = (chunk.moduleIds || []).some(id => id.includes('/node_modules/preact/'));
        const compactProperties = true;
        const chunkModules = new Set((chunk.moduleIds || []).map(id => id.split('?')[0]));
        const reservedProperties = compactProperties
          ? [...propertySources.entries()]
              .filter(([, sources]) => {
                const values = [...sources];
                const crossesLibraryBoundary = values.some(source => source.includes('/node_modules/'))
                  && values.some(source => !source.includes('/node_modules/'));
                return crossesLibraryBoundary
                  || values.some(source => !chunkModules.has(source));
              })
              .map(([identifier]) => identifier)
              .concat([...publicProperties])
          : [];
        const shortIdentifiers = [...new Set(
          (code.match(/\b[$A-Z_a-z][$\w]*\b/g) || []).filter(name => name.length <= 3),
        )];
        const result = await minify(code, {
          compress: chunk.isEntry || preactChunk ? false : {
            // Plot writes boolean ARIA values through setAttribute. Preserve
            // "true"/"false" in its shared chunk instead of emitting invalid
            // aria-hidden="1" values.
            booleans_as_integers: chunk.name !== 'chart-runtime',
            ecma: 2022,
            hoist_funs: true,
            hoist_props: true,
            keep_fargs: false,
            module: true,
            passes: 8,
            pure_getters: 'strict',
            toplevel: true,
            unsafe: true,
            unsafe_arrows: true,
            unsafe_comps: true,
            unsafe_methods: true,
          },
          mangle: {
            reserved: shortIdentifiers,
            properties: compactProperties ? {
              builtins: false,
              keep_quoted: true,
              regex: /^[a-z][A-Za-z0-9]{2,}$/,
              reserved: reservedProperties,
            } : false,
          },
          module: outputOptions.format?.startsWith('es') ?? true,
          sourceMap: Boolean(outputOptions.sourcemap),
        });
        return result.code ? { code: result.code, map: result.map || null } : null;
      },
    },
  };
}

export default defineConfig({
  plugins: [
    ...(collectCoverage ? [createCoveragePlugin()] : []),
    preact(),
    createPropertyCompactionPlugin(),
  ],
  base: process.env.VITE_BASE_PATH || '/',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    minify: 'terser',
    terserOptions: {
      compress: {
        booleans_as_integers: false,
        ecma: 2022,
        passes: 8,
        pure_getters: true,
      },
      mangle: { toplevel: true },
    },
    // Keep external maps for diagnostics without adding one unique map URL to
    // every transport chunk; those comments count against the aggregate budget.
    sourcemap: 'hidden',
    manifest: true,
    rolldownOptions: {
      output: {
        // Runtime and tests resolve chunks through the manifest, so transport
        // filenames can stay compact without sacrificing feature diagnostics.
        chunkFileNames: 'assets/[hash:6].js',
        assetFileNames: 'assets/[hash:6][extname]',
        // These neutral helpers are shared by several lazy features. Keeping them
        // together avoids tiny duplicate transport wrappers without pulling a
        // feature implementation into the shell.
        codeSplitting: {
          groups: [
            {
              name: 'table-runtime',
              test: /src\/(?:tables\/(?:table-runtime|table-saved-views|table-filter-functions|table-quick-filters)|components\/tables\/[^/]+)\.(?:js|ts|tsx)$/,
              priority: 2,
              minSize: 0,
            },
            {
              name: 'shared-display-formatters',
              test: /src\/data\/dynasty-formatters\.ts$/,
              priority: 5,
              minSize: 0,
            },
            {
              name: 'chart-runtime',
              test: /charting-vendor\.js$|src\/charting\/(?:chart-data|chart-runtime|chart-theme|chart-vendor|plot-charts|plot-specs)\.ts$/,
              priority: 2,
              minSize: 0,
            },
            {
              name: 'shared-shell-runtime',
              test: /(?:core-helpers|facet-helpers|head-to-head-context|season-mode)\.(?:js|ts)$|(?:section-disclosure|table-registry)\.ts$/,
              minSize: 0,
            },
            {
              name: 'season-runtime',
              test: /(?:current-season-command-data|current-season-data|season-recap|season-presentation)\.(?:js|ts)$/,
              minSize: 0,
            },
          ],
        },
      },
    },
  },
});
