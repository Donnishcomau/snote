/**
 * (#457, SECURITY MUST 6): the update check's in-clone `git cat-file -e`
 * and `git merge-base --is-ancestor` calls carry the five `-c` pairs the remote
 * calls carry, before the subcommand. A recording runner double sees every argv.
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

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f304-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const run = async (answers: { catFile: number; mergeBase: number }): Promise<{ argvs: string[][]; cwds: string[] }> => {
  const cloneDir = path.join(tmpRoot, 'clone');
  fs.mkdirSync(path.join(cloneDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(cloneDir, '.git', 'config'), '[remote "origin"]\n\turl = https://example.invalid/snote.git\n');
  const stateDir = path.join(tmpRoot, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const argvs: string[][] = [];
  const cwds: string[] = [];
  const runner: GitRunner = async (args, opts) => {
    argvs.push(args);
    cwds.push(opts.cwd);
    if (args.includes('ls-remote')) return { code: 0, stdout: 'bbb\tHEAD\n' };
    if (args.includes('rev-parse')) return { code: 0, stdout: 'aaa\n' };
    if (args.includes('cat-file')) return { code: answers.catFile, stdout: '' };
    if (args.includes('merge-base')) return { code: answers.mergeBase, stdout: '' };
    return { code: 0, stdout: '' };
  };
  await checkRemoteUpdate({ cloneDir, stateDir, env: {}, now: 1000000, run: runner });
  return { argvs, cwds };
};

describe('update-check-clone-flags', () => {
  it('1: WHEN the check asks the clone whether it has the remote commit THEN the cat-file argv is the five MUST 6 -c pairs, then `cat-file`, `-e` and the commit', async () => {
    const { argvs } = await run({ catFile: 1, mergeBase: 0 });
    const call = argvs.find((a) => a.includes('cat-file'));
    expect(call).toEqual([...MUST_6, 'cat-file', '-e', 'bbb^{commit}']);
  });

  it('2: WHEN the clone has the remote commit THEN the merge-base argv is the five MUST 6 -c pairs, then `merge-base`, `--is-ancestor`, the local and the remote head', async () => {
    const { argvs } = await run({ catFile: 0, mergeBase: 0 });
    const call = argvs.find((a) => a.includes('merge-base'));
    expect(call).toEqual([...MUST_6, 'merge-base', '--is-ancestor', 'aaa', 'bbb']);
  });

  it('3: WHEN both in-clone calls ran THEN they ran in the clone directory', async () => {
    const { argvs, cwds } = await run({ catFile: 0, mergeBase: 0 });
    const idx = argvs.map((a, i) => (a.includes('cat-file') || a.includes('merge-base') ? i : -1)).filter((i) => i >= 0);
    expect(idx).toHaveLength(2);
    for (const i of idx) expect(cwds[i]).toBe(path.join(tmpRoot, 'clone'));
  });
});
