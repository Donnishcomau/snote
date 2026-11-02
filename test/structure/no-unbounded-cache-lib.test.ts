/**
 * Issue #420 (follow-up to the R5 guard in no-unbounded-cache.test.ts):
 * the long-lived-collection guard also covers the shipped simperium and websocket library,
 * `{}` dictionaries, and collections that a closure keeps alive in src/ and vendor/simplenote/.
 * Every such collection has a row that names its bound and the test that proves it.
 * The test reads text only: it never imports or runs the library or the app code.
 * R5's own file is not imported (it would register its describes here) and its rows are not copied.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

type Row = { file: string; key: string; bound: string; test: string };
type Site = { file: string; key: string; line: number };
type Src = { rel: string; text: string };

const G = 'test/structure/no-unbounded-cache-lib.test.ts';
const L = 'node_modules/simperium/lib/simperium/';
const W = 'node_modules/websocket/lib/';
const BOUND = /^(?:WeakMap|cap [1-9]\d*|cleared on \S.*|fixed|one per \S.*|unreached \(.+\)|gap #415)$/;

const LIB_ROWS: Row[] = [
  { file: L + 'channel.js', key: 'module.internal', bound: 'fixed', test: G },
  { file: L + 'channel.js', key: 'module.revisionCache', bound: 'cleared on history close', test: 'test/core/history-memory-bound.test.ts' },
  { file: L + 'channel.js', key: 'NetworkQueue.queues', bound: 'cleared on finish', test: 'test/core/simperium-reconnect-fix.test.ts' },
  { file: L + 'channel.js', key: 'Queue.queue', bound: 'cleared on run', test: 'test/core/simperium-reconnect-fix.test.ts' },
  { file: L + 'channel.js', key: 'LocalQueue.sent', bound: 'cleared on acknowledge', test: 'test/core/own-echoes.test.ts' },
  { file: L + 'channel.js', key: 'LocalQueue.queues', bound: 'cap 1', test: 'test/core/simperium-local-queue-fix.test.ts' },
  { file: L + 'client.js', key: 'Client.buckets', bound: 'one per bucket name', test: G },
  { file: L + 'ghost/store.js', key: 'Store.index', bound: 'unreached (main.tsx passes FileGhostStore)', test: G },
  { file: L + 'jsondiff/diff_match_patch.js', key: 'diff_match_patch.patch_obj.diffs', bound: 'one per patch object', test: G },
  { file: L + 'server.js', key: 'Session.channels', bound: 'unreached (index.js never requires server.js)', test: G },
  { file: L + 'storage/default.js', key: 'BucketStore.objects', bound: 'unreached (middleware passes objectStoreProvider)', test: G },
  { file: W + 'WebSocketConnection.js', key: 'WebSocketConnection.frameQueue', bound: 'cleared on message complete', test: G },
  { file: W + 'WebSocketRequest.js', key: 'WebSocketRequest.protocolFullCaseMap', bound: 'unreached (server side)', test: G },
  { file: W + 'WebSocketRequest.js', key: 'WebSocketRequest.requestedProtocols', bound: 'unreached (server side)', test: G },
  { file: W + 'WebSocketRouter.js', key: 'WebSocketRouter.handlers', bound: 'unreached (server side)', test: G },
  { file: W + 'WebSocketServer.js', key: 'WebSocketServer.connections', bound: 'unreached (server side)', test: G },
  { file: W + 'WebSocketServer.js', key: 'WebSocketServer.pendingRequests', bound: 'unreached (server side)', test: G },
  { file: W + 'utils.js', key: 'BufferingLogger.buffer', bound: 'unreached (only when DEBUG enables websocket)', test: G },
];

const IDS = 'test/core/id-set-caps.test.ts';
const SENT = 'test/core/sent-changes.test.ts';
const RECONNECT = 'test/core/simperium-reconnect-fix.test.ts';
const UNSYNCED = 'test/cli/unsynced-restart.test.ts';
const CLOSURE_ROWS: Row[] = [
  { file: 'src/cli/main.tsx', key: 'listeners', bound: 'one per event type', test: G },
  { file: 'src/core/browser-shim.ts', key: 'map', bound: 'one per localStorage key', test: 'test/core/browser-shim.test.ts' },
  { file: 'src/core/editor-drafts.ts', key: 'restored', bound: 'one per draft folder', test: 'test/core/editor-drafts.test.tsx' },
  { file: 'src/core/ghost-restore.ts', key: 'restored', bound: 'one per note', test: 'test/cli/ghost-restore.test.ts' },
  { file: 'src/core/requeue.ts', key: 'held', bound: 'one per unsynced note', test: UNSYNCED },
  { file: 'src/core/sent-changes.ts', key: 'fresh', bound: 'cleared on settle', test: SENT },
  { file: 'src/core/sent-changes.ts', key: 'superseded', bound: 'cleared on settle', test: SENT },
  { file: 'src/core/simperium-reconnect-fix.ts', key: 'open', bound: 'cleared on finish', test: RECONNECT },
  { file: 'src/core/simperium-reconnect-fix.ts', key: 'drainedSinceLastPurge', bound: 'cleared on purge', test: RECONNECT },
  { file: 'src/core/simperium-removed-note-fix.ts', key: 'removed', bound: 'cap 5000', test: IDS },
  { file: 'src/core/simperium-stale-delete-fix.ts', key: 'seenDuringIndex', bound: 'cleared on index', test: 'test/core/simperium-stale-delete-fix.test.ts' },
  { file: 'src/core/simperium-stale-change-fix.ts', key: 'records', bound: 'cleared on use or after 60 s', test: 'test/core/simperium-stale-change-fix.test.ts' },
  { file: 'src/core/unsynced.ts', key: 'seenPending', bound: 'one per carried unsynced id', test: UNSYNCED },
  { file: 'src/tui/caretMoves.ts', key: 'rows', bound: 'one per visual row', test: G },
  { file: 'vendor/simplenote/search/index.ts', key: 'indexAlphabetical', bound: 'one per note', test: G },
  { file: 'vendor/simplenote/search/index.ts', key: 'indexCreationDate', bound: 'one per note', test: G },
  { file: 'vendor/simplenote/search/index.ts', key: 'indexModification', bound: 'one per note', test: G },
  { file: 'vendor/simplenote/state/simperium/middleware.ts', key: 'hasRequestedRevisions', bound: 'cap 5000', test: IDS },
];

const unwrap = (e: ts.Expression | undefined, withAs: boolean): ts.Expression | undefined => {
  while (e && (ts.isParenthesizedExpression(e) || (withAs && (ts.isAsExpression(e) || ts.isSatisfiesExpression(e))))) e = e.expression;
  return e;
};
const isNullObject = (e: ts.CallExpression): boolean =>
  e.expression.getText() === 'Object.create' && e.arguments[0]?.kind === ts.SyntaxKind.NullKeyword;
/** An empty `{}`, an empty `[]`, `new Map(...)`, `new Set(...)` or `Object.create(null)`; parentheses are skipped. */
function isCollection(raw: ts.Expression | undefined, withAs = false, allowEmptyObject = true): boolean {
  const e = unwrap(raw, withAs);
  if (!e) return false;
  if (ts.isObjectLiteralExpression(e)) return allowEmptyObject && e.properties.length === 0;
  if (ts.isArrayLiteralExpression(e)) return e.elements.length === 0;
  if (ts.isNewExpression(e)) return ts.isIdentifier(e.expression) && /^(Map|Set)$/.test(e.expression.text);
  if (ts.isCallExpression(e)) return isNullObject(e);
  return false;
}

