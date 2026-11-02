import { scopeBlocks } from './eslint.scope.mjs';
import { FS_WRITE_EXTENSIONS } from './eslint.fs-write.mjs';

// #219 (security build rule R1): the `websocket` package and node:child_process are imported in
// a few named files only, and every process those files start has a time limit and an output cap.
//
// Why a rule of our own: no-restricted-syntax is already set for src/ and vendor/ by the fs write
// ban (eslint.fs-write.mjs) and a later block replaces an earlier one, and no-restricted-imports
// cannot see a dynamic import. SELECTOR_RULE below is no-restricted-syntax under another name, so
// this guard adds to the others and never replaces them. Each exception turns off ONE of the
// three rules for ONE file, and a test fails when the file is gone or no longer needs it.
//
// THREAT MODEL (2026-10-22): a tripwire against
// ACCIDENTAL regressions by our own lanes and agents, not a sandbox against a deliberate author.
// In scope, each with a test and a mutation: every normal import (named, default, namespace,
// side-effect, type-only, import = require), re-export, export *, require, dynamic import with a
// literal name and alias form of both modules; every extension the build accepts; src/ and
// vendor/; no inline directive able to switch a rule off.
// RESIDUAL, out of scope and covered by code review and the security audit: `new Function`,
// `eval`, `process.binding`, `process.getBuiltinModule`, `createRequire` used to dodge the guard,
// a module name built at run time, other ways to start a process or open a socket (node:cluster,
// node:net, node:tls, the global WebSocket), and the size of the output of `spawn` (it streams;
// only its `timeout` is checked here), template-literal module names, a require alias, an aliased
// or promisified execFile, a timeout or maxBuffer found anywhere inside the call rather than in its
// own options, non-literal caps (shifts, Number.MAX_SAFE_INTEGER, +Infinity), a timeout whose value
// is undefined or NaN, and editor.ts being exempt file-wide.

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

export const R1_PLUGIN_NAME = 'snote-r1';
export const R1_PLUGIN = { rules: { 'child-process-import': SELECTOR_RULE, 'websocket-import': SELECTOR_RULE, 'spawn-limits': SELECTOR_RULE } };

/** Every selector that names `source` as a module: import, export from, export *, dynamic import, require, import = require, import('x') as a type. */
function moduleSelectors(pattern, message) {
  const at = `/${pattern}/`;
  return [
    `ImportDeclaration[source.value=${at}]`,
    `ExportNamedDeclaration[source.value=${at}]`,
    `ExportAllDeclaration[source.value=${at}]`,
    `ImportExpression[source.value=${at}]`,
    `CallExpression[callee.name='require'][arguments.0.value=${at}]`,
    `TSImportEqualsDeclaration[moduleReference.expression.value=${at}]`,
    `TSImportType[source.value=${at}]`,
  ].map((selector) => ({ selector, message }));
}

// A bare call by any of these names, or a call through a namespace (cp.execFile). `exec` as a
// member is RegExp.exec everywhere, so it counts as a member call only on a child_process-looking object.
const LIMIT_MSG = 'R1 (#219): every spawned process needs a literal `timeout` (and, for execFile, exec and spawnSync, a literal `maxBuffer` of 1048576 or less) in its options';
const calls = (names, memberNames) => [
  `CallExpression[callee.name=/^(${names})$/]`,
  `CallExpression[callee.property.name=/^(${memberNames})$/]`,
  "CallExpression[callee.property.name='exec'][callee.object.name=/^(cp|child_?[pP]rocess)$/]",
].join(', ');
const ANY_SPAWN = calls('execFile|execFileSync|exec|execSync|spawnSync|spawn|fork', 'execFile|execFileSync|execSync|spawnSync|spawn|fork');
const CAPPED_SPAWN = calls('execFile|execFileSync|exec|execSync|spawnSync', 'execFile|execFileSync|execSync|spawnSync');

/** The R1 rules, each with the module or call shape it guards. */
export const R1_RULES = {
  'child-process-import': moduleSelectors('^(node:)?child_process$', 'R1 (#219): node:child_process is imported only in the files listed in eslint.process-scope.mjs; use their helpers'),
  'websocket-import': moduleSelectors('^websocket', 'R1 (#219): the websocket package is imported only in src/core/websocket-provider.ts'),
  'spawn-limits': [
    { selector: `:matches(${ANY_SPAWN}):not(:has(ObjectExpression > Property[key.name='timeout']))`, message: LIMIT_MSG },
    { selector: `:matches(${CAPPED_SPAWN}):not(:has(ObjectExpression > Property[key.name='maxBuffer']))`, message: LIMIT_MSG },
    { selector: "Property[key.name='timeout'][value.value=0]", message: 'R1 (#219): timeout 0 means no time limit' },
    { selector: "Property[key.name='maxBuffer'][value.name='Infinity']", message: 'R1 (#219): maxBuffer Infinity means no output cap' },
    { selector: "Property[key.name='maxBuffer'][value.value>1048576]", message: 'R1 (#219): maxBuffer is 1048576 or less' },
  ],
};

/** Files that may import child_process, with the reason and the issue that removes the entry. */
export const CHILD_PROCESS_ALLOWED = [
  { path: 'src/core/update-check.ts', reason: 'runs git for the update check, with a timeout and an output cap', issue: 219 },
  { path: 'src/core/clipboard.ts', reason: 'pipes text into wl-copy, with a timeout and an output cap', issue: 219 },
  { path: 'src/core/editor.ts', reason: 'starts the interactive editor', issue: 219 },
  { path: 'src/core/instance-lock.ts', reason: 'runs /usr/bin/flock once at start on the data dir fd, with a timeout and an output cap', issue: 316 },
  { path: 'src/core/release-verify.ts', reason: 'runs git and /usr/bin/ssh-keygen to verify a fetched release, with a timeout and an output cap', issue: 68 },
];
export const WEBSOCKET_ALLOWED = [
  { path: 'src/core/websocket-provider.ts', reason: 'the one websocket client: handshake timeout, bounded frames', issue: 196 },
];
/** Interactive by design: the user's editor runs until the user closes it, so it has no time limit and its output is the terminal. Proved by test/structure/network-process-lint.test.ts test 5. */
export const SPAWN_LIMITS_EXEMPT = [
  { path: 'src/core/editor.ts', reason: 'interactive by design: the editor runs until the user closes it', issue: 219 },
];

export const R1_EXTENSIONS = FS_WRITE_EXTENSIONS;
const EXT = `{${R1_EXTENSIONS.join(',')}}`;
export const R1_FILES = [`src/**/*.${EXT}`, `vendor/**/*.${EXT}`];

const configFor = (rule, allowed) => scopeBlocks({
  name: `r1-${rule}`,
  files: R1_FILES,
  rules: { [`${R1_PLUGIN_NAME}/${rule}`]: ['error', ...R1_RULES[rule]] },
  exceptions: allowed.map((a) => ({ ...a, rules: [`${R1_PLUGIN_NAME}/${rule}`] })),
});

export const r1Blocks = [
  { name: 'r1:plugin', files: R1_FILES, plugins: { [R1_PLUGIN_NAME]: R1_PLUGIN } },
  ...configFor('child-process-import', CHILD_PROCESS_ALLOWED),
  ...configFor('websocket-import', WEBSOCKET_ALLOWED),
  ...configFor('spawn-limits', SPAWN_LIMITS_EXEMPT),
];
