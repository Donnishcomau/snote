import { scopeBlocks } from './eslint.scope.mjs';
import { FS_WRITE_EXTENSIONS } from './eslint.fs-write.mjs';

// #221 (security build rule R4): every byte snote puts on the terminal passes the output guard
// (src/core/output-guard.ts) or is a constant. No file outside the output guard calls console.*
// or writes to process.stdout or process.stderr, except the few files listed below, each with
// the reason its writes are safe and the test that proves it.
//
// Why a rule of our own: no-restricted-syntax is already set for src/ and vendor/ by the fs write
// ban (eslint.fs-write.mjs), no-restricted-properties and no-restricted-globals by the network
// guard (eslint.config.mjs), and a later block replaces an earlier one. SELECTOR_RULE below is
// no-restricted-syntax under another name, so this guard adds to the others and never replaces
// them. Each exception turns off ONE of the three rules for ONE file, and a test fails when the
// file is gone or no longer needs it.
//
// THREAT MODEL (2026-10-22): a tripwire against
// ACCIDENTAL regressions by our own lanes and agents, not a sandbox against a deliberate author.
// In scope, each with a test and a mutation: console as a call, a reference or an alias; write,
// end, writev, _write and _writev on process.stdout and process.stderr, reached by dot, by
// string key, through process, node:process, globalThis.process or a TypeScript cast; an alias or
// a destructuring of either stream; pipe into either stream; the stream's fd; importing
// node:console; every extension the build accepts; src/ and vendor/; no inline directive able to
// switch a rule off.
// RESIDUAL, out of scope and covered by code review and the security audit: `new Function`,
// `eval`, `process.binding`, `process.getBuiltinModule`, `createRequire` used to dodge the guard,
// `Reflect.get(process, ...)`, a stream handed to a library that writes to it (Ink writes to the
// guarded stream by design), `stdio: 'inherit'` on a child process (the interactive editor), and
// writes made by a child process, the stream passed as a value (an argument, a return value, a
// default parameter, a conditional), string-key destructuring of process, a variable or template
// key on process, tty.WriteStream, and the exceptions covering whole files (test 2 pins each
// excepted site by its source line instead).

const SELECTOR_RULE = {
  meta: { type: 'problem', schema: { type: 'array', items: { type: 'object' } } },
  create(context) {
    const listeners = {};
    for (const { selector, message } of context.options) {
      listeners[selector] = (node) => context.report({ node, message });
    }
    return listeners;
  },
};

export const R4_PLUGIN_NAME = 'snote-r4';
export const R4_PLUGIN = { rules: { console: SELECTOR_RULE, 'stdout-write': SELECTOR_RULE, 'stderr-write': SELECTOR_RULE } };

const WRITE_MEMBERS = 'write|end|writev|_write|_writev';
const CONSOLE_MODULE = '/^(node:)?console$/';

/** Every selector that reaches the terminal through `stream` ('stdout' or 'stderr'). */
function streamSelectors(stream) {
  const msg = `R4 (#221): ${stream} is written only in src/core/output-guard.ts (or a listed file): print a constant, or pass the text through the output guard`;
  const w = `/^(${WRITE_MEMBERS})$/`;
  return [
    // process.stdout.write(x), process?.stdout?.write(x), p.stdout.write.bind(...), process.stdout.end(x)
    `MemberExpression[object.property.name='${stream}'][property.name=${w}]`,
    // process.stdout['write'](x), process.stdout[key](x)
    `MemberExpression[computed=true][object.property.name='${stream}']`,
    // process['stdout'].write(x), process['stdout'][key]
    `MemberExpression[object.property.value='${stream}']`,
    // (process.stdout as any).write(x), process.stdout!.write(x)
    `MemberExpression[object.expression.property.name='${stream}']`,
    // the stream's file descriptor: process.stdout.fd
    `MemberExpression[object.property.name='${stream}'][property.name='fd']`,
    // const out = process.stdout; out = process.stdout; const { write } = process.stdout
    `VariableDeclarator[init.property.name='${stream}']`,
    `VariableDeclarator[init.expression.property.name='${stream}']`,
    `AssignmentExpression[right.property.name='${stream}']`,
    // const { stdout } = process; ({ stdout } = process)
    `VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='${stream}']`,
    `AssignmentExpression[right.name='process'] > ObjectPattern > Property[key.name='${stream}']`,
    // import { stdout } from 'node:process'; import { 'stdout' as o } from 'process'
    `ImportDeclaration[source.value=/^(node:)?process$/] > ImportSpecifier[imported.name='${stream}']`,
    `ImportDeclaration[source.value=/^(node:)?process$/] > ImportSpecifier[imported.value='${stream}']`,
    // x.pipe(process.stdout)
    `CallExpression[callee.property.name='pipe'] > MemberExpression.arguments[property.name='${stream}']`,
  ].map((selector) => ({ selector, message: msg }));
}

