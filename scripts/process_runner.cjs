const { spawn } = require('node:child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function forwardSignal(child, signal) {
  if (!child.killed) child.kill(signal);
}

function runCommand(label, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n[${label}] ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
      shell: false,
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

module.exports = { forwardSignal, npmCommand, runCommand, runSequence };
