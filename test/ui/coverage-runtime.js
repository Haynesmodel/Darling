import fs from 'node:fs';
import path from 'node:path';

function coverageModeEnabled(environment = process.env) {
  return environment.COLLECT_COVERAGE === '1';
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, '-');
}

function writeAtomically(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporary, filePath);
}

function persistWorkerCoverage({
  enabled,
  state,
  outputPath,
  logError = console.error,
}) {
  if (!enabled) return false;
  if (state.map.files().length === 0) {
    if (state.failedTests === 0) {
      throw new Error('Coverage mode completed with zero instrumented application files.');
    }
    logError('Coverage collection found zero instrumented files after a test failure; preserving the test failure as authoritative.');
    return false;
  }
  writeAtomically(outputPath, state.map.toJSON());
  return true;
}

export {
  coverageModeEnabled,
  persistWorkerCoverage,
  safeName,
};
