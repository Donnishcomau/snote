/**
 * #427: a guard that proves the uuid advisory path (GHSA-w5hq-g745-h8pq: a `buf` argument to
 * uuid v3/v5/v6) is never used. It reads text only; it never imports or runs uuid or simperium.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

type Finding = { file: string; line: number; text: string; why: string };
type Report = { uses: Finding[]; argCalls: Finding[]; v4Calls: Finding[] };

const UNSAFE = /^v(1|3|5|6)$/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseSpecifiers(list: string, sep: string): Array<[string, string]> {
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split(sep === 'as' ? /\s+as\s+/ : /\s*:\s*/).map((p) => p.trim());
      return [parts[0], parts[1] ?? parts[0]] as [string, string];
    });
}

/** The one scanner: used by the real scan (tests 1 and 2) and the hostile copies (tests 4 and 5). */
function scanText(file: string, src: string): Report {
  const report: Report = { uses: [], argCalls: [], v4Calls: [] };
  const lineOf = (idx: number) => src.slice(0, idx).split('\n').length;
  const textOf = (idx: number) => (src.split('\n')[lineOf(idx) - 1] ?? '').trim();
  const add = (kind: keyof Report, idx: number, why: string) =>
    report[kind].push({ file, line: lineOf(idx), text: textOf(idx), why });

  const namespaces = new Set<string>();
  const callables = new Set<string>();
  const bindNamed = (pairs: Array<[string, string]>, idx: number) => {
    for (const [imported, local] of pairs) {
      if (UNSAFE.test(imported)) add('uses', idx, `named ${imported}`);
      else if (imported === 'v4') callables.add(local);
      else if (imported === 'default') {
        namespaces.add(local);
        callables.add(local);
      }
    }
  };

  // Any subpath for v1, v3, v5 or v6, in any form of import or require.
  for (const m of src.matchAll(/['"]uuid\/(v1|v3|v5|v6)(?:\.js)?['"]/g)) add('uses', m.index ?? 0, `subpath ${m[1]}`);
  // Dynamic import and re-exports are not tracked: treat them as a use.
  for (const m of src.matchAll(/import\s*\(\s*['"]uuid/g)) add('uses', m.index ?? 0, 'dynamic import');
  for (const m of src.matchAll(/export\s+(?:\{[^}]*\}|\*)[^;]*?from\s+['"]uuid/g)) add('uses', m.index ?? 0, 're-export');

  // ES imports.
  for (const m of src.matchAll(/import\s+([^;'"]*?)\s+from\s+['"](uuid(?:\/[^'"]*)?)['"]/g)) {
    const [, clause, mod] = m;
    const idx = m.index ?? 0;
    const sub = /^uuid\/(v\d)(?:\.js)?$/.exec(mod);
    if (sub) {
      if (sub[1] === 'v4') callables.add(clause.trim());
      continue;
    }
    if (mod !== 'uuid') continue;
    const named = /\{([^}]*)\}/.exec(clause);
    if (named) bindNamed(parseSpecifiers(named[1], 'as'), idx);
    const star = /\*\s+as\s+([\w$]+)/.exec(clause);
    if (star) namespaces.add(star[1]);
    const def = /^\s*([\w$]+)\s*(?:,|$)/.exec(clause);
    if (def) bindNamed([['default', def[1]]], idx);
  }

  // CommonJS requires, bound to a name (optionally through a wrapper such as _interopRequireDefault).
  let boundRequires = 0;
  const bound = /(?:var|const|let)\s+([\w$]+|\{[^}]*\})\s*=\s*(?:([\w$]+)\s*\(\s*)?require\(\s*['"](uuid(?:\/[^'"]*)?)['"]\s*\)/g;
  for (const m of src.matchAll(bound)) {
    boundRequires++;
    const [, binder, wrapper, mod] = m;
    const idx = m.index ?? 0;
    const sub = /^uuid\/(v\d)(?:\.js)?$/.exec(mod);
    if (sub) {
      if (sub[1] === 'v4') callables.add(wrapper ? `${binder}.default` : binder);
    } else if (mod === 'uuid') {
      if (binder.startsWith('{')) bindNamed(parseSpecifiers(binder.slice(1, -1), ':'), idx);
      else namespaces.add(binder);
    }
  }
  const allRequires = [...src.matchAll(/require\(\s*['"]uuid/g)];
  if (allRequires.length !== boundRequires) {
    for (const m of allRequires) add('uses', m.index ?? 0, 'require not bound to a name');
  }

  for (const ns of namespaces) {
    callables.add(`${ns}.v4`);
    for (const m of src.matchAll(new RegExp(`(?<![\\w$.])${esc(ns)}\\.(v1|v3|v5|v6)(?![\\w$])`, 'g'))) {
      add('uses', m.index ?? 0, `member ${m[1]}`);
    }
    for (const m of src.matchAll(new RegExp(`(?<![\\w$.])${esc(ns)}\\s*\\[`, 'g'))) {
      add('uses', m.index ?? 0, 'computed member');
    }
  }

  // Calls: with an argument is a finding (D1); without one is a counted v4 call.
  for (const expr of callables) {
    const call = new RegExp(`(?<![\\w$.])${esc(expr)}(?![\\w$])\\s*\\)?\\s*\\(\\s*(\\)?)`, 'g');
    for (const m of src.matchAll(call)) {
      add(m[1] ? 'v4Calls' : 'argCalls', m.index ?? 0, m[1] ? 'v4()' : 'v4 with an argument');
    }
  }
  return report;
}

function listFiles(dir: string, ok: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p, ok));
    else if (ok(entry.name)) out.push(p);
  }
  return out.sort();
}

function scanDirs(dirs: string[], ok: (name: string) => boolean): Report & { files: string[] } {
  const total: Report & { files: string[] } = { uses: [], argCalls: [], v4Calls: [], files: [] };
  for (const dir of dirs) {
    for (const f of listFiles(dir, ok)) {
      const r = scanText(relative(process.cwd(), f), readFileSync(f, 'utf8')); // a read error fails the test
      total.files.push(f);
      total.uses.push(...r.uses);
      total.argCalls.push(...r.argCalls);
      total.v4Calls.push(...r.v4Calls);
    }
  }
  return total;
}

const SRC_EXT = /\.(ts|tsx|js|mjs|cjs)$/;
const describeAll = (fs: Finding[]) => fs.map((f) => `${f.file}:${f.line} ${f.why}: ${f.text}`).join('\n');
const byFile = (fs: Finding[]) => {
  const counts: Record<string, number> = {};
  for (const f of fs) counts[f.file] = (counts[f.file] ?? 0) + 1;
  return counts;
};

describe('#427 uuid: fails on any buf argument or v1/v3/v5/v6 use in src, vendor or the simperium lib', () => {
  it('1: WHEN every .ts, .tsx, .js, .mjs and .cjs file under src/ and vendor/ is scanned THEN it finds `0` uses of uuid v1, v3, v5 or v6 and `0` uuid calls with an argument, and exactly `2` argument-free v4 calls, both in `vendor/simplenote/state/data/middleware.ts`', () => {
    const r = scanDirs(['src', 'vendor'], (n) => SRC_EXT.test(n));
    expect(r.files.length).toBeGreaterThan(50);
    expect(describeAll(r.uses)).toBe('');
    expect(describeAll(r.argCalls)).toBe('');
    expect(r.v4Calls).toHaveLength(2);
    expect(byFile(r.v4Calls)).toEqual({ 'vendor/simplenote/state/data/middleware.ts': 2 });
  });

  it('2: WHEN every .js file under node_modules/simperium/lib is scanned THEN it finds `0` uses of uuid v1, v3, v5 or v6 and `0` uuid calls with an argument, and exactly `5` argument-free v4 calls: `1` in `bucket.js`, `1` in `channel.js` and `3` in `util/change.js`', () => {
    const lib = 'node_modules/simperium/lib';
    const r = scanDirs([lib], (n) => n.endsWith('.js'));
    expect(r.files.length).toBeGreaterThan(5);
    expect(describeAll(r.uses)).toBe('');
    expect(describeAll(r.argCalls)).toBe('');
    expect(r.v4Calls).toHaveLength(5);
    expect(byFile(r.v4Calls)).toEqual({
      [`${lib}/simperium/bucket.js`]: 1,
      [`${lib}/simperium/channel.js`]: 1,
      [`${lib}/simperium/util/change.js`]: 3,
    });
  });

  it('3: WHEN `uuid/package.json` is resolved from node_modules/simperium THEN the path is `node_modules/uuid/package.json` (no nested copy) and its major version is `3`', () => {
    const root = process.cwd();
    const simperiumDir = join(root, 'node_modules/simperium');
    const nested = join(simperiumDir, 'node_modules/uuid/package.json');
    expect(() => readFileSync(nested, 'utf8')).toThrow();
    const resolved = join(root, 'node_modules/uuid/package.json');
    expect(relative(root, resolved)).toBe('node_modules/uuid/package.json');
    const pkg = JSON.parse(readFileSync(resolved, 'utf8'));
    expect(String(pkg.version).split('.')[0]).toBe('3');
  });

  it('4: WHEN the scan reads a temp copy of vendor/simplenote/state/data/middleware.ts in which the first `uuid()` call becomes `uuid(null, buf)` THEN it reports exactly `1` call with an argument and the report holds `buf`', () => {
    const base = process.env.TMPDIR ?? tmpdir();
    mkdirSync(base, { recursive: true });
    const dir = mkdtempSync(join(base, 'uuid-427-t4-'));
    try {
      const original = readFileSync('vendor/simplenote/state/data/middleware.ts', 'utf8');
      expect(original.split('uuid()').length - 1).toBe(2);
      const mutated = original.replace('uuid()', 'uuid(null, buf)');
      const copy = join(dir, 'middleware.ts');
      writeFileSync(copy, mutated);
      const r = scanDirs([dir], (n) => SRC_EXT.test(n));
      expect(r.argCalls).toHaveLength(1);
      expect(describeAll(r.argCalls)).toContain('buf');
      expect(r.v4Calls).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("5: WHEN the scan reads four temp files holding `import { v5 } from 'uuid'`, `require('uuid/v3')`, `(0, _uuid.v1)()` after `var _uuid = require(\"uuid\")`, and `u.v6()` after `import * as u from 'uuid'` THEN it reports at least `1` use for each of the `4` files", () => {
    const base = process.env.TMPDIR ?? tmpdir();
    mkdirSync(base, { recursive: true });
    const dir = mkdtempSync(join(base, 'uuid-427-t5-'));
    try {
      const files: Record<string, string> = {
        'a.ts': "import { v5 } from 'uuid';\nexport const x = v5('a', 'b');\n",
        'b.js': "const v3 = require('uuid/v3');\nmodule.exports = v3('a', 'b');\n",
        'c.js': 'var _uuid = require("uuid");\nvar id = (0, _uuid.v1)();\n',
        'd.ts': "import * as u from 'uuid';\nexport const y = u.v6();\n",
      };
      for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
      const names = Object.keys(files);
      expect(names).toHaveLength(4);
      for (const name of names) {
        const f = join(dir, name);
        const r = scanText(name, readFileSync(f, 'utf8'));
        expect(r.uses.length, name).toBeGreaterThanOrEqual(1);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
