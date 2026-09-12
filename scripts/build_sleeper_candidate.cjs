#!/usr/bin/env node

// Prepare and validate a Sleeper update without mutating the checkout.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const ALLOWLIST = [
  'assets/H2H.json', 'assets/CurrentSeason.json', 'assets/TransactionHistory.json',
  'assets/SeasonSummary.draft.json', 'assets/DerivedStats.json', 'assets/asset-manifest.json',
];

function parseArgs(argv) {
  const args = {};
  const allowed = new Set(['source-root', 'candidate-root', 'season', 'mode', 'python',
    'completion-report', 'frozen-clock', 'fixture-root', 'status-report']);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--') || i + 1 >= argv.length) throw new Error(`Invalid argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key) || args[key] !== undefined) throw new Error(`Invalid or duplicate argument: ${token}`);
    args[key] = argv[++i];
  }
  for (const key of ['source-root', 'candidate-root', 'season', 'mode', 'python', 'completion-report']) {
    if (!args[key]) throw new Error(`Missing --${key}`);
  }
  if (!['validate-only', 'full'].includes(args.mode)) throw new Error(`Invalid mode: ${args.mode}`);
  if (!/^\d{4}$/.test(args.season)) throw new Error(`Invalid season: ${args.season}`);
  return args;
}

function trackedFiles(root) { return execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean); }
function sourceDigest(root, files) { const hash = crypto.createHash('sha256'); for (const file of files) { hash.update(file); hash.update(fs.readFileSync(path.join(root, file))); } return hash.digest('hex'); }
function isWithin(child, parent) { return child === parent || child.startsWith(`${parent}${path.sep}`); }
function realParent(value) { let cursor = path.resolve(value); while (!fs.existsSync(cursor)) cursor = path.dirname(cursor); return fs.realpathSync.native(cursor); }

function assertSafePaths(sourceRoot, candidateRoot, reportPath, statusPath = null) {
  if (!fs.existsSync(sourceRoot) || fs.lstatSync(sourceRoot).isSymbolicLink()) throw new Error('Source root must be a real directory.');
  const source = fs.realpathSync.native(sourceRoot); const candidate = path.resolve(candidateRoot);
  const candidateReal = fs.existsSync(candidate) ? fs.realpathSync.native(candidate) : path.join(realParent(candidate), path.basename(candidate));
  if (isWithin(source, candidateReal) || isWithin(candidateReal, source)) throw new Error('Source and candidate roots must be disjoint.');
  if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) throw new Error('Candidate root must not be a symlink.');
  const report = path.resolve(reportPath); const reportParent = realParent(report);
  if (isWithin(reportParent, source) || isWithin(reportParent, candidateReal)) throw new Error('Completion report must be outside source and candidate roots.');
  if (statusPath) { const statusParent = realParent(statusPath); if (isWithin(statusParent, source) || isWithin(statusParent, candidateReal)) throw new Error('Status report must be outside source and candidate roots.'); }
}

