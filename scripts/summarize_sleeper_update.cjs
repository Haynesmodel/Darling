#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJson, readJson } = require('./data/canonical-json.cjs');
const { canonicalGameKey } = require('./data/semantic-validation.cjs');

const VALIDATION_COMMANDS = [
  'npm run generate:derived',
  'npm run generate:manifest',
  'npm run check:data-generated',
  'npm run test:assets',
];

function parseArgs(argv) {
  const args = {};
  const allowed = new Set([
    'before-dir',
    'after-dir',
    'season',
    'run-url',
    'base-sha',
    'candidate-sha',
    'changed-files-file',
    'body-out',
    'json-out',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--') || index + 1 >= argv.length) {
      throw new Error(`Invalid argument: ${key}`);
    }
    const name = key.slice(2);
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${key}`);
    if (Object.prototype.hasOwnProperty.call(args, name)) {
      throw new Error(`Duplicate argument: ${key}`);
    }
    args[name] = argv[index + 1];
    index += 1;
  }

  for (const key of [
    'before-dir',
    'after-dir',
    'season',
    'run-url',
    'base-sha',
    'candidate-sha',
    'changed-files-file',
    'body-out',
    'json-out',
  ]) {
    if (!args[key]) throw new Error(`Missing required --${key}`);
  }

  const season = Number(args.season);
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    throw new Error(`Invalid season: ${args.season}`);
  }
  for (const key of ['base-sha', 'candidate-sha']) {
    if (!/^[0-9a-f]{40}$/.test(args[key])) {
      throw new Error(`Invalid ${key}: expected a 40-character lowercase Git SHA.`);
    }
  }

  let runUrl;
  try {
    runUrl = new URL(args['run-url']);
  } catch {
    throw new Error(`Invalid run URL: ${args['run-url']}`);
  }
  if (runUrl.protocol !== 'https:') throw new Error('Run URL must use HTTPS.');

  return {
    ...args,
    season,
    'run-url': runUrl.toString(),
  };
}

function readOptionalJson(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function assertGameArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must contain a JSON array.`);
  const seen = new Set();
  value.forEach((game, index) => {
    if (!game || typeof game !== 'object' || Array.isArray(game)) {
      throw new Error(`${label} row ${index} must be an object.`);
    }
    const key = canonicalGameKey(game);
    if (seen.has(key)) throw new Error(`${label} contains duplicate canonical game key ${key}.`);
    seen.add(key);
  });
}

function gameMap(games) {
  return new Map(games.map(game => [canonicalGameKey(game), game]));
}

function emptyTypeCounts() {
  return {
    Regular: 0,
    Playoff: 0,
    Saunders: 0,
  };
}

function classifyGame(game) {
  if (game.type === 'Regular') return 'Regular';
  if (String(game.type).toLowerCase().includes('saunder')) return 'Saunders';
  return 'Playoff';
}

function analyzeH2H(beforeGames, afterGames, season) {
  assertGameArray(beforeGames, 'Before H2H');
  assertGameArray(afterGames, 'After H2H');

  const before = gameMap(beforeGames);
  const after = gameMap(afterGames);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, candidate] of after) {
    const existing = before.get(key);
    if (!existing) {
      added.push(candidate);
    } else if (canonicalJson(existing) !== canonicalJson(candidate)) {
      changed.push({ key, before: existing, after: candidate });
    }
  }
  for (const [key, existing] of before) {
    if (!after.has(key)) removed.push(existing);
  }

  const outOfSeasonAdds = added.filter(game => Number(game.season) !== season);
  if (removed.length > 0) {
    throw new Error(`Append-only H2H safety failed: ${removed.length} existing record(s) were removed.`);
  }
  if (changed.length > 0) {
    throw new Error(`Append-only H2H safety failed: ${changed.length} existing record(s) were changed.`);
  }
  if (outOfSeasonAdds.length > 0) {
    throw new Error(
      `Target-season safety failed: ${outOfSeasonAdds.length} record(s) were added outside season ${season}.`,
    );
  }

  const targetBefore = beforeGames.filter(game => Number(game.season) === season);
  const targetAfter = afterGames.filter(game => Number(game.season) === season);
  const targetAdds = added.filter(game => Number(game.season) === season);
  const addedByType = emptyTypeCounts();
  const owners = new Set();
  targetAdds.forEach((game) => {
    addedByType[classifyGame(game)] += 1;
    owners.add(String(game.teamA));
    owners.add(String(game.teamB));
  });

  return {
    target_rows_before: targetBefore.length,
    target_rows_after: targetAfter.length,
    added: targetAdds.length,
    changed: 0,
    removed: 0,
    added_by_type: addedByType,
    owners_in_new_games: [...owners].sort((a, b) => a.localeCompare(b)),
  };
}

