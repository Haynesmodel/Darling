#!/usr/bin/env node
/* Ensure browser-served static assets exist as real local files. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REQUIRED_STATIC_ASSETS = [
  {
    relPath: 'assets/LeaguePic.jpeg',
    placeholderRelPath: 'assets/.LeaguePic.jpeg.icloud',
    kind: 'jpeg',
    minBytes: 1024 * 1024,
  },
];

function readMagic(filePath, length = 3) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function isJpeg(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const magic = readMagic(filePath, 3);
  return magic.length === 3 && magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff;
}

function validateStaticAsset(root, asset) {
  const filePath = path.join(root, asset.relPath);
  const placeholderPath = asset.placeholderRelPath ? path.join(root, asset.placeholderRelPath) : null;
  const placeholderExists = placeholderPath ? fs.existsSync(placeholderPath) : false;

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      reason: placeholderExists
        ? `${asset.relPath} is offloaded by iCloud (${asset.placeholderRelPath} exists).`
        : `${asset.relPath} is missing.`,
    };
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return { ok: false, reason: `${asset.relPath} is not a regular file.` };
  }
  if (asset.minBytes && stat.size < asset.minBytes) {
    return { ok: false, reason: `${asset.relPath} is too small (${stat.size} bytes).` };
  }
  if (asset.kind === 'jpeg' && !isJpeg(filePath)) {
    return { ok: false, reason: `${asset.relPath} is not a valid JPEG file.` };
  }

  return { ok: true };
}

function restoreTrackedAsset(root, relPath, ref = 'HEAD') {
  const result = spawnSync('git', ['show', `${ref}:${relPath}`], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.length) {
    const stderr = result.stderr ? result.stderr.toString('utf8').trim() : '';
    return {
      ok: false,
      reason: stderr || `Unable to read ${relPath} from ${ref}.`,
    };
  }

  const filePath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, result.stdout);
  return { ok: true };
}

function ensureStaticAssets(root = process.cwd(), options = {}) {
  const assets = options.assets || REQUIRED_STATIC_ASSETS;
  const restore = options.restore !== false;
  const ref = options.ref || 'HEAD';
  const failures = [];
  const restored = [];

  for (const asset of assets) {
    const initial = validateStaticAsset(root, asset);
    if (initial.ok) continue;

    if (!restore) {
      failures.push(initial.reason);
      continue;
    }

    const restoredFromGit = restoreTrackedAsset(root, asset.relPath, ref);
    if (!restoredFromGit.ok) {
      failures.push(`${initial.reason} ${restoredFromGit.reason}`);
      continue;
    }

    const afterRestore = validateStaticAsset(root, asset);
    if (!afterRestore.ok) {
      failures.push(afterRestore.reason);
      continue;
    }

    if (asset.placeholderRelPath) {
      fs.rmSync(path.join(root, asset.placeholderRelPath), { force: true });
    }
    restored.push(asset.relPath);
  }

  return { failures, restored };
}

function runCli(root = process.cwd()) {
  const result = ensureStaticAssets(root);
  for (const relPath of result.restored) {
    console.log(`Restored static asset from git: ${relPath}`);
  }
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`Static asset: ${failure}`);
    return 1;
  }

  console.log('Static asset checks passed.');
  return 0;
}

if (require.main === module) {
  process.exit(runCli());
}

module.exports = {
  REQUIRED_STATIC_ASSETS,
  ensureStaticAssets,
  isJpeg,
  restoreTrackedAsset,
  runCli,
  validateStaticAsset,
};
