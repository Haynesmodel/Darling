#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJson, readJson } = require('./data/canonical-json.cjs');
const { canonicalGameKey } = require('./data/semantic-validation.cjs');

const VALIDATION_COMMANDS = [
  "python3 -m unittest discover -s test -p 'test_generate_transaction_history.py'",
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
      transaction_history_sha256: null,
    };
  }
  return {
    data_version: value.data_version ?? null,
    h2h_sha256: value.assets?.H2H?.sha256 ?? null,
    current_season_sha256: value.assets?.CurrentSeason?.sha256 ?? null,
    transaction_history_sha256: value.assets?.TransactionHistory?.sha256 ?? null,
  };
}

function transactionSlice(value, season) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.seasons)) {
    throw new Error('TransactionHistory must contain a seasons array.');
  }
  const matches = value.seasons.filter(row => Number(row.season) === season);
  if (matches.length > 1) throw new Error(`TransactionHistory contains duplicate target season ${season}.`);
  return matches[0] || null;
}

function analyzeTransactions(beforeValue, afterValue, season, expectedLeagueId) {
  const after = transactionSlice(afterValue, season);
  if (!after) throw new Error(`TransactionHistory safety failed: target season ${season} is missing.`);
  if (!expectedLeagueId || String(after.league_id) !== String(expectedLeagueId)) {
    throw new Error('TransactionHistory safety failed: target league does not match the configured league.');
  }
  const beforeSeasons = new Map((beforeValue?.seasons || []).map(row => [Number(row.season), row]));
  const afterSeasons = new Map((afterValue?.seasons || []).map(row => [Number(row.season), row]));
  for (const [value, row] of beforeSeasons) {
    if (value === season) continue;
    if (!afterSeasons.has(value)) {
      throw new Error(`TransactionHistory safety failed: non-target season ${value} was removed.`);
    }
    if (canonicalJson(row) !== canonicalJson(afterSeasons.get(value))) {
      throw new Error(`TransactionHistory safety failed: non-target season ${value} was changed.`);
    }
  }
  for (const value of afterSeasons.keys()) {
    if (value !== season && !beforeSeasons.has(value)) {
      throw new Error(`TransactionHistory safety failed: unexpected non-target season ${value} was added.`);
    }
  }
  const before = transactionSlice(beforeValue, season);
  const beforeMap = new Map((before?.transactions || []).map(row => [row.id, row]));
  const afterMap = new Map(after.transactions.map(row => [row.id, row]));
  if (afterMap.size !== after.transactions.length) {
    throw new Error('TransactionHistory safety failed: duplicate transaction IDs in target season.');
  }
  const added = [...afterMap.keys()].filter(id => !beforeMap.has(id)).sort();
  const removed = [...beforeMap.keys()].filter(id => !afterMap.has(id)).sort();
  const changed = [...afterMap.keys()]
    .filter(id => beforeMap.has(id) && canonicalJson(afterMap.get(id)) !== canonicalJson(beforeMap.get(id)))
    .sort();
  return {
    target_rows_before: before?.transactions?.length || 0,
    target_rows_after: after.transactions.length,
    complete: after.coverage.complete_count,
    failed: after.coverage.failed_count,
    pending: after.coverage.pending_count,
    type_counts: after.coverage.type_counts,
    added_ids: added,
    changed_ids: changed,
    removed_ids: removed,
    completed_week_before: before?.coverage?.completed_week ?? null,
    completed_week_after: after.coverage.completed_week,
    players: afterValue.players?.length || 0,
    missing_player_metadata: after.coverage.missing_player_metadata,
    draft_status: after.draft.status,
    draft_picks: after.draft.pick_count,
    non_target_seasons_preserved: true,
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
    `- TransactionHistory hash: ${inlineCode(display(summary.manifest.before.transaction_history_sha256))} → ${inlineCode(display(summary.manifest.after.transaction_history_sha256))}`,
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
    '### Transaction history',
    '',
    `- Target-season rows: ${summary.transactions.target_rows_before} → ${summary.transactions.target_rows_after}`,
    `- Complete / failed / pending: ${summary.transactions.complete} / ${summary.transactions.failed} / ${summary.transactions.pending}`,
    `- Types (waiver / free agent / trade / commissioner): ${summary.transactions.type_counts.waiver} / ${summary.transactions.type_counts.free_agent} / ${summary.transactions.type_counts.trade} / ${summary.transactions.type_counts.commissioner}`,
    `- Added / changed / removed IDs: ${summary.transactions.added_ids.length} / ${summary.transactions.changed_ids.length} / ${summary.transactions.removed_ids.length}`,
    `- Completed scoring week: ${display(summary.transactions.completed_week_before)} → ${display(summary.transactions.completed_week_after)}`,
    `- Referenced players / missing metadata: ${summary.transactions.players} / ${summary.transactions.missing_player_metadata}`,
    `- Draft status / picks: ${summary.transactions.draft_status} / ${summary.transactions.draft_picks}`,
    '- Non-target season slices: preserved byte-equivalently',
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
    '- [ ] Transaction counts, draft selection, player coverage, and completed-week boundary are plausible.',
    '- [ ] Trade on-field edge, Wire Finds, retention, turnover, and keeper methodology were spot-checked.',
    '- [ ] Non-target transaction seasons are unchanged.',
    '- [ ] The latest exact `ci / gate` result passes before merge.',
    '',
    '### Reproduce validation-only generation',
    '',
    '```sh',
    `LEAGUE_ID='<configured-league-id>' UPDATE_LIVE=1 VALIDATE_ONLY=1 SEASON=${summary.season} scripts/update_sleeper_h2h.sh`,
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
  const beforeTransactions = readOptionalJson(path.join(beforeDir, 'TransactionHistory.json'));
  const afterTransactions = readOptionalJson(path.join(afterDir, 'TransactionHistory.json'));
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
    transactions: analyzeTransactions(
      beforeTransactions,
      afterTransactions,
      options.season,
      environment.LEAGUE_ID,
    ),
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

function removeDiscoveredOutputs(argv) {
  for (let index = 0; index < argv.length - 1; index += 1) {
    if ((argv[index] === '--body-out' || argv[index] === '--json-out')
      && !argv[index + 1].startsWith('--')) {
      fs.rmSync(path.resolve(argv[index + 1]), { force: true });
    }
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let options = {};
  try {
    removeDiscoveredOutputs(argv);
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
  analyzeTransactions,
  buildMarkdown,
  currentSeasonStats,
  escapeMarkdown,
  parseArgs,
  summarize,
  writeOutputs,
};
