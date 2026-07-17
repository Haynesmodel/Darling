#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJson } = require('./data/canonical-json.cjs');
const { canonicalGameKey } = require('./data/semantic-validation.cjs');

const VALIDATIONS = [
  'npm run check:data-generated',
  'npm run test:assets',
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--') || index + 1 >= argv.length) {
      throw new Error(`Invalid argument: ${key}`);
    }
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  for (const key of ['before-dir', 'after-dir', 'season', 'run-url', 'body-out', 'json-out']) {
    if (!args[key]) throw new Error(`Missing required --${key}`);
  }
  const season = Number(args.season);
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    throw new Error(`Invalid season: ${args.season}`);
  }
  const runUrl = new URL(args['run-url']);
  if (!['https:', 'http:'].includes(runUrl.protocol)) throw new Error('Run URL must use HTTP(S).');
  return { ...args, season, 'run-url': runUrl.toString() };
}

function readJson(file, required = false) {
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`Missing required file: ${file}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function emptyCounts() {
  return { added: 0, removed: 0, changed: 0 };
}

function classify(game) {
  if (game.type === 'Regular') return 'regular_season';
  if (String(game.type).toLowerCase().includes('saunder')) return 'saunders';
  return 'playoffs';
}

function diffGames(beforeGames, afterGames, season) {
  const before = new Map(beforeGames.filter(game => game.season === season).map(game => [canonicalGameKey(game), game]));
  const after = new Map(afterGames.filter(game => game.season === season).map(game => [canonicalGameKey(game), game]));
  const totals = emptyCounts();
  const byType = {
    regular_season: emptyCounts(),
    playoffs: emptyCounts(),
    saunders: emptyCounts(),
  };
  const owners = new Set();

  for (const [key, game] of after) {
    const old = before.get(key);
    if (!old) {
      totals.added += 1;
      byType[classify(game)].added += 1;
      owners.add(game.teamA);
      owners.add(game.teamB);
    } else if (canonicalJson(old) !== canonicalJson(game)) {
      totals.changed += 1;
      byType[classify(game)].changed += 1;
      owners.add(game.teamA);
      owners.add(game.teamB);
      owners.add(old.teamA);
      owners.add(old.teamB);
    }
  }
  for (const [key, game] of before) {
    if (!after.has(key)) {
      totals.removed += 1;
      byType[classify(game)].removed += 1;
      owners.add(game.teamA);
      owners.add(game.teamB);
    }
  }

  return {
    before_rows: before.size,
    after_rows: after.size,
    ...totals,
    by_type: byType,
    changed_owners: [...owners].sort((a, b) => a.localeCompare(b)),
  };
}

function currentSeasonStats(value) {
  if (!value) return null;
  const games = Array.isArray(value.games) ? value.games : [];
  const statuses = { scheduled: 0, live: 0, final: 0 };
  games.forEach(game => {
    if (Object.prototype.hasOwnProperty.call(statuses, game.status)) statuses[game.status] += 1;
  });
  return {
    season: value.season ?? null,
    generated_at: value.generated_at ?? null,
    teams: Array.isArray(value.teams) ? value.teams.length : 0,
    games: games.length,
    latest_week: games.length ? Math.max(...games.map(game => Number(game.week) || 0)) : null,
    current_week: value.current_week ?? null,
    statuses,
    contains_live_scores: value.update_context?.contains_live_scores ?? null,
    contains_projected_scores: value.update_context?.contains_projected_scores ?? null,
  };
}

function manifestStats(value) {
  return {
    data_version: value?.data_version ?? null,
    h2h_sha256: value?.assets?.H2H?.sha256 ?? null,
    current_season_sha256: value?.assets?.CurrentSeason?.sha256 ?? null,
  };
}

function readChangedFiles(file) {
  if (!file) return [];
  return [...new Set(fs.readFileSync(file, 'utf8').split(/\r?\n/).map(value => value.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]()#+.!|<>-])/g, '\\$1')
    .replace(/[\r\n]+/g, ' ');
}

function formatValue(value) {
  return value === null || value === undefined ? 'not present' : escapeMarkdown(value);
}

function totalsLine(counts) {
  return `${counts.added} added, ${counts.changed} changed, ${counts.removed} removed`;
}

function buildMarkdown(summary, runUrl) {
  const current = summary.current_season.after;
  const owners = summary.h2h.changed_owners.length
    ? summary.h2h.changed_owners.map(escapeMarkdown).join(', ')
    : 'none';
  const changedFiles = summary.changed_files.length
    ? summary.changed_files.map(file => `- \`${String(file).replace(/`/g, '\\`')}\``).join('\n')
    : '- None';

  return [
    '> [!IMPORTANT]',
    '> This pull request is maintained by automation. Review through this PR; do not commit directly to the bot-owned branch.',
    '',
    `## Sleeper update for ${summary.season}`,
    '',
    `- Workflow run: [${escapeMarkdown(runUrl)}](${runUrl})`,
    `- Manifest data version: \`${formatValue(summary.manifest.before.data_version)}\` → \`${formatValue(summary.manifest.after.data_version)}\``,
    `- H2H source: \`${formatValue(summary.manifest.before.h2h_sha256)}\` → \`${formatValue(summary.manifest.after.h2h_sha256)}\``,
    `- CurrentSeason source: \`${formatValue(summary.manifest.before.current_season_sha256)}\` → \`${formatValue(summary.manifest.after.current_season_sha256)}\``,
    '',
    '### H2H changes',
    '',
    `- Target-season rows: ${summary.h2h.before_rows} → ${summary.h2h.after_rows}`,
    `- Total: ${totalsLine(summary.h2h)}`,
    `- Regular season: ${totalsLine(summary.h2h.by_type.regular_season)}`,
    `- Playoffs: ${totalsLine(summary.h2h.by_type.playoffs)}`,
    `- Saunders: ${totalsLine(summary.h2h.by_type.saunders)}`,
    `- Owners in changed games: ${owners}`,
    '',
    '### Current-season snapshot',
    '',
    `- Games: ${summary.current_season.before?.games ?? 0} → ${current?.games ?? 0}`,
    `- Teams: ${summary.current_season.before?.teams ?? 0} → ${current?.teams ?? 0}`,
    `- Candidate generated at: ${formatValue(current?.generated_at)}`,
    `- Candidate season/latest week: ${formatValue(current?.season)} / ${formatValue(current?.latest_week)}`,
    `- Statuses (final/live/scheduled): ${current?.statuses?.final ?? 0} / ${current?.statuses?.live ?? 0} / ${current?.statuses?.scheduled ?? 0}`,
    `- Live scores/projections: ${formatValue(current?.contains_live_scores)} / ${formatValue(current?.contains_projected_scores)}`,
    '',
    '### Changed files',
    '',
    changedFiles,
    '',
    '### Validation completed',
    '',
    ...summary.validation_commands.map(command => `- [x] \`${command}\``),
    '',
    '### Human review checklist',
    '',
    '- [ ] Team mapping and owner names are correct.',
    '- [ ] Week numbers and dates align with Sleeper.',
    '- [ ] Regular-season rows are neither missing nor duplicated.',
    '- [ ] Playoff and Saunders games are classified correctly.',
    '- [ ] Placement/consolation games that should be excluded remain excluded.',
    '- [ ] Scores and winners agree with Sleeper.',
    '- [ ] Current-season completeness and status fields look plausible.',
    '- [ ] `assets/SeasonSummary.draft.json` was reviewed as a noncanonical aid and was not promoted automatically.',
    '- [ ] Manifest and derived-data changes match the canonical inputs.',
    '',
    '### Reproduce validation-only generation',
    '',
    '```sh',
    `UPDATE_LIVE=1 VALIDATE_ONLY=1 SEASON=${summary.season} LEAGUE_ID=<sleeper-league-id> scripts/update_sleeper_h2h.sh`,
    '```',
    '',
  ].join('\n');
}

