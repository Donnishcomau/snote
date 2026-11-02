/**
 * Issue #82: no unbounded cache keyed by note text can come back (#32, the
 * marketplace reviewer's finding on #11324). A module-level `new Map(` in
 * src/ or vendor/simplenote/ needs an allowlist entry that names its bound,
 * and no map is keyed by a note's `content` or `body`. The shipped bundle is
 * checked in test/packaging/plugin-dist.test.ts (test 6).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** A module-level Map is allowed only here, with the reason it stays bounded. Empty today. */
const ALLOWED_MODULE_MAPS: { file: string; name: string; bound: string }[] = [];

/** `const name = new Map(...)` / `let name: Map<..> = new Map<..>()` starting in column 0. */
const MODULE_MAP = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b[^=\n]*=\s*new Map\b/;
/** `x.set(note.content, ...)`, `x.set(content, ...)`, `x.set(entry.note.body, ...)`. */
const KEYED_BY_TEXT = /\.set\(\s*(?:[A-Za-z_$][\w$]*\??\.)*(?:content|body)\s*,/;

/** Names of the module-level Maps declared in `text`. */
export function moduleMaps(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = MODULE_MAP.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Lines of `text` that store under a note's `content` or `body`. */
export function keyedByText(text: string): string[] {
  return text.split('\n').filter((l) => KEYED_BY_TEXT.test(l));
}

/** Every non-test source file under src/ and vendor/simplenote/, as { rel, text }. */
function sources(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        out.push({ rel: relative(process.cwd(), abs).split(sep).join('/'), text: readFileSync(abs, 'utf8') });
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  walk(join(process.cwd(), 'vendor', 'simplenote'));
  return out;
}

/** Module-level Maps with no allowlist entry, and allowlist entries that match nothing or give no bound. */
function judge(files: { rel: string; text: string }[], allowed = ALLOWED_MODULE_MAPS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const name of moduleMaps(f.text)) {
      const entry = allowed.find((a) => a.file === f.rel && a.name === name);
      if (!entry) problems.push(`${f.rel}: module-level Map "${name}" has no allowlist entry`);
      else seen.add(`${entry.file}#${entry.name}`);
    }
  }
  for (const a of allowed) {
    if (a.bound.trim() === '') problems.push(`${a.file}#${a.name}: allowlist entry gives no bound`);
    if (!seen.has(`${a.file}#${a.name}`)) problems.push(`${a.file}#${a.name}: stale allowlist entry`);
  }
  return problems;
}

const OLD_0_2_6 = [
  "const previewCache = new Map<string, [TitleAndPreview, boolean, string?]>();",
  '  const cached = previewCache.get(note.content);',
  '  previewCache.set(note.content, [result, stripMarkdown, searchQuery]);',
].join('\n');