function currentSeasonStats(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('CurrentSeason must contain a JSON object.');
  }
  const teams = Array.isArray(value.teams) ? value.teams : [];
  const games = Array.isArray(value.games) ? value.games : [];
  const statuses = { final: 0, live: 0, scheduled: 0 };
  for (const game of games) {
    if (Object.prototype.hasOwnProperty.call(statuses, game.status)) statuses[game.status] += 1;
  }
  const weeks = games.map(game => Number(game.week)).filter(Number.isFinite);
  return {
    season: value.season ?? null,
    teams: teams.length,
    games: games.length,
    latest_week: weeks.length > 0 ? Math.max(...weeks) : null,
    current_week: value.current_week ?? null,
    statuses,
    contains_live_scores: value.update_context?.contains_live_scores ?? null,
    contains_projected_scores: value.update_context?.contains_projected_scores ?? null,
  };
}

function assertCurrentSeason(value, season, expectedLeagueId) {
  if (!value) throw new Error('Candidate CurrentSeason.json is required.');
  if (Number(value.season) !== season) {
    throw new Error(
      `CurrentSeason safety failed: candidate season ${String(value.season)} does not equal target ${season}.`,
    );
  }
  if (!expectedLeagueId) throw new Error('LEAGUE_ID must be configured for CurrentSeason safety validation.');
  if (String(value.league_id) !== String(expectedLeagueId)) {
    throw new Error('CurrentSeason safety failed: candidate league_id does not match the configured league.');
  }
}

function manifestStats(value) {
  if (value === null) {
    return {
      data_version: null,
      h2h_sha256: null,
      current_season_sha256: null,
    };
  }
  return {
    data_version: value.data_version ?? null,
    h2h_sha256: value.assets?.H2H?.sha256 ?? null,
    current_season_sha256: value.assets?.CurrentSeason?.sha256 ?? null,
  };
}