function parse(rel: string, text: string): ts.SourceFile {
  const kind = rel.endsWith('.js') ? ts.ScriptKind.JS : rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
}
const lineOf = (sf: ts.SourceFile, n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

/** The nearest enclosing named function, or the `X` of an unnamed `X.prototype.m = function` (`X.y` for `X.y = function`). */
function ownerOf(n: ts.Node): string {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p)) && p.name) return p.name.text;
    if (ts.isFunctionExpression(p) && ts.isBinaryExpression(p.parent) && ts.isPropertyAccessExpression(p.parent.left)) {
      return p.parent.left.getText().replace(/\.prototype\.[\w$]+$/, '');
    }
  }
  return 'module';
}

/** Library sites: a module-level collection, or `this.<name> = <collection>` anywhere. Two sites with one key are one row. */
export function libSites(rel: string, text: string): Site[] {
  const sf = parse(rel, text);
  const found: Site[] = [];
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && isCollection(d.initializer)) found.push({ file: rel, key: 'module.' + d.name.text, line: lineOf(sf, d) });
    }
  }
  const visit = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) && n.left.expression.kind === ts.SyntaxKind.ThisKeyword && isCollection(n.right)
    ) found.push({ file: rel, key: ownerOf(n) + '.' + n.left.name.text, line: lineOf(sf, n) });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

