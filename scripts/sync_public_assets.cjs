/* Copy generated source assets into Vite's public directory before dev/build. */
const fs = require('node:fs');
const path = require('node:path');

function isDeployableAsset(sourceDir, filePath) {
  const relPath = path.relative(sourceDir, filePath);
  if (!relPath) return true;

  const name = path.basename(filePath);
  if (name.startsWith('.')) return false;
  if (/\.updated\.json$/.test(name)) return false;
  if (/\.draft\.json$/.test(name)) return false;
  if (/_backup\.json$/.test(name)) return false;

  return true;
}

function syncPublicAssets(root = process.cwd()) {
  const sourceDir = path.join(root, 'assets');
  const publicDir = path.join(root, 'public');
  const targetDir = path.join(publicDir, 'assets');

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing source assets directory: ${sourceDir}`);
  }

  fs.mkdirSync(publicDir, { recursive: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    dereference: true,
    filter: (filePath) => isDeployableAsset(sourceDir, filePath),
  });

  return targetDir;
}

function runCli(root = process.cwd()) {
  try {
    const targetDir = syncPublicAssets(root);
    console.log(`Synced assets to ${path.relative(root, targetDir)}`);
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (require.main === module) {
  process.exit(runCli());
}

module.exports = {
  isDeployableAsset,
  runCli,
  syncPublicAssets,
};