function copyTrackedSource(sourceRoot, candidateRoot, files) {
  for (const file of files) { const from = path.join(sourceRoot, file); const to = path.join(candidateRoot, file); if (fs.lstatSync(from).isSymbolicLink()) throw new Error(`Refusing symlinked tracked source: ${file}`); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
  const dependencies = path.join(sourceRoot, 'node_modules'); if (fs.existsSync(dependencies)) fs.symlinkSync(dependencies, path.join(candidateRoot, 'node_modules'), 'dir');
  const generated = path.join(sourceRoot, 'src/data/generated');
  if (fs.existsSync(generated)) fs.cpSync(generated, path.join(candidateRoot, 'src/data/generated'), { recursive: true });
}
function run(command, args, options) { const result = spawnSync(command, args, { ...options, encoding: 'utf8' }); if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`); return result.stdout; }
function promoteGeneratedOutputs(candidateRoot) { for (const name of ['H2H', 'CurrentSeason', 'TransactionHistory']) { const updated = path.join(candidateRoot, 'assets', `${name}.updated.json`); if (!fs.existsSync(updated)) throw new Error(`Candidate generator did not produce ${name}.updated.json`); fs.copyFileSync(updated, path.join(candidateRoot, 'assets', `${name}.json`)); } }
function copyFixtureOutputs(fixtureRoot, candidateRoot, reportPath) {
  const fixtureAssets = path.join(fixtureRoot, 'assets');
  for (const name of ['H2H', 'CurrentSeason', 'TransactionHistory']) { const source = path.join(fixtureAssets, `${name}.updated.json`); const fallback = path.join(fixtureAssets, `${name}.json`); if (!fs.existsSync(source) && !fs.existsSync(fallback)) throw new Error(`Fixture is missing ${name}.json`); fs.copyFileSync(fs.existsSync(source) ? source : fallback, path.join(candidateRoot, 'assets', `${name}.updated.json`)); }
  for (const file of ['darling-completion-report.json', 'completion-report.json']) { const source = path.join(fixtureRoot, file); if (fs.existsSync(source)) fs.copyFileSync(source, reportPath); }
}
function preserveOperationalTimestamp(candidateRoot, sourceRoot, filename, field) { const beforePath = path.join(sourceRoot, 'assets', filename); const afterPath = path.join(candidateRoot, 'assets', filename); if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) return; const before = JSON.parse(fs.readFileSync(beforePath)); const after = JSON.parse(fs.readFileSync(afterPath)); const stable = value => { const copy = { ...value }; delete copy[field]; return JSON.stringify(copy); }; if (stable(before) === stable(after)) { after[field] = before[field]; fs.writeFileSync(afterPath, `${JSON.stringify(after, null, 2)}\n`); } }
function prepareDerived(candidateRoot, sourceRoot, python, season) {
  const h2hChanged = !fs.readFileSync(path.join(sourceRoot, 'assets/H2H.json')).equals(fs.readFileSync(path.join(candidateRoot, 'assets/H2H.json')));
  if (h2hChanged) { run(python, [path.join(candidateRoot, 'scripts/generate_season_summary_draft.py'), '--h2h', path.join(candidateRoot, 'assets/H2H.json'), '--existing', path.join(candidateRoot, 'assets/SeasonSummary.json'), '--out', path.join(candidateRoot, 'assets/SeasonSummary.draft.json'), '--season', season], { cwd: candidateRoot }); run('node', ['scripts/generate_derived_stats.cjs', '--output-root', candidateRoot], { cwd: candidateRoot }); } else if (fs.existsSync(path.join(sourceRoot, 'assets/SeasonSummary.draft.json'))) fs.copyFileSync(path.join(sourceRoot, 'assets/SeasonSummary.draft.json'), path.join(candidateRoot, 'assets/SeasonSummary.draft.json'));
  preserveOperationalTimestamp(candidateRoot, sourceRoot, 'CurrentSeason.json', 'generated_at');
  const changed = ALLOWLIST.slice(0, 3).some(file => !fs.readFileSync(path.join(sourceRoot, file)).equals(fs.readFileSync(path.join(candidateRoot, file))));
  if (changed || h2hChanged || !fs.existsSync(path.join(candidateRoot, 'assets/asset-manifest.json'))) run('node', ['scripts/generate_asset_manifest.cjs', '--output-root', candidateRoot], { cwd: candidateRoot });
  run('node', ['scripts/check_generated_assets.cjs'], { cwd: sourceRoot, env: { ...process.env, PYTHON: python } });
  run('node', ['scripts/validate_assets.cjs', path.join(candidateRoot, 'assets/H2H.json'), path.join(candidateRoot, 'assets/SeasonSummary.json'), path.join(candidateRoot, 'assets/Rivalries.json'), path.join(candidateRoot, 'assets/CurrentSeason.json'), path.join(candidateRoot, 'assets/TransactionHistory.json')], { cwd: candidateRoot });
  return h2hChanged;
}
function writeStatus(file, value) {
  if (process.env.GITHUB_ENV && value.phase) fs.appendFileSync(process.env.GITHUB_ENV, `FAILED_PHASE=${value.phase}\n`);
  if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv); const sourceRoot = path.resolve(args['source-root']); const candidateRoot = path.resolve(args['candidate-root']); const reportPath = path.resolve(args['completion-report']); assertSafePaths(sourceRoot, candidateRoot, reportPath, args['status-report'] ? path.resolve(args['status-report']) : null);
  if (!process.env.LEAGUE_ID) throw new Error('LEAGUE_ID must be provided through the step environment.');
  const files = trackedFiles(sourceRoot); const beforeDigest = sourceDigest(sourceRoot, files); const runtime = { node: process.version, npm: run('npm', ['--version'], { cwd: sourceRoot }).trim(), python: run(args.python, ['--version'], { cwd: sourceRoot }).trim() }; let phase = 'staging'; writeStatus(args['status-report'], { phase, season: Number(args.season), runtime });
  try {
    if (fs.existsSync(candidateRoot)) { const marker = path.join(candidateRoot, '.darling-candidate-root'); if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== 'runner-owned\n') throw new Error('Refusing to replace an unmarked candidate root.'); fs.rmSync(candidateRoot, { recursive: true, force: true }); }
    fs.mkdirSync(candidateRoot, { recursive: true }); fs.writeFileSync(path.join(candidateRoot, '.darling-candidate-root'), 'runner-owned\n'); copyTrackedSource(sourceRoot, candidateRoot, files);
    const baseline = path.join(candidateRoot, '.baseline'); fs.mkdirSync(baseline, { recursive: true }); for (const name of ['H2H', 'CurrentSeason', 'TransactionHistory', 'asset-manifest']) fs.copyFileSync(path.join(sourceRoot, `assets/${name}.json`), path.join(baseline, `${name}.json`));
    phase = 'extraction'; writeStatus(args['status-report'], { phase, season: Number(args.season), runtime });
    if (args['fixture-root']) copyFixtureOutputs(path.resolve(args['fixture-root']), candidateRoot, reportPath); else run(path.join(sourceRoot, 'scripts/update_sleeper_h2h.sh'), [], { cwd: sourceRoot, env: { ...process.env, PYTHON: path.resolve(args.python), SEASON: args.season, UPDATE_LIVE: '1', VALIDATE_ONLY: '0', ASSETS_DIR_OVERRIDE: path.join(candidateRoot, 'assets'), COMPLETION_REPORT_PATH: reportPath, ...(args['frozen-clock'] ? { CUTOFF_DATE: args['frozen-clock'] } : {}) } });
    promoteGeneratedOutputs(candidateRoot);
    phase = 'derived'; writeStatus(args['status-report'], { phase, season: Number(args.season), runtime }); if (process.env.DARLING_CANDIDATE_FAIL_PHASE === phase) throw new Error(`Injected failure at ${phase} phase`); const h2hChanged = prepareDerived(candidateRoot, sourceRoot, path.resolve(args.python), Number(args.season));
    phase = 'summary'; writeStatus(args['status-report'], { phase, season: Number(args.season), runtime }); if (process.env.DARLING_CANDIDATE_FAIL_PHASE === phase) throw new Error(`Injected failure at ${phase} phase`);
    const changed = ALLOWLIST.filter(file => { const before = path.join(sourceRoot, file); const after = path.join(candidateRoot, file); if (!fs.existsSync(before) || !fs.existsSync(after)) return fs.existsSync(before) !== fs.existsSync(after); return !fs.readFileSync(before).equals(fs.readFileSync(after)); }); const changedFile = path.join(candidateRoot, 'candidate-changed-files.txt'); fs.writeFileSync(changedFile, `${changed.join('\n')}${changed.length ? '\n' : ''}`); const baseSha = run('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { cwd: sourceRoot }).trim();
    run('node', [path.join(sourceRoot, 'scripts/summarize_sleeper_update.cjs'), '--before-dir', baseline, '--after-dir', path.join(candidateRoot, 'assets'), '--season', args.season, '--run-url', process.env.RUN_URL || 'https://github.com/Haynesmodel/Darling/actions/runs/0', '--base-sha', baseSha, '--candidate-sha', baseSha, '--changed-files-file', changedFile, '--body-out', path.join(candidateRoot, 'candidate-pr-body.md'), '--json-out', path.join(candidateRoot, 'candidate-summary.json'), '--completion-report', reportPath, '--allow-no-change', '1'], { cwd: sourceRoot, env: { ...process.env, LEAGUE_ID: process.env.LEAGUE_ID || '', NODE_RUNTIME: runtime.node, NPM_RUNTIME: runtime.npm, PYTHON_RUNTIME: runtime.python } });
    phase = 'allowlist'; writeStatus(args['status-report'], { phase, season: Number(args.season), runtime }); if (process.env.DARLING_CANDIDATE_FAIL_PHASE === phase) throw new Error(`Injected failure at ${phase} phase`); const afterDigest = sourceDigest(sourceRoot, files); if (beforeDigest !== afterDigest) throw new Error('Source checkout changed during candidate preparation.'); const unexpected = files.filter(file => !ALLOWLIST.includes(file) && (!fs.existsSync(path.join(candidateRoot, file)) || !fs.readFileSync(path.join(sourceRoot, file)).equals(fs.readFileSync(path.join(candidateRoot, file))))); if (unexpected.length) throw new Error(`Unexpected non-allowlisted candidate drift: ${unexpected.join(', ')}`);
    const metadata = { mode: args.mode, season: Number(args.season), runtime, source_digest: beforeDigest, changed_paths: changed, h2h_changed: h2hChanged, safety_decision: 'approved', summary: JSON.parse(fs.readFileSync(path.join(candidateRoot, 'candidate-summary.json'))) }; fs.writeFileSync(path.join(candidateRoot, 'candidate-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`); writeStatus(args['status-report'], { phase: 'complete', ...metadata }); console.log(JSON.stringify({ candidate_root: candidateRoot, mode: args.mode, changed_paths: changed, safety_decision: 'approved' }));
  } catch (error) { writeStatus(args['status-report'], { phase, season: Number(args.season), runtime, error: error.message }); if (sourceDigest(sourceRoot, files) !== beforeDigest) throw new Error(`Source checkout changed during failed ${phase} phase.`); throw error; }
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message || error); process.exit(1); } }
module.exports = { ALLOWLIST, main, parseArgs, preserveOperationalTimestamp, promoteGeneratedOutputs, sourceDigest, assertSafePaths };
