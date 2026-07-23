const { npmCommand, runCommand } = require('./process_runner.cjs');

function detectLocalWebKitSupport(coreBundle = require('playwright-core/lib/coreBundle')) {
  const platform = coreBundle.utils.hostPlatform;
  const executable = coreBundle.registry.registry.findExecutable('webkit');
  return {
    platform,
    supported: Boolean(executable?.downloadURLs?.length),
  };
}

async function runCi(run, { detectWebKitSupport = detectLocalWebKitSupport } = {}) {
  const sharedEnv = { CI: '1' };
  const webKitSupport = detectWebKitSupport();
  console.log(`Local CI runtime: Node ${process.version}; CI=${sharedEnv.CI}`);
  await run('npm version', npmCommand, ['--version'], { env: sharedEnv });
  await run('unit and data checks', npmCommand, ['run', 'test:unit'], { env: sharedEnv });
  await run('production build', npmCommand, ['run', 'build'], {
    env: { ...sharedEnv, VITE_BASE_PATH: '/Darling/' },
  });
  await run('Chromium production preview', npmCommand, ['run', 'test:ui:preview:chromium'], {
    env: sharedEnv,
  });
  if (webKitSupport.supported) {
    await run('WebKit production preview', npmCommand, ['run', 'test:ui:preview:webkit'], {
      env: sharedEnv,
    });
  } else {
    console.warn(
      `Skipping local WebKit production preview: Playwright does not publish WebKit for ${webKitSupport.platform}. `
      + 'Hosted CI still requires the WebKit smoke lane.',
    );
  }
}

function reportFailure(error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (require.main === module) {
  runCi(runCommand).catch(reportFailure);
}

module.exports = { detectLocalWebKitSupport, reportFailure, runCi };
