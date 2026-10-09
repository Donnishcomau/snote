/**
 * T480: hardening after T471 (F126). A `cat-file` step killed by its
 * timeout (code `null`) is no answer at all: it must read `unknown`
 * instead of claiming the clone lacks the remote commit. The local
 * head from `rev-parse HEAD` gets the same 1 to 64 lowercase hex
 * check as the remote head, so a malformed local head is never
 * handed to git and never announced.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { checkRemoteUpdate, type GitRunner } from '../../src/core/update-check';

let tmpRoot: string;

/**
 * A clone standing in for the plugin clone: just a `.git` directory
 * holding a safe https origin config, plus a fresh empty state dir.
 * No git runs when it is built. Built once per test under a per-test
 * temp root, so tests never touch each other's files.
 */
const makeFakeClone = (): { cloneDir: string; stateDir: string } => {
  const cloneDir = path.join(tmpRoot, 'clone');
  fs.mkdirSync(path.join(cloneDir, '.git'), { recursive: true });
  fs.writeFileSync(
    path.join(cloneDir, '.git', 'config'),
    '[remote "origin"]\n\turl = https://example.invalid/snote.git\n'
  );
  const stateDir = path.join(tmpRoot, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  return { cloneDir, stateDir };
};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t480-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/**
 * A runner double answering by `args[0]`: `ls-remote` the given head
 * text, `rev-parse` the given head text, `cat-file` the given code.
 */
const makeRunner = (answers: {
  lsRemote: string;
  revParse: string;
  catFile: number | null;
}): GitRunner => {
  return async (args) => {
    if (args[0] === 'ls-remote') {
      return { code: 0, stdout: answers.lsRemote };
    }
    if (args[0] === 'rev-parse') {
      return { code: 0, stdout: answers.revParse };
    }
    if (args[0] === 'cat-file') {
      return { code: answers.catFile, stdout: '' };
    }
    return { code: 0, stdout: '' };
  };
};

describe('update-check-hardening-3', () => {
  it("1: WHEN the double answers `ls-remote` with head `bbb`, `rev-parse` with `aaa` and `cat-file` with code `null` THEN the result is `{ state: 'unknown' }`", async () => {
    const { cloneDir, stateDir } = makeFakeClone();
    const run = makeRunner({
      lsRemote: 'bbb\tHEAD\n',
      revParse: 'aaa\n',
      catFile: null,
    });

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: {},
      now: 1000000,
      run,
    });

    expect(result).toEqual({ state: 'unknown' });
  });

  it("2: WHEN the double answers `ls-remote` with head `bbb` and `rev-parse` with `-x` THEN the result is `{ state: 'unknown' }`", async () => {
    const { cloneDir, stateDir } = makeFakeClone();
    const run = makeRunner({
      lsRemote: 'bbb\tHEAD\n',
      revParse: '-x\n',
      catFile: 0,
    });

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: {},
      now: 1000000,
      run,
    });

    expect(result).toEqual({ state: 'unknown' });
  });

  it("3: WHEN the double answers `ls-remote` with head `bbb`, `rev-parse` with `aaa` and `cat-file` with code `1` THEN the result is `{ state: 'available' }`", async () => {
    const { cloneDir, stateDir } = makeFakeClone();
    const run = makeRunner({
      lsRemote: 'bbb\tHEAD\n',
      revParse: 'aaa\n',
      catFile: 1,
    });

    const result = await checkRemoteUpdate({
      cloneDir,
      stateDir,
      env: {},
      now: 1000000,
      run,
    });

    expect(result).toEqual({ state: 'available' });
  });
});