describe('issue #82 no unbounded cache keyed by note text', () => {
  it('1: WHEN a module-level `new Map(` is added in src/ or vendor/simplenote/ (excluding tests) without an allowlist entry giving its bound THEN test/structure/no-unbounded-cache.test.ts fails', () => {
    const files = sources();
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.rel === 'vendor/simplenote/utils/note-utils.ts')).toBe(true);
    expect(files.some((f) => f.rel.endsWith('.test.ts'))).toBe(false);
    expect(judge(files)).toEqual([]);
    // the check can fail: an added Map is reported, an allowlisted one with a bound is not, a stale or bound-less entry is
    const added = [{ rel: 'src/core/x.ts', text: 'const seen = new Map<string, number>();\nexport let by: Map<string, string> = new Map();' }];
    expect(judge(added)).toEqual([
      'src/core/x.ts: module-level Map "seen" has no allowlist entry',
      'src/core/x.ts: module-level Map "by" has no allowlist entry',
    ]);
    const ok = [
      { file: 'src/core/x.ts', name: 'seen', bound: 'one entry per open account' },
      { file: 'src/core/x.ts', name: 'by', bound: 'cleared on logout' },
    ];
    expect(judge(added, ok)).toEqual([]);
    expect(judge(added, [{ file: 'src/core/x.ts', name: 'seen', bound: ' ' }, ok[1]])).toEqual([
      'src/core/x.ts#seen: allowlist entry gives no bound',
    ]);
    expect(judge([{ rel: 'src/core/x.ts', text: 'const s = new Set<string>();\nfunction f() {\n  const m = new Map();\n}' }])).toEqual([]);
    expect(judge([], ok)).toEqual([
      'src/core/x.ts#seen: stale allowlist entry',
      'src/core/x.ts#by: stale allowlist entry',
    ]);
  });

  it('2: WHEN a `Map` keyed by a note\'s `content`/`body` exists THEN that test fails', () => {
    const offenders: string[] = [];
    for (const f of sources()) {
      for (const line of keyedByText(f.text)) offenders.push(`${f.rel}: ${line.trim()}`);
    }
    expect(offenders).toEqual([]);
    // the check can fail
    expect(keyedByText('cache.set(note.content, 1);\nm.set(entry.note.body, 2)\nx.set(content, 3)')).toHaveLength(3);
    expect(keyedByText('cache.set(note, 1);\nm.set(note.id, 2);\nwm.set(note, [c, note.content]);')).toEqual([]);
  });

  it('3: WHEN plugin-dist is built THEN test/packaging/plugin-dist.test.ts finds `previewCache = new WeakMap` and no `previewCache.set(note.content`', () => {
    const src = readFileSync(join(process.cwd(), 'test', 'packaging', 'plugin-dist.test.ts'), 'utf8');
    expect(src).toContain("it('6: WHEN buildPluginDist has built into a temp directory THEN the chunk that holds `previewCache` has `previewCache = new WeakMap` (the build puts `/* @__PURE__ */` before `new`) and no `previewCache.set(note.content`'");
    expect(src).toContain('@__PURE__ \\*\\/ )?new WeakMap');
    expect(src).toContain('previewCache.set(note.content');
  });

  it('4: WHEN the 0.2.6 version of note-utils.ts (2932e32^) is restored THEN each new check fails', () => {
    expect(moduleMaps(OLD_0_2_6)).toEqual(['previewCache']);
    expect(keyedByText(OLD_0_2_6)).toEqual(['  previewCache.set(note.content, [result, stripMarkdown, searchQuery]);']);
    expect(judge([{ rel: 'vendor/simplenote/utils/note-utils.ts', text: OLD_0_2_6 }])).toEqual([
      'vendor/simplenote/utils/note-utils.ts: module-level Map "previewCache" has no allowlist entry',
    ]);
    // and the current file passes both
    const now = readFileSync(join(process.cwd(), 'vendor', 'simplenote', 'utils', 'note-utils.ts'), 'utf8');
    expect(moduleMaps(now)).toEqual([]);
    expect(keyedByText(now)).toEqual([]);
    expect(now).toContain('const previewCache = new WeakMap<');
  });
});