const isFn = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n);
const CALLBACK_MEMBERS = /^(forEach|map|filter|reduce|some|every|find|findIndex|sort|flatMap|then|catch|finally|replace)$/;
/** A nested function does not escape only as the direct argument of a call to one of the callback members. */
function escapes(fn: ts.Node): boolean {
  const p = fn.parent;
  return !(ts.isCallExpression(p) && p.arguments.includes(fn as ts.Expression) && ts.isPropertyAccessExpression(p.expression) && CALLBACK_MEMBERS.test(p.expression.name.text));
}
/** A closure collection initializer: a collection, or `<expr> ?? <Map/Set/Object.create(null)/[]>` (a `?? {}` is not one). */
function isClosureCollection(raw: ts.Expression | undefined): boolean {
  const e = unwrap(raw, true);
  if (e && ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) return isCollection(e.right, true, false);
  return isCollection(e, true);
}
/** A `{}` that is a dictionary: untyped, typed `Record<...>`, or typed with an index signature. */
function isDictionaryDecl(type: ts.TypeNode | undefined, init: ts.Expression | undefined): boolean {
  const e = unwrap(init, false);
  if (!e) return false;
  if (ts.isCallExpression(e)) return isNullObject(e);
  if (!ts.isObjectLiteralExpression(e) || e.properties.length !== 0) return false;
  if (!type) return true;
  if (ts.isTypeReferenceNode(type)) return type.typeName.getText() === 'Record';
  return ts.isTypeLiteralNode(type) && type.members.some((m) => ts.isIndexSignatureDeclaration(m));
}

/** Source sites: closure collections (kept alive by a nested function that escapes) and `{}` dictionaries at module, class-field or constructor level. */
export function srcSites(rel: string, text: string): Site[] {
  const sf = parse(rel, text);
  const found: Site[] = [];
  const add = (name: string, n: ts.Node): void => {
    found.push({ file: rel, key: name, line: lineOf(sf, n) });
  };
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && isDictionaryDecl(d.type, d.initializer)) add(d.name.text, d);
    }
  }
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyDeclaration(n) && n.initializer && ts.isIdentifier(n.name) && isDictionaryDecl(n.type, n.initializer)) add(n.name.text, n);
    if (
      ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) &&
      n.left.expression.kind === ts.SyntaxKind.ThisKeyword && isDictionaryDecl(undefined, n.right) && insideConstructor(n)
    ) add(n.left.name.text, n);
    if (isFn(n) && n.body && ts.isBlock(n.body)) closureSites(n, n.body);
    ts.forEachChild(n, visit);
  };
  const insideConstructor = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (ts.isConstructorDeclaration(p)) return true;
    return false;
  };
  const closureSites = (fn: ts.Node, body: ts.Block): void => {
    const decls: ts.VariableDeclaration[] = [];
    const gather = (m: ts.Node): void => {
      if (isFn(m)) return;
      if (ts.isVariableStatement(m)) decls.push(...m.declarationList.declarations);
      ts.forEachChild(m, gather);
    };
    ts.forEachChild(body, gather);
    for (const d of decls) {
      if (!ts.isIdentifier(d.name) || !isClosureCollection(d.initializer)) continue;
      const name = d.name.text;
      let captured = false;
      const find = (m: ts.Node, inner: boolean): void => {
        if (captured) return;
        if (isFn(m) && m !== fn) {
          const esc = inner || escapes(m);
          ts.forEachChild(m, (c) => find(c, esc));
          return;
        }
        if (inner && ts.isIdentifier(m) && m.text === name && m !== d.name) {
          captured = true;
          return;
        }
        ts.forEachChild(m, (c) => find(c, inner));
      };
      ts.forEachChild(body, (c) => find(c, false));
      if (captured) add(name, d);
    }
  };
  visit(sf);
  return found;
}

