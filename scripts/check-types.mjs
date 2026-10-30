import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);

if (config.error) {
  console.error(ts.formatDiagnostics([config.error], formatHost()));
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  root,
  { noEmit: true },
  configPath
);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];

// nostr-tools v1 publishes TypeScript sources with diagnostics under SvelteKit's
// compiler options. Keep checking application files while that version is pinned.
const vendoredNostrTools = `${path.join('node_modules', 'nostr-tools')}${path.sep}`;
const isVendoredNostrTools = (diagnostic) =>
  diagnostic.file && path.relative(root, diagnostic.file.fileName).startsWith(vendoredNostrTools);
const appDiagnostics = diagnostics.filter((diagnostic) => !isVendoredNostrTools(diagnostic));
const ignoredCount = diagnostics.length - appDiagnostics.length;

if (appDiagnostics.length > 0) {
  console.error(ts.formatDiagnostics(appDiagnostics, formatHost()));
}

console.log(
  `TypeScript: ${appDiagnostics.length} application errors (${ignoredCount} in pinned nostr-tools v1 sources ignored)`
);
if (appDiagnostics.length > 0) process.exitCode = 1;

function formatHost() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => root,
    getNewLine: () => ts.sys.newLine
  };
}