const CONSOLE_MSG = 'R4 (#221): console is used only in src/core/output-guard.ts (or a listed file): print a constant, or pass the text through the output guard';

export const R4_RULES = {
  console: [
    // console.log(x), console.log, const c = console, f(console), typeof console; not o.console and not { console: 1 }
    { selector: "Identifier[name='console']:not(MemberExpression > Identifier.property):not(Property > Identifier.key)", message: CONSOLE_MSG },
    // globalThis.console, global.console, window.console, self.console, globalThis['console']
    { selector: "MemberExpression[object.name=/^(globalThis|global|window|self)$/][property.name='console']", message: CONSOLE_MSG },
    { selector: "MemberExpression[object.name=/^(globalThis|global|window|self)$/][computed=true][property.value='console']", message: CONSOLE_MSG },
    // import { Console } from 'node:console'; export * from 'console'; import('node:console'); require('console')
    ...[
      `ImportDeclaration[source.value=${CONSOLE_MODULE}]`,
      `ExportNamedDeclaration[source.value=${CONSOLE_MODULE}]`,
      `ExportAllDeclaration[source.value=${CONSOLE_MODULE}]`,
      `ImportExpression[source.value=${CONSOLE_MODULE}]`,
      `CallExpression[callee.name='require'][arguments.0.value=${CONSOLE_MODULE}]`,
      `TSImportEqualsDeclaration[moduleReference.expression.value=${CONSOLE_MODULE}]`,
    ].map((selector) => ({ selector, message: CONSOLE_MSG })),
  ],
  'stdout-write': streamSelectors('stdout'),
  'stderr-write': streamSelectors('stderr'),
};

/** The output guard itself: the one file that writes the terminal without an exception entry. */
export const OUTPUT_GUARD_FILE = 'src/core/output-guard.ts';

/**
 * Files that write the terminal outside the output guard. Each reason says why the bytes are safe and names the
 * test that proves it. The list is pinned by test/structure/terminal-sink-lint.test.ts (test 2).
 */
export const TERMINAL_EXCEPTIONS = [
  {
    path: 'src/cli/main.tsx', rules: ['console'], issue: 221,
    reason: 'the default of the log() wrapper in main(): every pre-start line goes through sanitizeForTerminal before it reaches console.log (proved by test/cli/pre-guard-output.test.ts test 5)',
  },
  {
    path: 'src/cli/main.tsx', rules: ['stderr-write'], issue: 221,
    reason: 'the crash notice is written after guardOutputStream is installed on stdout and stderr (proved by test/structure/terminal-sink-lint.test.ts test 3)',
  },
  {
    path: 'src/cli/bench.tsx', rules: ['console'], issue: 221,
    reason: 'prints one JSON line of five numbers (notes, matches, startMs, searchMs, rssMb) and no note text (proved by test/cli/bench.test.tsx test 2)',
  },
  {
    path: 'src/tui/app-actions.ts', rules: ['stdout-write'], issue: 221,
    reason: 'the editor hint runs inside the App, after guardOutputStream is installed on stdout, and its display name goes through sanitizeForTerminal (proved by test/tui/editor-hint-sanitised.test.tsx test 6)',
  },
];

const EXT = `{${FS_WRITE_EXTENSIONS.join(',')}}`;
export const R4_FILES = [`src/**/*.${EXT}`, `vendor/**/*.${EXT}`];
export const R4_EXTENSIONS = FS_WRITE_EXTENSIONS;

// scopeBlocks turns off one rule list per exception, so a file with two entries gets two blocks.
export const r4Blocks = [
  { name: 'r4:plugin', files: R4_FILES, plugins: { [R4_PLUGIN_NAME]: R4_PLUGIN } },
  ...scopeBlocks({
    name: 'r4-terminal-sink',
    files: R4_FILES,
    ignores: [OUTPUT_GUARD_FILE],
    rules: {
      [`${R4_PLUGIN_NAME}/console`]: ['error', ...R4_RULES.console],
      [`${R4_PLUGIN_NAME}/stdout-write`]: ['error', ...R4_RULES['stdout-write']],
      [`${R4_PLUGIN_NAME}/stderr-write`]: ['error', ...R4_RULES['stderr-write']],
    },
    exceptions: TERMINAL_EXCEPTIONS.map((e) => ({ ...e, rules: e.rules.map((r) => `${R4_PLUGIN_NAME}/${r}`) })),
  }),
];
