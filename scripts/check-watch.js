// Runs both checkers of `npm run check` in watch mode. svelte-check adds types to SvelteKit route
// exports, so only the TypeScript compiler reports an untyped one, as CI does.
import { spawn } from 'node:child_process';

const commands = [
  ['tsc', ['--noEmit', '--watch', '--preserveWatchOutput']],
  ['svelte-check', ['--tsconfig', './tsconfig.json', '--watch']]
];

// npm puts the local binaries on the PATH. Windows needs a shell to run their .cmd wrappers.
const children = commands.map(([command, args]) =>
  spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
);

// Stopping either checker, or this script, stops both.
for (const child of children) {
  child.on('exit', (code, signal) => {
    process.exitCode ||= code ?? (signal ? 1 : 0);
    for (const other of children) if (other.exitCode === null) other.kill();
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) if (child.exitCode === null) child.kill(signal);
  });
}
