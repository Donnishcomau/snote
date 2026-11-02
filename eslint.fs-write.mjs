import tsParser from '@typescript-eslint/parser';
import { scopeBlocks } from './eslint.scope.mjs';

// #194: every raw filesystem write, rename, directory creation,
// chmod and write-mode open lives in src/core/secure-fs.ts and nowhere else. Every
// other file under src/ and vendor/ calls a secure-fs helper. This is a pure ban:
// no per-file or per-call exception list. The one allowance is the file name in
// FS_WRITE_ALLOWED_FILE below, passed to scopeBlocks as `ignores`.
//
// THREAT MODEL (2026-10-22): a
// tripwire against ACCIDENTAL regressions by our own lanes and agents, not a
// sandbox against a deliberate author. In scope, each with a test and a mutation:
// every normal import, require, dynamic import, re-export, string-literal import
// name and alias form; the write family (write, writev, link, symlink, copyFile,
// rename, appendFile, truncate, mkdir, chmod, open and their Sync and promise
// forms); every extension the build accepts (ts, tsx, js, jsx, mjs, cjs, mts,
// cts); src/ and vendor/; no later config block able to switch the rule off
// (a test reads the effective config per file) and noInlineConfig on.
// RESIDUAL, out of scope and covered by code review and the security audit:
// `new Function`, `eval`, `process.binding`, `process.getBuiltinModule`,
// `createRequire` used to dodge the guard, `Reflect.get(globalThis, ...)`, and
// calls that are not on the list (utimes). mkdtemp is NOT a residual: under a
// symlinked parent it still creates its folder in the link's target, so it is on
// the list and secure-fs.ts `secureMkdtemp` refuses a symlinked parent.
//
// This block sets `no-restricted-syntax` and nothing else. It must NOT set
// `no-restricted-imports`: the network guard (eslint.config.mjs) sets that rule
// for src/ and vendor/ and a later block replaces an earlier one. The syntax
// selectors below already catch `fs`, `fs/promises` and `node:fs/promises`
// imports (a test checks the merged config).

/** The only file allowed to use these members: the helpers live there. */
export const FS_WRITE_ALLOWED_FILE = 'src/core/secure-fs.ts';

/** Members of fs (and fs.promises) that write, create, open, copy, link, rename or change files and folders. */
export const GUARDED_MEMBERS = [
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'createWriteStream',
  'copyFileSync', 'copyFile', 'cpSync', 'cp', 'openSync', 'open', 'writeSync', 'writevSync',
  'truncateSync', 'truncate', 'ftruncateSync', 'ftruncate', 'renameSync',
  'chmodSync', 'chmod', 'fchmodSync', 'fchmod', 'lchmodSync', 'lchmod',
  'chownSync', 'chown', 'fchownSync', 'fchown', 'lchownSync', 'lchown',
  'mkdirSync', 'mkdir', 'mkdtempSync', 'mkdtemp', 'symlinkSync', 'symlink', 'linkSync', 'promises',
  'unlinkSync', 'rmSync', 'rmdirSync',
];
/** Names too common on other objects (stream.write, theme.link, history.rename) or not a call (the WriteStream class): guarded as fs.<name> and as an import from fs. */
const FS_ONLY_MEMBERS = ['write', 'writev', 'link', 'rename', 'WriteStream', 'unlink', 'rm', 'rmdir'];

const FS = '^(node:)?fs(.promises)?$';
const msg = 'Raw fs writes, renames, mkdir, chmod and write-mode opens live in src/core/secure-fs.ts only; call a secure-fs helper';
const W = `^(${GUARDED_MEMBERS.join('|')})$`;
const FSO = `^(${FS_ONLY_MEMBERS.join('|')})$`;
const WALL = `^(${[...GUARDED_MEMBERS, ...FS_ONLY_MEMBERS].join('|')})$`;

export const FS_WRITE_SYNTAX = [
  'error',
  // import { writeFileSync } / import { writeFileSync as w } / import { 'writeFileSync' as w } from fs
  { selector: `ImportDeclaration[source.value=/${FS}/] ImportSpecifier[imported.name=/${WALL}/]`, message: msg },
  { selector: `ImportDeclaration[source.value=/${FS}/] ImportSpecifier[imported.value=/${WALL}/]`, message: msg },
  // export { writeFileSync } from 'node:fs' / export * from 'node:fs' / export * as nfs from 'node:fs'
  { selector: `ExportNamedDeclaration[source.value=/${FS}/]`, message: msg },
  { selector: `ExportAllDeclaration[source.value=/${FS}/]`, message: msg },
  { selector: `MemberExpression[property.name=/${W}/]`, message: msg },
  { selector: `MemberExpression[computed=true][property.value=/${W}/]`, message: msg },
  { selector: `MemberExpression[object.name='fs'][property.name=/${FSO}/]`, message: msg },
  { selector: `MemberExpression[computed=true][object.name='fs'][property.value=/${FSO}/]`, message: msg },
  { selector: `ImportDeclaration[source.value=/${FS}/] > ImportNamespaceSpecifier[local.name!='fs']`, message: 'import node:fs as a namespace only under the name fs (#194 guard)' },
  { selector: `ImportDeclaration[source.value=/${FS}/] > ImportDefaultSpecifier[local.name!='fs']`, message: 'no default import of node:fs; use import * as fs (#194 guard)' },
  { selector: `MemberExpression[computed=true][object.name='fs']`, message: 'no computed access on fs (#194 guard)' },
  { selector: `MemberExpression[computed=true][object.expression.name='fs']`, message: 'no computed access on fs (#194 guard)' },
  { selector: `Identifier[name='fs']:not(MemberExpression > Identifier.object):not(ImportNamespaceSpecifier > Identifier):not(ImportDefaultSpecifier > Identifier):not(TSQualifiedName > Identifier.left)`, message: 'fs may only be used as fs.<member> (#194 guard: no aliasing)' },
  { selector: `ImportExpression[source.type!='Literal']`, message: 'no dynamic import with a computed name (#194 guard)' },
  { selector: `ImportExpression[source.value=/${FS}/]`, message: msg },
  { selector: `CallExpression[callee.name='require']`, message: 'no require() in src/ or vendor/ (ESM) (#194 guard)' },
];

/** Every extension the build accepts. */
export const FS_WRITE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'];
const EXT = `{${FS_WRITE_EXTENSIONS.join(',')}}`;
export const FS_WRITE_FILES = [`src/**/*.${EXT}`, `vendor/**/*.${EXT}`];

const blocks = scopeBlocks({
  name: 'fs-write-ban',
  files: FS_WRITE_FILES,
  ignores: [FS_WRITE_ALLOWED_FILE],
  rules: { 'no-restricted-syntax': FS_WRITE_SYNTAX },
});

// .mts and .cts hold TypeScript but the base config only sets the TypeScript parser for ts and tsx.
export const fsWriteBlocks = [
  ...blocks,
  { name: 'fs-write-ban:parser', files: ['src/**/*.{mts,cts}', 'vendor/**/*.{mts,cts}'], languageOptions: { parser: tsParser } },
];
