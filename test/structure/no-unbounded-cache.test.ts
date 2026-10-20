/**
 * Issue #82: no unbounded cache keyed by note text can come back (#32, the
 * marketplace reviewer's finding on #11324). A module-level `new Map(` in
 * src/ or vendor/simplenote/ needs an allowlist entry that names its bound,
 * and no map is keyed by a note's `content` or `body`. The shipped bundle is
 * checked in test/packaging/plugin-dist.test.ts (test 6).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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