/** Sites with no row, rows that match no site, bounds outside the vocabulary, missing proof tests, and any gap row other than LocalQueue.queues. */
function judge(sites: Site[], rows: Row[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of sites) {
    const row = rows.find((r) => r.file === s.file && r.key === s.key);
    if (row) seen.add(row.file + '#' + row.key);
    else if (!problems.some((p) => p.endsWith(`: ${s.key} has no row`) && p.startsWith(s.file + ':'))) problems.push(`${s.file}:${s.line}: ${s.key} has no row`);
  }
  for (const r of rows) {
    const id = `${r.file}#${r.key}`;
    if (!BOUND.test(r.bound)) problems.push(`${id}: bound "${r.bound}" is outside the vocabulary`);
    if (!existsSync(join(process.cwd(), r.test))) problems.push(`${id}: proof test ${r.test} does not exist`);
    if (r.bound === 'gap #415' && !(r.file === L + 'channel.js' && r.key === 'LocalQueue.queues')) problems.push(`${id}: only LocalQueue.queues may carry gap #415`);
    if (!seen.has(id)) problems.push(`${id}: stale row, no site matches`);
  }
  return problems;
}

const walk = (dir: string, pattern: RegExp): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), pattern) : pattern.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : []));
const toRel = (abs: string): string => relative(process.cwd(), abs).split(sep).join('/');
const load = (roots: string[], pattern: RegExp): Src[] =>
  roots.flatMap((r) => walk(join(process.cwd(), r), pattern)).map((abs) => ({ rel: toRel(abs), text: readFileSync(abs, 'utf8') }));
const libFiles = (): Src[] => load(['node_modules/simperium/lib', 'node_modules/websocket/lib'], /\.js$/);
const srcFiles = (): Src[] => load(['src', 'vendor/simplenote'], /\.tsx?$/);
const scanLib = (files: Src[]): Site[] => files.flatMap((f) => libSites(f.rel, f.text));
const scanSrc = (files: Src[]): Site[] => files.flatMap((f) => srcSites(f.rel, f.text));

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});
/** Writes files into a fresh temp dir under TMPDIR and returns them as sources with their given rel names. */
function temp(files: Record<string, string>): Src[] {
  const d = mkdtempSync(join(tmpdir(), 'cache-lib-'));
  dirs.push(d);
  return Object.entries(files).map(([rel, text]) => {
    const abs = join(d, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, text);
    return { rel, text: readFileSync(abs, 'utf8') };
  });
}

