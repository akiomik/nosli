// Runs both checkers of `npm run check` in watch mode. svelte-check adds types to SvelteKit route
// exports, so only the TypeScript compiler reports an untyped one, as CI does.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const { resolve } = createRequire(import.meta.url);
const checkers = [
  [resolve('typescript/bin/tsc'), '--noEmit', '--watch', '--preserveWatchOutput'],
  // Without --preserveWatchOutput, each svelte-check run clears the screen and hides tsc's errors.
  [
    resolve('svelte-check/bin/svelte-check'),
    ...['--tsconfig', './tsconfig.json', '--watch', '--preserveWatchOutput'],
    ...process.argv.slice(2)
  ]
];

// Running the checkers with this Node needs no shell or PATH lookup, on Windows too.
const children = checkers.map((args) => spawn(process.execPath, args, { stdio: 'inherit' }));

let stopping = false;
const stop = (signal) => {
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
};
// A checker exiting by itself is a failure, and stops the other.
for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) process.exitCode = code || 1;
    stop();
  });
}
// Ctrl-C or SIGTERM stops both checkers.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
