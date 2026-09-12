const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, preserveOperationalTimestamp, promoteGeneratedOutputs, sourceDigest, ALLOWLIST } = require('../scripts/build_sleeper_candidate.cjs');

test('candidate CLI requires an explicit isolated root and mode', () => {
  const valid = parseArgs([
    '--source-root', '/repo', '--candidate-root', '/tmp/candidate', '--season', '2026',
    '--mode', 'validate-only', '--python', '/usr/bin/python3', '--league-id', 'league',
    '--completion-report', '/tmp/completion.json',
  ]);
  assert.equal(valid.mode, 'validate-only');
  assert.throws(() => parseArgs(valid ? [
    '--source-root', '/repo', '--candidate-root', '/tmp/candidate', '--season', '2026',
    '--mode', 'other', '--python', '/usr/bin/python3', '--league-id', 'league',
    '--completion-report', '/tmp/completion.json',
  ] : []), /Invalid mode/);
  assert.throws(() => parseArgs([
    '--source-root', '/repo', '--candidate-root', '/tmp/candidate', '--season', '2026',
    '--mode', 'full', '--python', '/usr/bin/python3', '--league-id', 'league',
  ]), /Missing --completion-report/);
});

test('source digest is stable for the tracked candidate input set', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-candidate-digest-'));
  try {
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets/H2H.json'), '[]\n');
    const files = ['assets/H2H.json'];
    const before = sourceDigest(root, files);
    assert.equal(before, sourceDigest(root, files));
    assert.ok(ALLOWLIST.includes('assets/H2H.json'));
    fs.writeFileSync(path.join(root, 'assets/H2H.json'), '[1]\n');
    assert.notEqual(before, sourceDigest(root, files));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unchanged candidate payload retains the published operational timestamp', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-candidate-clock-'));
  const candidate = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-candidate-output-'));
  try {
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(candidate, 'assets'), { recursive: true });
    const before = { season: 2026, generated_at: '2026-09-12T00:00:00Z', games: [] };
    const after = { season: 2026, generated_at: '2026-09-12T01:00:00Z', games: [] };
    fs.writeFileSync(path.join(root, 'assets/CurrentSeason.json'), `${JSON.stringify(before)}\n`);
    fs.writeFileSync(path.join(candidate, 'assets/CurrentSeason.json'), `${JSON.stringify(after)}\n`);
    preserveOperationalTimestamp(candidate, root, 'CurrentSeason.json', 'generated_at');
    assert.equal(JSON.parse(fs.readFileSync(path.join(candidate, 'assets/CurrentSeason.json'))).generated_at, before.generated_at);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(candidate, { recursive: true, force: true });
  }
});

test('generated temporary outputs are promoted only inside the candidate root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-candidate-promote-'));
  try {
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    for (const name of ['H2H', 'CurrentSeason', 'TransactionHistory']) {
      fs.writeFileSync(path.join(root, 'assets', `${name}.updated.json`), `${name}\n`);
    }
    promoteGeneratedOutputs(root);
    for (const name of ['H2H', 'CurrentSeason', 'TransactionHistory']) {
      assert.equal(fs.readFileSync(path.join(root, 'assets', `${name}.json`), 'utf8'), `${name}\n`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('legacy sequential floating-point accumulation remains detectable', () => {
  const values = [1e16, 1, -1e16];
  const sequential = values.reduce((total, value) => total + value, 0);
  assert.notEqual(sequential, 1);
});
