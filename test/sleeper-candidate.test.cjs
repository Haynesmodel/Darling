const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, preserveOperationalTimestamp, promoteGeneratedOutputs, sourceDigest, ALLOWLIST, main, assertSafePaths } = require('../scripts/build_sleeper_candidate.cjs');

test('candidate CLI requires an explicit isolated root and mode', () => {
  const valid = parseArgs([
    '--source-root', '/repo', '--candidate-root', '/tmp/candidate', '--season', '2026',
    '--mode', 'validate-only', '--python', '/usr/bin/python3',
    '--completion-report', '/tmp/completion.json',
  ]);
  assert.equal(valid.mode, 'validate-only');
  assert.throws(() => parseArgs(valid ? [
    '--source-root', '/repo', '--candidate-root', '/tmp/candidate', '--season', '2026',
    '--mode', 'other', '--python', '/usr/bin/python3',
    '--completion-report', '/tmp/completion.json',
  ] : []), /Invalid mode/);
  assert.throws(() => parseArgs([
    '--source-root', '/repo', '--candidate-root', '/tmp/candidate', '--season', '2026',
    '--mode', 'full', '--python', '/usr/bin/python3',
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

test('builder accepts only step-scoped league credentials, never a CLI league argument', () => {
  assert.throws(() => parseArgs([
    '--source-root', '/repo', '--candidate-root', '/tmp/candidate', '--season', '2026',
    '--mode', 'full', '--python', '/usr/bin/python3', '--league-id', 'secret',
    '--completion-report', '/tmp/completion.json',
  ]), /Invalid or duplicate argument/);
});

test('builder runs the same isolated fixture preparation for validate-only and full modes', () => {
  const source = path.resolve(__dirname, '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-candidate-e2e-'));
  const fixture = path.join(root, 'fixture');
  const report = path.join(root, 'completion.json');
  const previousLeague = process.env.LEAGUE_ID;
  process.env.LEAGUE_ID = '1257071385973362690';
  try {
    fs.mkdirSync(path.join(fixture, 'assets'), { recursive: true });
    for (const name of ['H2H', 'CurrentSeason', 'TransactionHistory']) {
      fs.copyFileSync(path.join(source, 'assets', `${name}.json`), path.join(fixture, 'assets', `${name}.json`));
    }
    fs.writeFileSync(path.join(fixture, 'completion-report.json'), JSON.stringify({
      season: 2025, max_week: 17, completed: 17, active: null,
      basis: 'nfl_state_and_calendar_guard', warnings: [],
      clock: '2025-09-16T13:00:00Z', override_reason: null,
    }));
    const outputs = {};
    for (const mode of ['validate-only', 'full']) {
      const candidate = path.join(root, mode);
      const status = path.join(root, `${mode}-status.json`);
      main(['--source-root', source, '--candidate-root', candidate, '--season', '2025', '--mode', mode,
        '--python', process.env.PYTHON || '/opt/homebrew/bin/python3.13', '--fixture-root', fixture,
        '--completion-report', path.join(root, `${mode}-completion.json`), '--status-report', status]);
      outputs[mode] = {
        assets: ALLOWLIST.filter(file => fs.existsSync(path.join(candidate, file))).map(file => fs.readFileSync(path.join(candidate, file))),
        summary: fs.readFileSync(path.join(candidate, 'candidate-summary.json')),
        metadata: JSON.parse(fs.readFileSync(path.join(candidate, 'candidate-metadata.json'))),
      };
    }
    for (const file of ALLOWLIST) assert.deepEqual(outputs['validate-only'].assets[ALLOWLIST.indexOf(file)], outputs.full.assets[ALLOWLIST.indexOf(file)]);
    assert.deepEqual(outputs['validate-only'].metadata.summary, outputs.full.metadata.summary);
    assert.deepEqual(JSON.parse(outputs['validate-only'].summary), JSON.parse(outputs.full.summary));
  } finally {
    if (previousLeague === undefined) delete process.env.LEAGUE_ID; else process.env.LEAGUE_ID = previousLeague;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('post-extraction failures leave every tracked source byte unchanged', () => {
  const source = path.resolve(__dirname, '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-candidate-failure-'));
  const fixture = path.join(root, 'fixture');
  const report = path.join(root, 'completion.json');
  const before = sourceDigest(source, require('node:child_process').execFileSync('git', ['-C', source, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
  const previousLeague = process.env.LEAGUE_ID;
  process.env.LEAGUE_ID = '1257071385973362690';
  try {
    fs.mkdirSync(path.join(fixture, 'assets'), { recursive: true });
    for (const name of ['H2H', 'CurrentSeason', 'TransactionHistory']) fs.copyFileSync(path.join(source, 'assets', `${name}.json`), path.join(fixture, 'assets', `${name}.json`));
    fs.writeFileSync(path.join(fixture, 'completion-report.json'), JSON.stringify({ season: 2025, max_week: 17, completed: 17, active: null, basis: 'nfl_state_and_calendar_guard', warnings: [], clock: '2025-09-16T13:00:00Z', override_reason: null }));
    for (const phase of ['derived', 'summary', 'allowlist']) {
      process.env.DARLING_CANDIDATE_FAIL_PHASE = phase;
      assert.throws(() => main(['--source-root', source, '--candidate-root', path.join(root, phase), '--season', '2025', '--mode', 'validate-only', '--python', '/opt/homebrew/bin/python3.13', '--fixture-root', fixture, '--completion-report', path.join(root, `${phase}.json`)]), new RegExp(`Injected failure at ${phase}`));
      const after = sourceDigest(source, require('node:child_process').execFileSync('git', ['-C', source, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
      assert.equal(after, before);
    }
  } finally {
    delete process.env.DARLING_CANDIDATE_FAIL_PHASE;
    if (previousLeague === undefined) delete process.env.LEAGUE_ID; else process.env.LEAGUE_ID = previousLeague;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('candidate, report, and status paths cannot contain or replace the source root', () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-candidate-source-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-candidate-outside-'));
  try {
    assert.throws(() => assertSafePaths(source, path.dirname(source), path.join(outside, 'report.json')), /disjoint/);
    assert.throws(() => assertSafePaths(source, path.join(source, 'candidate'), path.join(outside, 'report.json')), /disjoint/);
    assert.throws(() => assertSafePaths(source, path.join(outside, 'candidate'), path.join(source, 'report.json')), /Completion report/);
  } finally {
    fs.rmSync(source, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true });
  }
});
