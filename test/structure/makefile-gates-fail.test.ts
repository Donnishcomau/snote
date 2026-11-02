import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const makefile = fs.readFileSync(path.resolve(process.cwd(), 'Makefile'), 'utf8');
const RECIPES = ['check', 'check-ci', 'check-fast', 'check-post'];
let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** The tab-indented lines of the named recipes that run the keymap or ANSI gate, leading tab and `@` removed. */
function gateLines(): string[] {
  const out: string[] = [];
  let cur = '';
  for (const l of makefile.split('\n')) {
    const m = /^([A-Za-z0-9_-]+):/.exec(l);
    if (m) cur = m[1];
    if (RECIPES.includes(cur) && l.startsWith('\t') && /test:keymap|lint:ansi|keymap gate|ansi gate/.test(l)) {
      out.push(l.replace(/^\t@?/, ''));
    }
  }
  return out;
}

/** Run one line by bash -c in a temp dir with a fake npm first on PATH; `files` are created empty in the dir. */
function run(line: string, files: string[], npmExit: number): { status: number | null; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'makefile-gates-'));
  dirs.push(dir);
  const bin = path.join(dir, '.fakebin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\nexit ${npmExit}\n`, { mode: 0o755 });
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), '');
  }
  const r = spawnSync('bash', ['-c', line], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

describe('#406 Makefile gates fail when the gate fails', () => {
  it('5: WHEN every tab-indented recipe line of the Makefile is read THEN `0` lines hold `&&` followed later on the line by `|| echo`', () => {
    const bad = makefile.split('\n').filter((l) => l.startsWith('\t') && /&&.*\|\| echo/.test(l));
    expect(bad).toEqual([]);
  });

  it('6: WHEN each of the `8` keymap and ANSI lines of the `check`, `check-ci`, `check-fast` and `check-post` recipes (leading tab and `@` removed) is run by `bash -c` in a temp dir that holds test/keymap.test.ts and scripts/lint-ansi.mjs, with an `npm` on PATH that exits `1` THEN every line exits non-zero and prints no `skip:`', () => {
    const lines = gateLines();
    expect(lines.length).toBe(8);
    for (const l of lines) {
      const r = run(l, ['test/keymap.test.ts', 'scripts/lint-ansi.mjs'], 1);
      expect(r.status, l).not.toBe(0);
      expect(r.status, l).not.toBeNull();
      expect(r.out, l).not.toContain('skip:');
    }
  });

  it('7: WHEN the same `8` lines run in a temp dir that holds neither file THEN each exits `0` and prints exactly `skip: keymap gate (T16)` or `skip: ansi gate (T12)` and a newline', () => {
    const lines = gateLines();
    expect(lines.length).toBe(8);
    for (const l of lines) {
      const r = run(l, [], 1);
      expect(r.status, l).toBe(0);
      const want = l.includes('keymap') ? 'skip: keymap gate (T16)\n' : 'skip: ansi gate (T12)\n';
      expect(r.out, l).toBe(want);
    }
  });
});
