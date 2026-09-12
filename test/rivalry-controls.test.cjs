const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let directory;
let RivalryControls;

test.before(async () => {
  const bundles = path.join(process.cwd(), 'coverage', 'test-bundles');
  fs.mkdirSync(bundles, { recursive: true });
  directory = fs.mkdtempSync(path.join(bundles, 'rivalry-controls-'));
  const outfile = path.join(directory, 'rivalry-controls.mjs');
  await esbuild.build({
    entryPoints: [path.join(process.cwd(), 'src/features/rivalry/RivalryControls.tsx')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    sourcemap: 'inline',
    sourcesContent: true,
    logLevel: 'silent',
  });
  ({ RivalryControls } = await import(`${pathToFileURL(outfile).href}?${Date.now()}`));
});

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

function visit(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(visit);
  if (typeof node !== 'object') return [];
  if (typeof node.type === 'function') return visit(node.type(node.props));
  return [node, ...visit(node.props?.children)];
}

function render(teams, state, changes) {
  return visit(RivalryControls({ teams, state, onChange: next => changes.push(next) }))
    .filter(node => node.type === 'select');
}

test('Rivalry controls keep teams distinct and preserve valid selections', () => {
  const changes = [];
  const state = { teamA: 'A', teamB: 'B', scope: 'allTime' };
  const [teamA, teamB, scope] = render(['A', 'B', 'C'], state, changes);
  teamA.props.onChange({ currentTarget: { value: 'B' } });
  teamA.props.onChange({ currentTarget: { value: 'C' } });
  teamB.props.onChange({ currentTarget: { value: 'A' } });
  teamB.props.onChange({ currentTarget: { value: 'C' } });
  scope.props.onChange({ currentTarget: { value: 'historic' } });
  assert.deepEqual(changes, [
    { ...state, teamA: 'B', teamB: 'A' },
    { ...state, teamA: 'C' },
    { ...state, teamA: 'B', teamB: 'A' },
    { ...state, teamB: 'C' },
    { ...state, scope: 'historic' },
  ]);
});

test('Rivalry controls have a deterministic fallback for a one-team data set', () => {
  const changes = [];
  const state = { teamA: 'Solo', teamB: 'Solo', scope: 'allTime' };
  const [teamA, teamB] = render(['Solo'], state, changes);
  teamA.props.onChange({ currentTarget: { value: 'Solo' } });
  teamB.props.onChange({ currentTarget: { value: 'Solo' } });
  assert.deepEqual(changes, [state, state]);
});
