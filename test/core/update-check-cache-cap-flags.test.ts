/**
 * #488: readCache refuses an update-check.json over 4096 bytes (TAG_CACHE_MAX_BYTES, as readTagCache does) and the
 * check then asks the origin as if there were no cache. #527: the local `git rev-parse HEAD` in the clone carries the
 * five MUST 6 `-c` pairs, so every git call the update check makes carries them. A recording runner double sees every argv.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { checkRemoteUpdate, type GitRunner } from '../../src/core/update-check';

// Written out here, not imported, so a change to the shared constant cannot hide a dropped flag.
const MUST_6 = [
  '-c', 'credential.helper=',
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.fsmonitor=false',
  '-c', 'protocol.allow=never',
  '-c', 'protocol.https.allow=always',
];
const NOW = 100_000_000;

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-488-527-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** A fresh (1 h old) cache naming remote head `bbb`, padded with spaces to exactly `bytes` bytes (still valid JSON). */
const cacheOf = (bytes: number): string => {
  const body = JSON.stringify({ checkedAt: NOW - 3_600_000, remoteHead: 'bbb' });
  return body + ' '.repeat(bytes - body.length);
};

const check = async (cache: string | null): Promise<{ state: string; argvs: string[][]; cwds: string[] }> => {
  const cloneDir = path.join(tmpRoot, 'clone');
  fs.mkdirSync(path.join(cloneDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(cloneDir, '.git', 'config'), '[remote "origin"]\n\turl = https://example.invalid/snote.git\n');
  const stateDir = path.join(tmpRoot, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  if (cache !== null) fs.writeFileSync(path.join(stateDir, 'update-check.json'), cache);
  const argvs: string[][] = [];
  const cwds: string[] = [];
  const runner: GitRunner = async (args, opts) => {
    argvs.push(args);
    cwds.push(opts.cwd);
    if (args.includes('ls-remote')) return { code: 0, stdout: 'ccc\tHEAD\n' };
    if (args.includes('rev-parse')) return { code: 0, stdout: 'aaa\n' };
    if (args.includes('cat-file')) return { code: 0, stdout: '' };
    if (args.includes('merge-base')) return { code: 0, stdout: '' };
    return { code: 0, stdout: '' };
  };
  const res = await checkRemoteUpdate({ cloneDir, stateDir, env: {}, now: NOW, run: runner });
  return { state: res.state, argvs, cwds };
};

describe('#488 update cache size cap, #527 rev-parse flags', () => {
  it('1: WHEN update-check.json is a fresh, valid cache naming head `bbb` padded to 4097 bytes THEN `ls-remote` runs exactly once and `merge-base` compares `aaa` with the origin head `ccc`, not `bbb` (#488)', async () => {
    const { argvs } = await check(cacheOf(4097));
    expect(argvs.filter((a) => a.includes('ls-remote'))).toHaveLength(1);
    expect(argvs.find((a) => a.includes('merge-base'))?.slice(-2)).toEqual(['aaa', 'ccc']);
  });

  it('2: WHEN the same cache is padded to exactly 4096 bytes THEN no `ls-remote` runs, `merge-base` compares `aaa` with `bbb` and the state is `available` (#488: the cap is the size, not one byte under it)', async () => {
    const { state, argvs } = await check(cacheOf(4096));
    expect(argvs.filter((a) => a.includes('ls-remote'))).toHaveLength(0);
    expect(argvs.find((a) => a.includes('merge-base'))?.slice(-2)).toEqual(['aaa', 'bbb']);
    expect(state).toBe('available');
  });

  it('3: WHEN the check reads the clone head THEN the `rev-parse` argv is exactly the five MUST 6 -c pairs, then `rev-parse` and `HEAD`, and it runs in the clone directory (#527)', async () => {
    const { argvs, cwds } = await check(null);
    const i = argvs.findIndex((a) => a.includes('rev-parse'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(argvs[i]).toEqual([...MUST_6, 'rev-parse', 'HEAD']);
    expect(cwds[i]).toBe(path.join(tmpRoot, 'clone'));
  });

  it('4: WHEN a check with no cache makes its `ls-remote`, `rev-parse`, `cat-file` and `merge-base` calls THEN all 4 calls are made and every argv starts with the five MUST 6 -c pairs (#527)', async () => {
    const { argvs } = await check(null);
    expect(argvs.map((a) => a.find((x) => ['ls-remote', 'rev-parse', 'cat-file', 'merge-base'].includes(x)))).toEqual(['ls-remote', 'rev-parse', 'cat-file', 'merge-base']);
    for (const a of argvs) expect(a.slice(0, MUST_6.length), a.join(' ')).toEqual(MUST_6);
  });
});
