#!/usr/bin/env node

// Prepare a Sleeper update in a disposable checkout.  The workflow copies the
// allowlisted files out only after this command and its checks succeed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const ALLOWLIST = [
  'assets/H2H.json',
  'assets/CurrentSeason.json',
  'assets/TransactionHistory.json',
  'assets/SeasonSummary.draft.json',
  'assets/DerivedStats.json',
  'assets/asset-manifest.json',
];

function parseArgs(argv) {
  const out = {};
  const allowed = new Set([
    'source-root', 'candidate-root', 'season', 'mode', 'python', 'league-id',
    'completion-report', 'frozen-clock',
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--') || i + 1 >= argv.length) throw new Error(`Invalid argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key) || out[key] !== undefined) throw new Error(`Invalid or duplicate argument: ${token}`);
    out[key] = argv[++i];
  }
  for (const key of ['source-root', 'candidate-root', 'season', 'mode', 'python', 'league-id', 'completion-report']) {
    if (!out[key]) throw new Error(`Missing --${key}`);
  }
  if (!['validate-only', 'full'].includes(out.mode)) throw new Error(`Invalid mode: ${out.mode}`);
  if (!/^\d{4}$/.test(out.season)) throw new Error(`Invalid season: ${out.season}`);
  return out;
}

function trackedFiles(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
}

function sourceDigest(root, files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(root, file)));
  }
  return hash.digest('hex');
}