describe('#420 shipped library and closure collections: fails on any collection without a bound row', () => {
  it('1: (pass-on-old) WHEN every .js file under node_modules/simperium/lib and node_modules/websocket/lib is scanned THEN it finds exactly `21` library collection sites, every site matches a LIB row and the judge reports `0` problems', () => {
    const files = libFiles();
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.rel === L + 'channel.js')).toBe(true);
    expect(files.some((f) => f.rel === W + 'WebSocketServer.js')).toBe(true);
    const sites = scanLib(files);
    expect(sites).toHaveLength(21);
    expect(judge(sites, LIB_ROWS)).toEqual([]);
  });

  it('2: (pass-on-old) WHEN every .ts and .tsx file under src/ and vendor/simplenote/ (tests excluded) is scanned for closure collections THEN it finds exactly `18`, every one matches a CLOSURE row and the judge reports `0` problems', () => {
    const files = srcFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => /\.test\./.test(f.rel))).toBe(false);
    const sites = scanSrc(files);
    expect(sites).toHaveLength(18);
    expect(judge(sites, CLOSURE_ROWS)).toEqual([]);
  });

  it('3: (pass-on-old) WHEN the judge reads the row tables THEN every bound matches the vocabulary, every proof test exists, exactly `0` rows have bound `gap #415`', () => {
    const rows = [...LIB_ROWS, ...CLOSURE_ROWS];
    expect(rows).toHaveLength(36);
    for (const r of rows) {
      expect(r.bound, `${r.file}#${r.key}`).toMatch(BOUND);
      expect(existsSync(join(process.cwd(), r.test)), `${r.file}#${r.key}: ${r.test}`).toBe(true);
    }
    const gaps = rows.filter((r) => r.bound === 'gap #415');
    expect(gaps).toEqual([]);
    // the judge can fail: a bound outside the vocabulary, a missing proof test and a second gap row are reported
    const probe = judge([], [
      { file: 'a.js', key: 'x', bound: 'forever', test: G },
      { file: 'b.js', key: 'y', bound: 'fixed', test: 'test/no-such-file.test.ts' },
      { file: 'c.js', key: 'z', bound: 'gap #415', test: G },
    ]);
    expect(probe.filter((p) => p.includes('outside the vocabulary'))).toHaveLength(1);
    expect(probe.filter((p) => p.includes('does not exist'))).toHaveLength(1);
    expect(probe.filter((p) => p.includes('only LocalQueue.queues'))).toHaveLength(1);
  });

  it('4: WHEN the scan reads a temp copy of channel.js in which the line `this.cache = {};` is added right after `function LocalQueue(store) {` THEN it reports exactly `1` site without a row and the report holds `LocalQueue.cache`', () => {
    const real = readFileSync(join(process.cwd(), L + 'channel.js'), 'utf8');
    expect(real.split('function LocalQueue(store) {')).toHaveLength(2);
    const mutated = real.replace('function LocalQueue(store) {', 'function LocalQueue(store) {\n  this.cache = {};');
    expect(mutated).not.toBe(real);
    const files = temp({ [L + 'channel.js']: mutated });
    const report = judge(scanLib(files), LIB_ROWS.filter((r) => r.file === L + 'channel.js'));
    expect(report).toHaveLength(1);
    expect(report[0]).toContain('LocalQueue.cache');
    expect(report[0]).toContain('has no row');
  });

  it('5: WHEN the scan reads a temp file holding `export function f() { const seen = new Set<string>(); return () => seen.add(\'x\'); }`, one holding `const cache: Record<string, string> = {};` at module level and one holding `this.byId = Object.create(null);` in a constructor THEN it reports `1` problem for each of the `3` files, and a temp file holding `const n = [1, 2].map((x) => { const s = new Set<number>(); return s.size + x; });` reports `0`', () => {
    const files = temp({
      'src/a.ts': "export function f() { const seen = new Set<string>(); return () => seen.add('x'); }\n",
      'src/b.ts': 'const cache: Record<string, string> = {};\nexport const get = (k: string) => cache[k];\n',
      'src/c.ts': 'export class C {\n  byId: Record<string, string>;\n  constructor() {\n    this.byId = Object.create(null);\n  }\n}\n',
      'src/d.ts': 'const n = [1, 2].map((x) => { const s = new Set<number>(); return s.size + x; });\nexport default n;\n',
    });
    for (const rel of ['src/a.ts', 'src/b.ts', 'src/c.ts']) {
      const f = files.filter((x) => x.rel === rel);
      expect(judge(scanSrc(f), []), rel).toHaveLength(1);
    }
    const d = files.filter((x) => x.rel === 'src/d.ts');
    expect(scanSrc(d)).toEqual([]);
    expect(judge(scanSrc(d), [])).toEqual([]);
  });
});
