// #219 (R1): the git run of the update check has a time limit and an output cap, and a git that prints
// without end is "no answer" (code null), not a hang.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ options: [] as Record<string, unknown>[] }));
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>();
  return {
    ...real,
    execFile: (...args: unknown[]) => {
      seen.options.push(args.find((a) => typeof a === 'object' && a !== null && !Array.isArray(a)) as Record<string, unknown>);
      return (real.execFile as (...a: unknown[]) => unknown)(...args);
    },
  };
});

import { defaultGitRunner } from '../../src/core/update-check';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'snote-gitcap-'));
  seen.options.length = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A fake `git` first on PATH. */
function fakeGit(body: string): NodeJS.ProcessEnv {
  const file = join(dir, 'git');
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
  return { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` };
}

describe('#219 the update check git run is limited', () => {
  it('6: WHEN update-check runs git THEN `execFile` is given a numeric `timeout` and a `maxBuffer` of `1048576` or less', async () => {
    const env = fakeGit('echo ok');
    const res = await defaultGitRunner(['status'], { cwd: dir, timeoutMs: 4000, env });
    expect(res).toEqual({ code: 0, stdout: 'ok\n' });
    expect(seen.options).toHaveLength(1);
    expect(seen.options[0]?.timeout).toBe(4000);
    const cap = seen.options[0]?.maxBuffer;
    expect(typeof cap).toBe('number');
    expect(cap as number).toBeLessThanOrEqual(1048576);
  });

  it('7: WHEN a git that prints without end runs under a `timeoutMs` of 60000 THEN the check resolves `code: null` within 2500 ms', async () => {
    const env = fakeGit('yes aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const start = Date.now();
    const res = await defaultGitRunner(['ls-remote'], { cwd: dir, timeoutMs: 60000, env });
    expect(res.code).toBeNull();
    expect(Date.now() - start).toBeLessThan(2500);
  });
});
