const { npmCommand, runCommand } = require('./process_runner.cjs');

async function runCi(run) {
  const sharedEnv = { CI: '1' };
  console.log(`Local CI runtime: Node ${process.version}; CI=${sharedEnv.CI}`);
  await run('npm version', npmCommand, ['--version'], { env: sharedEnv });
  await run('unit and data checks', npmCommand, ['run', 'test:unit'], { env: sharedEnv });
  await run('production build', npmCommand, ['run', 'build'], {
    env: { ...sharedEnv, VITE_BASE_PATH: '/Darling/' },
  });
  await run('Chromium production preview', npmCommand, ['run', 'test:ui:preview:chromium'], {
    env: sharedEnv,
  });
  await run('WebKit production preview', npmCommand, ['run', 'test:ui:preview:webkit'], {
    env: sharedEnv,
  });
}

function reportFailure(error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (require.main === module) {
  runCi(runCommand).catch(reportFailure);
}

module.exports = { reportFailure, runCi };