function copyTrackedSource(sourceRoot, candidateRoot, files) {
  for (const file of files) {
    const from = path.join(sourceRoot, file);
    const to = path.join(candidateRoot, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlinked tracked source: ${file}`);
    fs.copyFileSync(from, to);
  }
  const dependencies = path.join(sourceRoot, 'node_modules');
  if (fs.existsSync(dependencies)) fs.symlinkSync(dependencies, path.join(candidateRoot, 'node_modules'), 'dir');
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
  return result.stdout;
}

function promoteGeneratedOutputs(candidateRoot) {
  for (const name of ['H2H', 'CurrentSeason', 'TransactionHistory']) {
    const updated = path.join(candidateRoot, 'assets', `${name}.updated.json`);
    const output = path.join(candidateRoot, 'assets', `${name}.json`);
    if (!fs.existsSync(updated)) throw new Error(`Candidate generator did not produce ${name}.updated.json`);
    fs.copyFileSync(updated, output);
  }
}

function prepareDerived(candidateRoot, sourceRoot, python, season) {
  const h2hBefore = path.join(sourceRoot, 'assets/H2H.json');
  const h2hAfter = path.join(candidateRoot, 'assets/H2H.json');
  const h2hChanged = !fs.readFileSync(h2hBefore).equals(fs.readFileSync(h2hAfter));
  if (h2hChanged) {
    run(python, [path.join(candidateRoot, 'scripts/generate_season_summary_draft.py'), '--h2h', h2hAfter,
      '--existing', path.join(candidateRoot, 'assets/SeasonSummary.json'),
      '--out', path.join(candidateRoot, 'assets/SeasonSummary.draft.json'), '--season', season], { cwd: candidateRoot });
    run('node', ['scripts/generate_derived_stats.cjs', '--output-root', candidateRoot], { cwd: candidateRoot });
  }
  if (!h2hChanged && fs.existsSync(path.join(sourceRoot, 'assets/SeasonSummary.draft.json'))) {
    fs.copyFileSync(path.join(sourceRoot, 'assets/SeasonSummary.draft.json'), path.join(candidateRoot, 'assets/SeasonSummary.draft.json'));
  }
  preserveOperationalTimestamp(candidateRoot, sourceRoot, 'CurrentSeason.json', 'generated_at');
  const sourceChanged = ALLOWLIST.slice(0, 3).some(file => {
    const source = path.join(sourceRoot, file); const candidate = path.join(candidateRoot, file);
    return fs.existsSync(candidate) && (!fs.existsSync(source) || !fs.readFileSync(source).equals(fs.readFileSync(candidate)));
  });
  if (sourceChanged || h2hChanged || !fs.existsSync(path.join(candidateRoot, 'assets/asset-manifest.json'))) {
    run('node', ['scripts/generate_asset_manifest.cjs', '--output-root', candidateRoot], { cwd: candidateRoot });
  }
  run('node', ['scripts/check_generated_assets.cjs'], { cwd: candidateRoot, env: { ...process.env, PYTHON: python } });
  run('node', ['scripts/validate_assets.cjs', path.join(candidateRoot, 'assets/H2H.json'),
    path.join(candidateRoot, 'assets/SeasonSummary.json'), path.join(candidateRoot, 'assets/Rivalries.json'),
    path.join(candidateRoot, 'assets/CurrentSeason.json'), path.join(candidateRoot, 'assets/TransactionHistory.json')], { cwd: candidateRoot });
  return h2hChanged;
}

function preserveOperationalTimestamp(candidateRoot, sourceRoot, filename, field) {
  const beforePath = path.join(sourceRoot, 'assets', filename);
  const afterPath = path.join(candidateRoot, 'assets', filename);
  if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) return;
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
  const beforeStable = { ...before }; const afterStable = { ...after };
  delete beforeStable[field]; delete afterStable[field];
  if (JSON.stringify(beforeStable) === JSON.stringify(afterStable)) {
    after[field] = before[field];
    fs.writeFileSync(afterPath, `${JSON.stringify(after, null, 2)}\n`);
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const sourceRoot = path.resolve(args['source-root']);
  const candidateRoot = path.resolve(args['candidate-root']);
  if (candidateRoot === sourceRoot || candidateRoot.startsWith(`${sourceRoot}${path.sep}`)) throw new Error('Candidate root must be outside source root.');
  const marker = path.join(candidateRoot, '.darling-candidate-root');
  if (fs.existsSync(candidateRoot)) {
    if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== 'runner-owned\n') {
      throw new Error('Refusing to replace a candidate root without the runner-owned marker.');
    }
    fs.rmSync(candidateRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(candidateRoot, { recursive: true });
  fs.writeFileSync(path.join(candidateRoot, '.darling-candidate-root'), 'runner-owned\n', { mode: 0o600 });
  const files = trackedFiles(sourceRoot);
  const immutableFiles = files.filter(file => !ALLOWLIST.includes(file));
  const beforeDigest = sourceDigest(sourceRoot, immutableFiles);
  copyTrackedSource(sourceRoot, candidateRoot, files);
  const stagedDigest = sourceDigest(candidateRoot, files);
  if (sourceDigest(sourceRoot, files) !== stagedDigest) throw new Error('Source changed while staging candidate.');
  const python = path.resolve(args.python);
  const env = {
    ...process.env,
    PYTHON: python,
    LEAGUE_ID: args['league-id'],
    SEASON: args.season,
    UPDATE_LIVE: '1',
    VALIDATE_ONLY: '0',
    ASSETS_DIR_OVERRIDE: path.join(candidateRoot, 'assets'),
    COMPLETION_REPORT_PATH: path.resolve(args['completion-report']),
    ...(args['frozen-clock'] ? { CUTOFF_DATE: args['frozen-clock'] } : {}),
  };
  run(path.join(sourceRoot, 'scripts/update_sleeper_h2h.sh'), [], { cwd: sourceRoot, env });
  promoteGeneratedOutputs(candidateRoot);
  const h2hChanged = prepareDerived(candidateRoot, sourceRoot, python, Number(args.season));
  const afterDigest = sourceDigest(candidateRoot, immutableFiles);
  if (beforeDigest !== afterDigest) throw new Error('Candidate preparation changed a non-allowlisted tracked source.');
  fs.writeFileSync(path.join(candidateRoot, 'candidate-metadata.json'), `${JSON.stringify({
    mode: args.mode,
    season: Number(args.season),
    python: run(python, ['--version'], { cwd: candidateRoot }).trim(),
    source_digest: beforeDigest,
    changed_paths: ALLOWLIST.filter(file => {
      const source = path.join(sourceRoot, file); const candidate = path.join(candidateRoot, file);
      return fs.existsSync(candidate) && (!fs.existsSync(source) || !fs.readFileSync(source).equals(fs.readFileSync(candidate)));
    }),
    h2h_changed: h2hChanged,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ candidate_root: candidateRoot, mode: args.mode, source_digest: beforeDigest, h2h_changed: h2hChanged }));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message || error); process.exit(1); }
}

module.exports = { ALLOWLIST, main, parseArgs, preserveOperationalTimestamp, promoteGeneratedOutputs, sourceDigest };
