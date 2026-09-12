const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkSource, checkStrictIslands, normalize } = require('../scripts/check_strict_islands.cjs');

const config = { direct_plot_vendor_import_exceptions: ['src/charting/chart-vendor.ts'] };

test('strict-island source policy rejects unsafe syntax and imports', () => {
  const source = `
    // @ts-ignore
    import { plot } from '../../js/charting/vendor/charting-vendor.js';
    import { old } from '../../../js/rivalry-renderers.js';
    const value: any = old;
    type HiddenAny = ReturnType<typeof JSON.parse>;
    target.innerHTML = String(value);
    target.insertAdjacentHTML('beforeend', '<b>bad</b>');
    export const view = <div dangerouslySetInnerHTML={{ __html: 'bad' }} />;
  `;
  const failures = checkSource('src/features/rivalry/Bad.tsx', source, config).join('\n');
  assert.match(failures, /@ts-ignore/);
  assert.match(failures, /explicit any/);
  assert.match(failures, /implicit any type from JSON\.parse/);
  assert.match(failures, /innerHTML/);
  assert.match(failures, /insertAdjacentHTML/);
  assert.match(failures, /dangerouslySetInnerHTML/);
  assert.match(failures, /legacy renderer/);
  assert.match(failures, /Plot vendor directly/);
});

test('strict-island policy permits the documented type-only vendor facade', () => {
  const source = `
    import type * as Plot from '@observablehq/plot';
    import * as generated from '../../js/charting/vendor/charting-vendor.js';
    export const plot = generated.plot as unknown as typeof Plot.plot;
  `;
  assert.deepEqual(checkSource('src/charting/chart-vendor.ts', source, config), []);
  assert.equal(normalize('src\\charting\\chart-vendor.ts'), 'src/charting/chart-vendor.ts');
});

test('strict-island repository checker enforces parsed TypeScript project membership for ts and tsx', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-strict-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts', 'data'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src', 'island'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'island', 'safe.ts'), 'export const safe: string = "yes";\n');
    fs.writeFileSync(path.join(root, 'src', 'island', 'view.tsx'), 'export const view = <div>safe</div>;\n');
    fs.writeFileSync(path.join(root, 'scripts', 'data', 'strict-islands.json'), JSON.stringify({
      paths: ['src/island'],
      direct_plot_vendor_import_exceptions: [],
    }));
    fs.writeFileSync(path.join(root, 'tsconfig.strict.json'), JSON.stringify({
      compilerOptions: { jsx: 'preserve' },
      include: ['src/island/**/*.tsx'],
    }));
    assert.deepEqual(checkStrictIslands(root), [
      'src/island/safe.ts is missing from the tsconfig.strict.json project',
    ]);
    fs.writeFileSync(path.join(root, 'tsconfig.strict.json'), JSON.stringify({
      compilerOptions: { jsx: 'preserve' },
      include: ['src/island/**/*.ts', 'src/island/**/*.tsx'],
    }));
    assert.deepEqual(checkStrictIslands(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
