const { spawn } = require('node:child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const WINDOWS_COMMAND_EXTENSIONS = /\.(?:bat|cmd)$/i;
const WINDOWS_META_CHARACTERS = /([()\][%!^"`<>&|;, *?])/g;

function escapeWindowsCommand(value) {
  return String(value).replace(WINDOWS_META_CHARACTERS, '^$1');
}

function escapeWindowsArgument(value) {
  let escaped = String(value);
  escaped = escaped.replace(/(?=(\\+?))\1"/g, '$1$1\\"');
  escaped = escaped.replace(/(?=(\\+?))\1$/, '$1$1');
  escaped = `"${escaped}"`;
  // npm, c8, and Playwright are cmd-shim scripts. cmd.exe parses their
  // arguments twice, so shell metacharacters must be escaped twice.
  escaped = escaped.replace(WINDOWS_META_CHARACTERS, '^$1');
  return escaped.replace(WINDOWS_META_CHARACTERS, '^$1');
}

function resolveSpawn(command, args, options = {}) {
  const platform = options.platform || process.platform;
  const environment = options.environment || process.env;
  if (platform !== 'win32' || !WINDOWS_COMMAND_EXTENSIONS.test(command)) {
    return { command, args, options: {} };
  }
  const shell = environment.ComSpec || environment.COMSPEC || 'cmd.exe';
  const commandLine = [
    escapeWindowsCommand(command),
    ...args.map(escapeWindowsArgument),
  ].join(' ');
  return {
    command: shell,
    args: ['/d', '/s', '/c', `"${commandLine}"`],
    options: { windowsVerbatimArguments: true },
  };
}

function forwardSignal(child, signal) {
  if (!child.killed) child.kill(signal);
}

function runCommand(label, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n[${label}] ${command} ${args.join(' ')}`);
    const resolved = resolveSpawn(command, args);
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
      shell: false,
      ...resolved.options,
    });

    const forwardInterrupt = forwardSignal.bind(null, child, 'SIGINT');
    const forwardTermination = forwardSignal.bind(null, child, 'SIGTERM');
    process.once('SIGINT', forwardInterrupt);
    process.once('SIGTERM', forwardTermination);

    child.once('error', error => {
      process.removeListener('SIGINT', forwardInterrupt);
      process.removeListener('SIGTERM', forwardTermination);
      reject(new Error(`${label} could not start: ${error.message}`));
    });
    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', forwardInterrupt);
      process.removeListener('SIGTERM', forwardTermination);
      if (signal) {
        reject(new Error(`${label} terminated by ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`${label} failed with exit code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function runSequence(commands) {
  for (const command of commands) {
    await runCommand(command.label, command.command, command.args, command.options);
  }
}

module.exports = {
  escapeWindowsArgument,
  escapeWindowsCommand,
  forwardSignal,
  npmCommand,
  resolveSpawn,
  runCommand,
  runSequence,
};