// #222 (security build rule R5, follow-up to #202): every long-lived collection in src/ and
// vendor/simplenote/ (a module-level or class-field `new Map(`, `new Set(` or empty `[]`, a field
// set in a constructor included) is listed here with its bound and the test that proves it.
// Bounds: `WeakMap` (held weakly), `cap <n>` (the oldest entry goes past n), `cleared on <event>`,
// or `fixed` (built once and never changed: decided on the file's syntax tree, every use of the
// name other than its declaration must be a read-only member such as `.has(`, and the declaration
// must not be exported; 222-A1). A collection declared inside a function body dies with the call
// and is not listed, unless a closure keeps it for the session (#202's two Sets): such a row
// carries `decl`, its exact declaration line. `escapes` lists the exact source lines where a
// `fixed` value is handed out as a value (the shared empty lists of the vendored reducer and
// search); any other such use, or a changed line, is reported, and such a row's declaration must
// be `Object.freeze(...)`, so a push anywhere downstream throws.
type LongLived = { file: string; name: string; bound: string; test: string; decl?: string; escapes?: string[] };
const R5_GUARD = 'test/structure/no-unbounded-cache.test.ts';
const ALLOWED_LONG_LIVED: LongLived[] = [
  { file: 'src/core/crash-redact.ts', name: 'KNOWN_WORDS', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/crash-redact.ts', name: 'COMMAND_KEYS', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/crash-redact.ts', name: 'KEY_EVENT_TYPES', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/editor-select.ts', name: 'TERMINAL_EDITORS', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/editor-write-watch.ts', name: 'live', bound: 'cleared on the watch stop (one entry per open editor)', test: 'test/core/editor-write-quit.test.tsx' },
  { file: 'src/core/editor.ts', name: 'handedBack', bound: 'cleared on releaseDraftsAfterSave', test: 'test/core/editor-drafts.test.tsx' },
  { file: 'src/core/ghost-store.ts', name: 'ghosts', bound: 'cleared on note delete (one ghost per note)', test: 'test/cli/delete-forever-restart.test.ts' },
  { file: 'src/core/install-kind.ts', name: 'ALLOWED_C_VALUES', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/instance-lock.ts', name: 'heldByProcess', bound: 'cleared on release', test: 'test/core/instance-lock.test.ts' },
  { file: 'src/core/output-guard.ts', name: 'DISPLAY_FINALS', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/output-guard.ts', name: 'MODES_KEPT', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/output-guard.ts', name: 'STRING_INTRODUCERS', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/output-guard.ts', name: 'C1_STRING_INTRODUCERS', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/persistence.ts', name: 'afterSave', bound: 'cleared on save', test: 'test/core/cleared-on-bounds.test.ts' },
  { file: 'src/core/problem-signal.ts', name: 'listeners', bound: 'cleared on unsubscribe', test: 'test/core/cleared-on-bounds.test.ts' },
  { file: 'src/core/requeue.ts', name: 'SET_FIELDS', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/simperium-reducer.ts', name: 'LOCAL_NOTE_ACTIONS', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/simperium-reducer.ts', name: 'REMOVE_NOTE_ACTIONS', bound: 'fixed', test: R5_GUARD },
  { file: 'src/core/simperium-removed-note-fix.ts', name: 'removed', bound: 'cap 5000', test: 'test/core/id-set-caps.test.ts', decl: '  const removed = new Set<string>();' },
  { file: 'src/core/update-banner.ts', name: 'listeners', bound: 'cleared on unsubscribe', test: 'test/core/cleared-on-bounds.test.ts' },
  { file: 'src/core/update-signal.ts', name: 'listeners', bound: 'cleared on unsubscribe', test: 'test/core/update-signal.test.ts' },
  { file: 'src/core/websocket-provider.ts', name: 'sockets', bound: 'cleared on socket close', test: 'test/core/connection-word.test.ts' },
  { file: 'src/tui/key-ring.ts', name: 'keyLog', bound: 'cap 20', test: 'test/core/crash-ring.test.ts' },
  {
    file: 'vendor/simplenote/search/index.ts', name: 'emptyList', bound: 'fixed', test: R5_GUARD,
    escapes: ['filteredTags.length > 0 ? filteredTags : (emptyList as T.TagHash[]);'],
  },
  { file: 'vendor/simplenote/state/simperium/functions/bucket-queue.ts', name: 'queue', bound: 'cleared on sync (one entry per waiting note)', test: 'test/core/cleared-on-bounds.test.ts' },
  { file: 'vendor/simplenote/state/simperium/functions/in-memory-bucket.ts', name: 'entities', bound: 'cleared on note delete (one entry per note)', test: 'test/fake-simperium/server-resume.test.ts' },
  { file: 'vendor/simplenote/state/simperium/functions/in-memory-ghost.ts', name: 'entities', bound: 'cleared on note delete (one ghost per note)', test: 'test/core/requeue.test.ts' },
  { file: 'vendor/simplenote/state/simperium/middleware.ts', name: 'hasRequestedRevisions', bound: 'cap 5000', test: 'test/core/id-set-caps.test.ts', decl: '    const hasRequestedRevisions = new Set<T.EntityId>();' },
  {
    file: 'vendor/simplenote/state/ui/reducer.ts', name: 'emptyList', bound: 'fixed', test: R5_GUARD,
    escapes: ['state = emptyList as T.EntityId[],', 'state = emptyList as T.TagHash[],'],
  },
];
const R5_BOUND = /^(?:WeakMap|cap [1-9]\d*|cleared on \S.*|fixed)$/;
/** Members a `fixed` collection may be used through: none of them changes it (a write to one, `x.length = 0`, still counts). */
const READ_ONLY_MEMBERS = new Set([
  'has', 'get', 'size', 'forEach', 'keys', 'values', 'entries', 'includes', 'indexOf', 'length',
  'slice', 'join', 'map', 'filter', 'some', 'every', 'find', 'at',
]);

/** True when `n` is written: the left side of an assignment, or the operand of `++`, `--` or `delete`. */
function isWritten(n: ts.Node): boolean {
  const p = n.parent;
  if (ts.isBinaryExpression(p)) return p.left === n && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
  if (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) return p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken;
  return ts.isDeleteExpression(p);
}

/**
 * Every use of `name` in `text` that a `fixed` collection may not have, as `line <n> uses it (<how>)`
 * or `it is exported`: anything but a read of a READ_ONLY_MEMBERS member (an alias, an argument, an
 * element access, an optional or plain call of any other member, a write), unless the whole source
 * line is listed in `escapes`.
 */
export function fixedMisuses(rel: string, text: string, name: string, escapes: string[] = []): string[] {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const lines = text.split('\n');
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === name) {
      const p = n.parent;
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
      if (ts.isVariableDeclaration(p) && p.name === n) {
        const st = p.parent.parent;
        if (ts.isVariableStatement(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) out.push('it is exported');
      } else if ((ts.isPropertyAccessExpression(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.name === n) {
        // another object's member that happens to share the name
      } else if (ts.isPropertyAccessExpression(p) && p.expression === n && READ_ONLY_MEMBERS.has(p.name.text) && !isWritten(p)) {
        // a read-only use
      } else if (!escapes.includes(lines[line].trim())) {
        const how = ts.isPropertyAccessExpression(p) && p.expression === n ? `.${p.name.text}` : ts.isElementAccessExpression(p) ? '[...]' : ts.SyntaxKind[p.kind];
        out.push(`line ${line + 1} uses it (${how})`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const e of escapes) if (!lines.some((l) => l.trim() === e)) out.push(`escape line not found: ${e}`);
  return out;
}

/** `Object.freeze(x)`: the collection is still listed (and a row with `escapes` requires it). */
function isFreeze(e: ts.Expression): e is ts.CallExpression {
  return ts.isCallExpression(e) && e.arguments.length === 1 && ts.isPropertyAccessExpression(e.expression)
    && ts.isIdentifier(e.expression.expression) && e.expression.expression.text === 'Object' && e.expression.name.text === 'freeze';
}

/** A `new Map(...)`, `new Set(...)` or empty `[]` initializer (through `as`, `satisfies` and parentheses). */
function isCollection(e: ts.Expression | undefined): boolean {
  while (e && (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e) || isFreeze(e))) {
    e = ts.isCallExpression(e) ? e.arguments[0] : e.expression;
  }
  if (!e) return false;
  if (ts.isNewExpression(e)) return ts.isIdentifier(e.expression) && (e.expression.text === 'Map' || e.expression.text === 'Set');
  return ts.isArrayLiteralExpression(e) && e.elements.length === 0;
}

/** The module-level and class-field collections declared in `text`, each with its 1-based line. */
export function longLived(rel: string, text: string): { name: string; line: number }[] {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const out: { name: string; line: number }[] = [];
  const add = (node: ts.Node, name: string): void => {
    out.push({ name, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
  };
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && isCollection(d.initializer)) add(d, d.name.text);
  }
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyDeclaration(n) && isCollection(n.initializer)) add(n, n.name.getText(sf));
    if (ts.isConstructorDeclaration(n) && n.body) {
      for (const st of n.body.statements) {
        if (!ts.isExpressionStatement(st) || !ts.isBinaryExpression(st.expression)) continue;
        const { left, operatorToken, right } = st.expression;
        if (operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(left)
          && left.expression.kind === ts.SyntaxKind.ThisKeyword && isCollection(right)) add(st, left.name.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Long-lived collections with no allowlist row (as `file:line`), and rows with no valid bound, no proof test, or nothing to match. */
function judgeLongLived(
  files: { rel: string; text: string }[],
  allowed: LongLived[] = ALLOWED_LONG_LIVED,
  exists: (rel: string) => boolean = (rel) => existsSync(join(process.cwd(), rel)),
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const c of longLived(f.rel, f.text)) {
      const entry = allowed.find((a) => a.file === f.rel && a.name === c.name && a.decl === undefined);
      if (entry) seen.add(`${entry.file}#${entry.name}`);
      if (entry?.escapes && !f.text.split('\n')[c.line - 1].includes('Object.freeze(')) {
        problems.push(`${entry.file}#${entry.name}: has escapes but its declaration is not Object.freeze(...)`);
      }
      if (!entry) problems.push(`${f.rel}:${c.line}: long-lived collection "${c.name}" has no allowlist entry naming its bound`);
    }
    const lines = f.text.split('\n');
    for (const a of allowed) if (a.decl !== undefined && a.file === f.rel && lines.includes(a.decl)) seen.add(`${a.file}#${a.name}`);
  }
  for (const a of allowed) {
    const key = `${a.file}#${a.name}`;
    if (!R5_BOUND.test(a.bound)) problems.push(`${key}: bound "${a.bound}" is not WeakMap, cap <n>, cleared on <event> or fixed`);
    if (!exists(a.test)) problems.push(`${key}: proof test ${a.test} does not exist`);
    const f = files.find((x) => x.rel === a.file);
    if (a.bound === 'fixed' && f) {
      for (const m of fixedMisuses(f.rel, f.text, a.name, a.escapes)) problems.push(`${key}: bound is fixed but ${m}`);
    }
    if (!seen.has(key)) problems.push(`${key}: stale allowlist entry`);
  }
  return problems;
}

describe('issue #222 every long-lived Map, Set or array names its bound (R5)', () => {
  it('1: WHEN `src/` or `vendor/simplenote/` declares a module-level or class-field `new Map(`, `new Set(` or array (`= []`) THEN it must appear in the guard\'s allowlist with its bound (`WeakMap`, `cap <n>`, `cleared on <event>`) and the test that proves the bound, or the guard fails and prints `file:line`', () => {
    const files = sources();
    expect(files.length).toBeGreaterThan(50);
    expect(judgeLongLived(files)).toEqual([]);
    // the guard can fail: each kind is reported as file:line until it has a row with a bound and a proof test
    const text = [
      'export const byId = new Map<string, number>();',
      'let rows: Array<() => void> = [];',
      'export class Cache {',
      '  private seen = new Set<string>();',
      '  hits: Map<string, number>;',
      '  constructor() {',
      '    this.hits = new Map();',
      '  }',
      '}',
    ].join('\n');
    const added = [{ rel: 'src/core/x.ts', text }];
    expect(judgeLongLived(added, [])).toEqual([
      'src/core/x.ts:1: long-lived collection "byId" has no allowlist entry naming its bound',
      'src/core/x.ts:2: long-lived collection "rows" has no allowlist entry naming its bound',
      'src/core/x.ts:4: long-lived collection "seen" has no allowlist entry naming its bound',
      'src/core/x.ts:7: long-lived collection "hits" has no allowlist entry naming its bound',
    ]);
    const proof = 'test/core/x.test.ts';
    const rowsOk: LongLived[] = [
      { file: 'src/core/x.ts', name: 'byId', bound: 'WeakMap', test: proof },
      { file: 'src/core/x.ts', name: 'rows', bound: 'cap 50', test: proof },
      { file: 'src/core/x.ts', name: 'seen', bound: 'cleared on logout', test: proof },
      { file: 'src/core/x.ts', name: 'hits', bound: 'cleared on note delete', test: proof },
    ];
    const has = (rel: string): boolean => rel === proof;
    expect(judgeLongLived(added, rowsOk, has)).toEqual([]);
    expect(judgeLongLived(added, [{ ...rowsOk[0], bound: 'small' }, ...rowsOk.slice(1)], has)).toEqual([
      'src/core/x.ts#byId: bound "small" is not WeakMap, cap <n>, cleared on <event> or fixed',
    ]);
    expect(judgeLongLived(added, rowsOk, () => false)).toHaveLength(4);
    expect(judgeLongLived(added, rowsOk, () => false)[0]).toBe('src/core/x.ts#byId: proof test test/core/x.test.ts does not exist');
    // a `fixed` row: only read-only member uses pass (222-A1/A2: each bypass form and each mutator is reported)
    const fixedRow: LongLived[] = [{ file: 'src/core/x.ts', name: 'K', bound: 'fixed', test: proof }];
    const fixedJudge = (body: string): string[] => judgeLongLived([{ rel: 'src/core/x.ts', text: `const K = new Set<string>(['a']);\n${body}` }], fixedRow, has);
    expect(fixedJudge('export const ok = K.has("a") && K.size > 0 && [...K.values()].length === 1;')).toEqual([]);
    for (const [body, how] of [
      ['K.add("b");', '.add'], ['K.set("b", 1);', '.set'], ['K.push("b");', '.push'], ['K.unshift("b");', '.unshift'], ['K.splice(0, 1);', '.splice'],
      ['K\n  .add("b");', '.add'], ['K?.add("b");', '.add'], ['K["add"]("b");', '[...]'], ['K.add ("b");', '.add'], ['K.add<string>("b");', '.add'],
      ['const alias = K;', 'VariableDeclaration'], ['K[K.length] = "b";', '[...]'], ['K.length = 0;', '.length'], ['use(K);', 'CallExpression'],
    ]) {
      expect(fixedJudge(body), body).toEqual([`src/core/x.ts#K: bound is fixed but line 2 uses it (${how})`]);
    }
    expect(judgeLongLived([{ rel: 'src/core/x.ts', text: 'export const K = new Set<string>();' }], fixedRow, has)).toEqual(['src/core/x.ts#K: bound is fixed but it is exported']);
    const escaped: LongLived[] = [{ ...fixedRow[0], escapes: ['return K as string[];'] }];
    const frozen = 'const K = Object.freeze([]) as string[];\nfunction f() {\n';
    expect(judgeLongLived([{ rel: 'src/core/x.ts', text: `${frozen}  return K as string[];\n}` }], escaped, has)).toEqual([]);
    expect(judgeLongLived([{ rel: 'src/core/x.ts', text: 'const K = [] as string[];\nfunction f() {\n  return K as string[];\n}' }], escaped, has)).toEqual([
      'src/core/x.ts#K: has escapes but its declaration is not Object.freeze(...)',
    ]);
    expect(judgeLongLived([{ rel: 'src/core/x.ts', text: `${frozen}  return K as number[];\n}` }], escaped, has)).toEqual([
      'src/core/x.ts#K: bound is fixed but line 3 uses it (AsExpression)',
      'src/core/x.ts#K: bound is fixed but escape line not found: return K as string[];',
    ]);
    expect(judgeLongLived([], rowsOk.slice(0, 1), has)).toEqual(['src/core/x.ts#byId: stale allowlist entry']);
  });

  it('2: WHEN the two Sets from #202 are scanned THEN they appear in the allowlist with `cap 5000` and the #202 test file', () => {
    const fix = 'src/core/simperium-removed-note-fix.ts';
    const mw = 'vendor/simplenote/state/simperium/middleware.ts';
    const rows = ALLOWED_LONG_LIVED.filter((a) => (a.file === fix && a.name === 'removed') || (a.file === mw && a.name === 'hasRequestedRevisions'));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.bound).toBe('cap 5000');
      expect(r.test).toBe('test/core/id-set-caps.test.ts');
      expect(r.decl).toBeDefined();
    }
    const files = sources().filter((f) => f.rel === fix || f.rel === mw);
    expect(files).toHaveLength(2);
    expect(judgeLongLived(files, rows)).toEqual([]);
    expect(files.find((f) => f.rel === fix)?.text).toContain('export const REMOVED_ID_CAP = 5000;');
    expect(files.find((f) => f.rel === mw)?.text).toContain('export const REVISION_ID_CAP = 5000;');
    // a Set that is renamed or moved no longer matches its row, so the row reports itself stale
    const moved = files.map((f) => ({ rel: f.rel, text: f.text.replace('const removed = new Set<string>();', 'const gone = new Set<string>();') }));
    expect(judgeLongLived(moved, rows)).toEqual([`${fix}#removed: stale allowlist entry`]);
  });

  it('3: WHEN a scratch module adds `const seen = new Set<string>()` at module level THEN the guard reports it', () => {
    const scratch = [{ rel: 'src/core/scratch.ts', text: "import { x } from './x';\n\nconst seen = new Set<string>();\nexport function f(): void {\n  seen.add(x);\n}\n" }];
    expect(longLived('src/core/scratch.ts', scratch[0].text)).toEqual([{ name: 'seen', line: 3 }]);
    expect(judgeLongLived(scratch, [])).toEqual(['src/core/scratch.ts:3: long-lived collection "seen" has no allowlist entry naming its bound']);
    expect(judgeLongLived([...sources(), ...scratch])).toEqual(['src/core/scratch.ts:3: long-lived collection "seen" has no allowlist entry naming its bound']);
  });

  it('4: WHEN a function-local collection is declared THEN it is not reported (it dies with the call)', () => {
    const text = [
      'export function f(): number {',
      '  const seen = new Set<string>();',
      '  const rows: string[] = [];',
      '  let m = new Map<string, number>();',
      '  return seen.size + rows.length + m.size;',
      '}',
      'export const g = (): number => {',
      '  const s = new Set<number>();',
      '  return s.size;',
      '};',
      'export class K {',
      '  run(): number {',
      '    const local = new Map();',
      '    this.later = [];',
      '    return local.size;',
      '  }',
      '}',
    ].join('\n');
    expect(longLived('src/core/local.ts', text)).toEqual([]);
    expect(judgeLongLived([{ rel: 'src/core/local.ts', text }], [])).toEqual([]);
  });
});