function summarize(options) {
  const beforeDir = path.resolve(options['before-dir']);
  const afterDir = path.resolve(options['after-dir']);
  const beforeH2H = readJson(path.join(beforeDir, 'H2H.json'), true);
  const afterH2H = readJson(path.join(afterDir, 'H2H.json'), true);
  const beforeCurrent = readJson(path.join(beforeDir, 'CurrentSeason.json'));
  const afterCurrent = readJson(path.join(afterDir, 'CurrentSeason.json'));
  const beforeManifest = readJson(path.join(beforeDir, 'asset-manifest.json'));
  const afterManifest = readJson(path.join(afterDir, 'asset-manifest.json'));
  const changedFiles = readChangedFiles(options['changed-files-file']);

  const summary = {
    season: options.season,
    changed_files: changedFiles,
    manifest: {
      before: manifestStats(beforeManifest),
      after: manifestStats(afterManifest),
    },
    h2h: diffGames(beforeH2H, afterH2H, options.season),
    current_season: {
      before: currentSeasonStats(beforeCurrent),
      after: currentSeasonStats(afterCurrent),
    },
    season_summary_draft_changed: changedFiles.includes('assets/SeasonSummary.draft.json'),
    validation_commands: VALIDATIONS,
  };
  return { summary, markdown: buildMarkdown(summary, options['run-url']) };
}

function writeOutputs(options, result) {
  const bodyOut = path.resolve(options['body-out']);
  const jsonOut = path.resolve(options['json-out']);
  for (const output of [bodyOut, jsonOut]) fs.rmSync(output, { force: true });
  fs.mkdirSync(path.dirname(bodyOut), { recursive: true });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  const bodyTemp = `${bodyOut}.tmp`;
  const jsonTemp = `${jsonOut}.tmp`;
  fs.writeFileSync(bodyTemp, result.markdown);
  fs.writeFileSync(jsonTemp, `${JSON.stringify(result.summary, null, 2)}\n`);
  fs.renameSync(bodyTemp, bodyOut);
  fs.renameSync(jsonTemp, jsonOut);
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    for (const key of ['body-out', 'json-out']) fs.rmSync(path.resolve(options[key]), { force: true });
    writeOutputs(options, summarize(options));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildMarkdown,
  diffGames,
  escapeMarkdown,
  parseArgs,
  summarize,
  writeOutputs,
};
