/**
 * #369: the Makefile still supports SHARD, and scripts/shard-files.mjs still computes and verifies shards. CI itself
 * runs one job since #400 (see ci-lean.test.ts). check.yml is read as text; the Makefile is dry-run;
 * scripts/shard-files.mjs is run for real.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/check.yml', 'utf8');
const lines = workflow.split('\n');
const tmp = mkdtempSync(join(tmpdir(), 'snote-369-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function dryRun(args: string[]): string[] {
  const env = { ...process.env };
  // a parent `make X=Y` exports its command-line variables through MAKEFLAGS (CI runs this file inside one)
  for (const k of ['SHARD', 'SHARD_REPORT', 'MAKEFLAGS', 'MFLAGS', 'MAKELEVEL']) delete env[k];
  const r = spawnSync('make', ['-n', 'check-ci', ...args], { encoding: 'utf8', env });
  expect(r.status).toBe(0);
  return r.stdout.split('\n');
}

function shardFiles(args: string[]): { status: number | null; out: string } {
  const env = { ...process.env };
  delete env.SHARD;
  const r = spawnSync('node', ['scripts/shard-files.mjs', ...args], { encoding: 'utf8', env });
  return { status: r.status, out: r.stdout };
}

describe('ci shards', () => {
  it('3: WHEN the Makefile is dry-run as `make -n check-ci SHARD=2/3` THEN the vitest line contains `--shard=2/3`, and WHEN dry-run as `make -n check-ci` THEN no line contains `--shard`', () => {
    const sharded = dryRun(['SHARD=2/3']);
    const vitest = sharded.filter((l) => l.includes('npx vitest run'));
    expect(vitest).toHaveLength(1);
    expect(vitest[0]).toContain('--shard=2/3');
    expect(dryRun([]).filter((l) => l.includes('--shard'))).toEqual([]);
  });

  it('6: WHEN check.yml is read THEN `permissions:` is followed by `  contents: read` before `jobs:`, and no line under jobs sets `permissions`', () => {
    const p = lines.findIndex((l) => l === 'permissions:');
    const j = lines.findIndex((l) => l === 'jobs:');
    expect(p).toBeGreaterThanOrEqual(0);
    expect(lines[p + 1]).toBe('  contents: read');
    expect(p).toBeLessThan(j);
    expect(lines.slice(j).some((l) => l.includes('permissions'))).toBe(false);
  });

  it('7: WHEN check.yml is read THEN every runs-on line is exactly `    runs-on: ubuntu-latest` (a source checkout that carries the private workflow tooling may also route the one line through a repository setting that falls back to ubuntu-latest), the concurrency `group:` is exactly `check-${{ github.event.pull_request.number || github.ref }}`, `cancel-in-progress: true` is present, and no `run:` line, `env:` value or `name:` contains `github.event`, `github.head_ref` or `github.ref` (the only `${{ }}` inside a run line is `matrix.shard`)', () => {
    const runsOn = lines.filter((l) => l.includes('runs-on'));
    expect(runsOn.length).toBeGreaterThan(0);
    // the one extra line is allowed only in a checkout that carries the private workflow tooling; the file name and the setting name are assembled so this text names neither
    const tooling = join('scripts', ['export', 'workflows.sh'].join('-'));
    const routedLine = '    runs-on: ${{ vars.' + ['CI', 'RUNNER'].join('_') + " || 'ubuntu-latest' }}";
    const allowed = ['    runs-on: ubuntu-latest'];
    if (existsSync(tooling)) allowed.push(routedLine);
    for (const l of runsOn) expect(allowed).toContain(l);
    expect(lines).toContain('  group: check-${{ github.event.pull_request.number || github.ref }}');
    expect(lines).toContain('  cancel-in-progress: true');
    const jobsIdx = lines.findIndex((l) => l === 'jobs:');
    const under = lines.slice(jobsIdx).filter((l) => /^\s*(- )?(run|name):/.test(l) || /^\s{10}[A-Z_]+:/.test(l));
    for (const l of under) {
      expect(l).not.toContain('github.event');
      expect(l).not.toContain('github.head_ref');
      expect(l).not.toContain('github.ref');
    }
    for (const l of lines.filter((x) => /^\s*(- )?run:/.test(x))) {
      const exprs = l.match(/\$\{\{[^}]*\}\}/g) ?? [];
      for (const e of exprs) expect(e).toBe('${{ matrix.shard }}');
    }
  });

  it('8: WHEN `scripts/shard-files.mjs` computes shards `1/3`, `2/3` and `3/3` and the unsharded list THEN every shard list is non-empty, no file is in two shards, and the union of the three equals the unsharded list exactly (test timeout 60000 ms; it imports no test file)', () => {
    const shards = ['1/3', '2/3', '3/3'].map((k) => {
      const r = shardFiles([k]);
      expect(r.status).toBe(0);
      return r.out.split('\n').filter(Boolean);
    });
    const all = shardFiles([]);
    expect(all.status).toBe(0);
    const whole = all.out.split('\n').filter(Boolean);
    for (const s of shards) expect(s.length).toBeGreaterThan(0);
    const union = shards.flat();
    expect(new Set(union).size).toBe(union.length);
    expect([...union].sort()).toEqual([...whole].sort());
    expect(whole.length).toBeGreaterThan(100);
  }, 60000);

  it('11: WHEN `make -n check-ci SHARD=2/3` is run THEN the only line containing `--shard` is the vitest line, it appears once, and the typecheck, lint, `.only/.skip` grep, keymap, ansi and gates.sh lines are all still present (a shard must not skip a gate)', () => {
    const out = dryRun(['SHARD=2/3']);
    const withShard = out.filter((l) => l.includes('--shard'));
    expect(withShard).toHaveLength(1);
    expect(withShard[0]).toContain('npx vitest run');
    const text = out.join('\n');
    expect(text).toContain('npm run -s typecheck');
    expect(text).toContain('npm run -s lint\n');
    expect(text).toContain('\\.only\\(|\\.skip\\(');
    expect(text).toContain('npm run -s test:keymap');
    expect(text).toContain('npm run -s lint:ansi');
    // the gates line must be the base's unconditional one: no SHARD test in front of it
    const gates = out.filter((l) => l.includes('bash scripts/gates.sh'));
    expect(gates).toHaveLength(1);
    expect(gates[0].startsWith('if [ -f scripts/gates.sh ]; then bash scripts/gates.sh;')).toBe(true);
  });

  it('13: WHEN `--verify` gets a JSON report fixture whose files equal the computed shard `2/3` THEN it exits 0 and prints `SHARD VERIFIED 2/3`; WHEN the fixture lacks one of those files, or adds one from shard `1/3`, or is empty THEN it exits 1 and prints `SHARD MISMATCH 2/3`', () => {
    const two = shardFiles(['2/3']).out.split('\n').filter(Boolean);
    const one = shardFiles(['1/3']).out.split('\n').filter(Boolean);
    expect(two.length).toBeGreaterThan(1);
    expect(one.length).toBeGreaterThan(0);
    let n = 0;
    const verify = (names: string[]) => {
      n += 1;
      const f = join(tmp, `report-${n}.json`);
      writeFileSync(f, JSON.stringify({ testResults: names.map((x) => ({ name: resolve(x) })) }));
      const env = { ...process.env };
      delete env.SHARD;
      const r = spawnSync('node', ['scripts/shard-files.mjs', '--verify', f, '2/3'], { encoding: 'utf8', env });
      return { status: r.status, out: r.stdout };
    };
    const ok = verify(two);
    expect(ok.status).toBe(0);
    expect(ok.out).toContain('SHARD VERIFIED 2/3');
    for (const bad of [two.slice(1), [...two, one[0]], []]) {
      const r = verify(bad);
      expect(r.status).toBe(1);
      expect(r.out).toContain('SHARD MISMATCH 2/3');
    }
  }, 60000);

});
