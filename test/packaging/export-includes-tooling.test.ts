/**
 * #226: the public export carries every script its exported tests run. scripts/publish-export.sh copies a fixed
 * INCLUDE list; a test that runs, reads or imports a scripts/ file left out of it fails in the public tree (the
 * miss: test/packaging/release-manifest.test.ts is exported, scripts/release-manifest.sh was not).
 * The list of scripts each exported test uses is derived from the test text, not written by hand: a quoted
 * `scripts/<file>` path, `'scripts', '<file>'` inside a join() or `${root}/scripts/<file>` in a template, on a line that spawns, reads, joins, imports or
 * checks a path. A use that is skipped when the script is absent (`skipIf(!existsSync(` or `if (existsSync(` within
 * two lines) is allowed: scripts/publish-export.sh itself is private, and so is this test's own use of it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EXPORT_SCRIPT = 'scripts/publish-export.sh';
const USE_LINE = /spawnSync|execFileSync|execSync|spawn\(|readFileSync|existsSync|join\(|import |require\(/;
const PATH_REF = /['"](?:\.\.\/)*scripts\/([\w.-]+)['"]|['"]scripts['"],\s*['"]([\w.-]+)['"]|\}\/scripts\/([\w.-]+)`/g;
const GUARD = /skipIf\(!existsSync\(|if \(existsSync\(/;

/** #275: the paths of the scripts/export.d/<kind> entry files (line 1 of each), which the export script reads. */
function entries(kind: 'include' | 'exclude'): string[] {
  const dir = `scripts/export.d/${kind}`;
  expect(existsSync(dir), dir).toBe(true);
  return readdirSync(dir).map((f) => readFileSync(`${dir}/${f}`, 'utf8').split('\n')[0] ?? '');
}

const covers = (list: string[], p: string): boolean => list.some((e) => p === e || p.startsWith(e + '/'));

/** Every scripts/ file a test text uses, and whether each use is skipped when that file is absent. */
function scriptUses(text: string): Array<{ path: string; guarded: boolean }> {
  const lines = text.split('\n');
  const out: Array<{ path: string; guarded: boolean }> = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || !USE_LINE.test(line)) return;
    for (const m of line.matchAll(PATH_REF)) {
      const path = `scripts/${m[1] ?? m[2] ?? m[3]}`;
      const near = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
      out.push({ path, guarded: GUARD.test(near) });
    }
  });
  return out;
}

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...testFiles(p));
    else if (/\.(ts|tsx|mts|mjs|js|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe.skipIf(!existsSync(EXPORT_SCRIPT))('#226 the public export carries the scripts its tests run', () => {
  const present = existsSync(EXPORT_SCRIPT);
  const include = present ? entries('include') : [];
  const exclude = present ? entries('exclude') : [];
  const exported = testFiles('test').filter((f) => covers(include, f) && !covers(exclude, f));

  it('1: WHEN every exported test file is scanned for the `scripts/` files it runs, reads or imports THEN each one that exists is in the INCLUDE list of `scripts/publish-export.sh`, unless that use is skipped with `existsSync` when the script is absent', () => {
    expect(exported.length).toBeGreaterThan(100);
    const missing: string[] = [];
    let seen = 0;
    for (const f of exported) {
      for (const u of scriptUses(readFileSync(f, 'utf8'))) {
        if (!existsSync(u.path)) continue;
        seen += 1;
        if (!covers(include, u.path) && !u.guarded) missing.push(`${f} uses ${u.path}`);
      }
    }
    expect(seen).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });

  it('2: WHEN `test/packaging/release-manifest.test.ts` is scanned THEN the scripts it uses are exactly `scripts/build-plugin-dist.mjs`, `scripts/check-allowed-signers.mjs` and `scripts/release-manifest.sh`, and all three are in INCLUDE', () => {
    expect(exported).toContain('test/packaging/release-manifest.test.ts');
    const used = [...new Set(scriptUses(readFileSync('test/packaging/release-manifest.test.ts', 'utf8')).map((u) => u.path))].sort();
    expect(used).toEqual(['scripts/build-plugin-dist.mjs', 'scripts/check-allowed-signers.mjs', 'scripts/release-manifest.sh']);
    for (const p of used) expect(include, `${p} in INCLUDE`).toContain(p);
  });

  it('3: WHEN a use of a script sits beside `skipIf(!existsSync(` or `if (existsSync(` THEN it counts as guarded; the same use with no guard counts as unguarded, a mention inside `not.toContain` or a comment is not a use, and the uses of `scripts/publish-export.sh` in the exported tests are guarded', () => {
    const guarded = scriptUses("it.skipIf(!existsSync('scripts/private-tool.sh'))('x', () => {\n  readFileSync('scripts/private-tool.sh', 'utf8');\n});");
    expect(guarded.map((u) => u.guarded)).toEqual([true, true]);
    const viaVar = scriptUses("const s = join(process.cwd(), 'scripts/private-tool.sh');\nif (existsSync(s)) {\n  readFileSync(s, 'utf8');\n}");
    expect(viaVar).toEqual([{ path: 'scripts/private-tool.sh', guarded: true }]);
    const bare = scriptUses("const out = spawnSync('bash', [join(root, 'scripts', 'private-tool.sh')]);\nexpect(out.status).toBe(0);");
    expect(bare).toEqual([{ path: 'scripts/private-tool.sh', guarded: false }]);
    expect(scriptUses("// runs scripts/private-tool.sh\nexpect(readme).not.toContain('scripts/private-tool.sh');")).toEqual([]);
    const real = ['test/packaging/plugin-dist-export.test.ts', 'test/structure/bounded-request-only.test.ts'].flatMap((f) =>
      scriptUses(readFileSync(f, 'utf8')).filter((u) => u.path === EXPORT_SCRIPT),
    );
    expect(real.length).toBeGreaterThanOrEqual(3);
    expect(real.every((u) => u.guarded)).toBe(true);
  });
});
