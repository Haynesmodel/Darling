const fs = require('node:fs');

function evaluateResults(results) {
  return Object.entries(results).filter(([, value]) => value.result !== 'success');
}

function runCli(env = process.env) {
  try {
    const results = JSON.parse(env.RESULTS || '{}');
    const entries = Object.entries(results);
    if (entries.length === 0) throw new Error('No CI dependency results were provided.');
    const failures = evaluateResults(results);
    const lines = [
      '### CI gate',
      '',
      '| Lane | Result |',
      '| --- | --- |',
      ...entries.map(([name, value]) => `| ${name} | ${value.result} |`),
      '',
      failures.length ? '**Overall: failed**' : '**Overall: passed**',
      '',
    ];
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, lines.join('\n'));
    if (failures.length) {
      console.error(failures.map(([name, value]) => `${name}: ${value.result}`).join('\n'));
      return 1;
    }
    console.log('All required CI lanes succeeded.');
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (require.main === module) process.exit(runCli());

module.exports = { evaluateResults, runCli };