function changedFiles(filePath) {
  return [...new Set(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/[\r\n]+/g, ' ')
    .replace(/([`*_{}[\]()#+.!|<>-])/g, '\\$1');
}

function inlineCode(value) {
  return `\`${String(value).replace(/`/g, '\\`')}\``;
}

function display(value) {
  return value === null || value === undefined ? 'not present' : escapeMarkdown(value);
}

function buildMarkdown(summary) {
  const current = summary.current_season.after;
  const owners = summary.h2h.owners_in_new_games.length > 0
    ? summary.h2h.owners_in_new_games.map(escapeMarkdown).join(', ')
    : 'none';
  const fileLines = summary.changed_files.map(file => `- ${inlineCode(file)}`);

  return [
    '> [!IMPORTANT]',
    '> This draft pull request is maintained by automation. Review it here; do not commit directly to the bot-owned branch.',
    '',
    `## Sleeper update for ${summary.season}`,
    '',
    `- Source workflow: [run ${escapeMarkdown(summary.source.run_id)}](${summary.source.run_url})`,
    `- Base main SHA: ${inlineCode(summary.source.base_main_sha)}`,
    `- Candidate source SHA: ${inlineCode(summary.source.candidate_source_sha)}`,
    `- Manifest data version: ${inlineCode(display(summary.manifest.before.data_version))} → ${inlineCode(display(summary.manifest.after.data_version))}`,
    `- H2H hash: ${inlineCode(display(summary.manifest.before.h2h_sha256))} → ${inlineCode(display(summary.manifest.after.h2h_sha256))}`,
    `- CurrentSeason hash: ${inlineCode(display(summary.manifest.before.current_season_sha256))} → ${inlineCode(display(summary.manifest.after.current_season_sha256))}`,
    '',
    '### H2H changes',
    '',
    `- Target-season rows: ${summary.h2h.target_rows_before} → ${summary.h2h.target_rows_after}`,
    `- Added: ${summary.h2h.added} (Regular ${summary.h2h.added_by_type.Regular}, Playoff ${summary.h2h.added_by_type.Playoff}, Saunders ${summary.h2h.added_by_type.Saunders})`,
    `- Changed existing records: ${summary.h2h.changed}`,
    `- Removed existing records: ${summary.h2h.removed}`,
    `- Owners in new games: ${owners}`,
    '',
    '### Current-season snapshot',
    '',
    `- Teams: ${summary.current_season.before?.teams ?? 0} → ${current?.teams ?? 0}`,
    `- Games: ${summary.current_season.before?.games ?? 0} → ${current?.games ?? 0}`,
    `- Candidate season / current week / latest week: ${display(current?.season)} / ${display(current?.current_week)} / ${display(current?.latest_week)}`,
    `- Candidate statuses (final / live / scheduled): ${current?.statuses?.final ?? 0} / ${current?.statuses?.live ?? 0} / ${current?.statuses?.scheduled ?? 0}`,
    `- Candidate live scores / projections: ${display(current?.contains_live_scores)} / ${display(current?.contains_projected_scores)}`,
    '',
    '### Changed files',
    '',
    ...fileLines,
    '',
    '### Completed validation',
    '',
    ...summary.validation_commands.map(command => `- [x] ${inlineCode(command)}`),
    '',
    '### Human review checklist',
    '',
    '- [ ] Team mapping and owner names match Sleeper.',
    '- [ ] Dates and week numbers are correct.',
    '- [ ] Scores and winners match Sleeper.',
    '- [ ] No games are duplicated.',
    '- [ ] Playoff and Saunders classifications are correct.',
    '- [ ] Placement and consolation games that should be excluded remain excluded.',
    '- [ ] Current-season statuses and completeness are plausible.',
    '- [ ] Manual fields in `assets/SeasonSummary.draft.json` were reviewed; the draft was not promoted to `assets/SeasonSummary.json`.',
    '- [ ] Derived data and manifest hashes are coherent with the canonical inputs.',
    '- [ ] The latest exact `ci / gate` result passes before merge.',
    '',
    '### Reproduce validation-only generation',
    '',
    '```sh',
    `UPDATE_LIVE=1 VALIDATE_ONLY=1 SEASON=${summary.season} scripts/update_sleeper_h2h.sh`,
    '```',
    '',
  ].join('\n');
}

function summarize(options, environment = process.env) {
  const beforeDir = path.resolve(options['before-dir']);
  const afterDir = path.resolve(options['after-dir']);
  const beforeH2H = readJson(path.join(beforeDir, 'H2H.json'));
  const afterH2H = readJson(path.join(afterDir, 'H2H.json'));
  const beforeCurrent = readOptionalJson(path.join(beforeDir, 'CurrentSeason.json'));
  const afterCurrent = readOptionalJson(path.join(afterDir, 'CurrentSeason.json'));
  const beforeManifest = readOptionalJson(path.join(beforeDir, 'asset-manifest.json'));
  const afterManifest = readOptionalJson(path.join(afterDir, 'asset-manifest.json'));
  const files = changedFiles(options['changed-files-file']);

  assertCurrentSeason(afterCurrent, options.season, environment.LEAGUE_ID);
  const summary = {
    season: options.season,
    source: {
      run_url: options['run-url'],
      run_id: new URL(options['run-url']).pathname.split('/').filter(Boolean).at(-1),
      base_main_sha: options['base-sha'],
      candidate_source_sha: options['candidate-sha'],
    },
    changed_files: files,
    h2h: analyzeH2H(beforeH2H, afterH2H, options.season),
    current_season: {
      before: currentSeasonStats(beforeCurrent),
      after: currentSeasonStats(afterCurrent),
    },
    manifest: {
      before: manifestStats(beforeManifest),
      after: manifestStats(afterManifest),
    },
    season_summary_draft: {
      changed: files.includes('assets/SeasonSummary.draft.json'),
      manual_fields_require_review: true,
      canonical_summary_modified: files.includes('assets/SeasonSummary.json'),
    },
    validation_commands: VALIDATION_COMMANDS,
  };
  if (summary.season_summary_draft.canonical_summary_modified) {
    throw new Error('Safety failed: assets/SeasonSummary.json must never be modified by Sleeper automation.');
  }
  if (summary.changed_files.length === 0) throw new Error('Summary requires at least one changed file.');

  return {
    summary,
    markdown: buildMarkdown(summary),
  };
}

function writeOutputs(options, result) {
  const bodyOut = path.resolve(options['body-out']);
  const jsonOut = path.resolve(options['json-out']);
  const outputs = [bodyOut, jsonOut];
  const temporary = outputs.map(output => `${output}.tmp-${process.pid}`);
  outputs.forEach(output => fs.rmSync(output, { force: true }));
  temporary.forEach(output => fs.rmSync(output, { force: true }));
  try {
    outputs.forEach(output => fs.mkdirSync(path.dirname(output), { recursive: true }));
    fs.writeFileSync(temporary[0], result.markdown);
    fs.writeFileSync(temporary[1], canonicalJson(result.summary));
    fs.renameSync(temporary[0], bodyOut);
    fs.renameSync(temporary[1], jsonOut);
  } catch (error) {
    temporary.forEach(output => fs.rmSync(output, { force: true }));
    outputs.forEach(output => fs.rmSync(output, { force: true }));
    throw error;
  }
}

function removeOutputs(options) {
  for (const key of ['body-out', 'json-out']) {
    if (options[key]) fs.rmSync(path.resolve(options[key]), { force: true });
  }
}

function discoverOutputOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length - 1; index += 1) {
    if (argv[index] === '--body-out') options['body-out'] = argv[index + 1];
    if (argv[index] === '--json-out') options['json-out'] = argv[index + 1];
  }
  return options;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let options = discoverOutputOptions(argv);
  try {
    removeOutputs(options);
    options = parseArgs(argv);
    writeOutputs(options, summarize(options));
  } catch (error) {
    removeOutputs(options);
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  analyzeH2H,
  buildMarkdown,
  currentSeasonStats,
  discoverOutputOptions,
  escapeMarkdown,
  parseArgs,
  summarize,
  writeOutputs,
};
