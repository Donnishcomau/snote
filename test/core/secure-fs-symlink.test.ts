/**
 * #194: snote never writes through a symlink. A link planted
 * at a `.tmp` path or at the final file name must leave the link's target
 * untouched, and the save must still land as a regular 0600 file.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { secureWriteFileSync } from '../../src/core/secure-fs';
import { recordAccountId } from '../../src/core/account-id';

// Wraps the real helper so a test can see which path each call received.
vi.mock('../../src/core/secure-fs', async (orig) => {
  const m = await orig<typeof import('../../src/core/secure-fs')>();
  return { ...m, secureWriteFileSync: vi.fn(m.secureWriteFileSync) };
});
import { makeStore } from '../../src/core/store';
import { saveState } from '../../src/core/persistence';
import { trackUnsynced } from '../../src/core/unsynced';
import { createSentChanges } from '../../src/core/sent-changes';
import { saveTombstones } from '../../src/core/tombstones';
import { FileGhostStore } from '../../src/core/ghost-store';
import { writeStatusFile } from '../../src/core/status-file';
import type { Status } from '../../src/core/status-file';
import { requestNewNote } from '../../src/core/new-request';
import { recordBlogSend } from '../../src/core/blog-sent';
import { checkRemoteVersion } from '../../src/core/update-check';
import type { GitRunner } from '../../src/core/update-check';

const VICTIM_TEXT = 'victim-original';
const VICTIM_MODE = 0o644;

let root: string;
let dir: string;
let victim: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-nofollow-'));
  dir = path.join(root, 'data');
  fs.mkdirSync(dir);
  victim = path.join(root, 'victim.txt');
  fs.writeFileSync(victim, VICTIM_TEXT);
  fs.chmodSync(victim, VICTIM_MODE);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const victimIntact = (): boolean =>
  fs.readFileSync(victim, 'utf8') === VICTIM_TEXT &&
  (fs.statSync(victim).mode & 0o777) === VICTIM_MODE;

const plant = (name: string): void => {
  fs.symlinkSync(victim, path.join(dir, name));
};

const isRegular0600 = (name: string): boolean => {
  const st = fs.lstatSync(path.join(dir, name));
  return st.isFile() && !st.isSymbolicLink() && (st.mode & 0o777) === 0o600;
};

const fakeStatus = (): Status =>
  ({ v: 1, state: 'running', pid: 1, notes: 0 }) as unknown as Status;

const stubStore = () => {
  const state = {
    simperium: { pendingNotes: { n1: true } },
    data: { notes: new Map([['n1', { modificationDate: 5 }]]) },
  };
  return {
    getState: () => state as never,
    subscribe: () => () => {},
  };
};

/** Each writer, run once; returns the final file name it must produce. */
const writers: Array<[string, () => void]> = [
  ['state.json', () => saveState(makeStore({ stubClient: {} }).getState(), dir)],
  ['unsynced.json', () => trackUnsynced(stubStore(), dir).settle()],
  ['sent-changes.json', () => createSentChanges(dir).sent('n1', 'c1')],
  ['tombstones.json', () => saveTombstones(dir, ['n1'])],
  ['ghosts-note.json', () => void new FileGhostStore(dir, 'note').put('n1', 1, {})],
  ['status.json', () => writeStatusFile(dir, fakeStatus())],
  [
    'new-note.request',
    () => {
      fs.writeFileSync(path.join(dir, 'instance.lock'), String(process.ppid));
      expect(requestNewNote(dir)).toBe('sent');
    },
  ],
];

describe('#194 no-follow writes', () => {
  it('1: WHEN a symlink sits at the .tmp path of state, unsynced, sent-changes, tombstones, ghosts, status and new-note request THEN each save leaves the link target unchanged and the final file is a regular `0600` file', () => {
    for (const [name, write] of writers) {
      plant(name + '.tmp');
      write();
      expect(victimIntact(), name).toBe(true);
      expect(isRegular0600(name), name).toBe(true);
      expect(fs.existsSync(path.join(dir, name + '.tmp')), name).toBe(false);
    }
  });

  it('2: WHEN a symlink sits at blog-sent.json or the update tag cache file THEN the record lands in a regular `0600` file and the link target is unchanged', async () => {
    plant('blog-sent.json');
    recordBlogSend(dir, 'n1', { postId: 'p1', url: 'https://x.invalid/p1', sentAt: '2026-10-22T00:00:00Z' });
    expect(victimIntact()).toBe(true);
    expect(isRegular0600('blog-sent.json')).toBe(true);

    const home = path.join(root, 'home');
    const clone = path.join(root, 'clone');
    fs.mkdirSync(path.join(clone, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(clone, '.git', 'config'),
      '[remote "origin"]\n\turl = https://example.invalid/snote.git\n'
    );
    fs.mkdirSync(home);
    fs.symlinkSync(victim, path.join(home, 'update-tag-check.json'));
    const run: GitRunner = async () => ({
      code: 0,
      stdout: `${'b'.repeat(40)}\trefs/tags/v9.9.9\n`,
    });
    const got = await checkRemoteVersion({ cloneDir: clone, env: {}, run, stateDir: home });
    expect(got?.version).toBe('9.9.9');
    expect(victimIntact()).toBe(true);
    const st = fs.lstatSync(path.join(home, 'update-tag-check.json'));
    expect(st.isFile() && (st.mode & 0o777) === 0o600).toBe(true);
  });

  it('3: WHEN a regular file with mode 0644 and a stale .tmp file sit at the target THEN secureWriteFileSync writes the new content, the file has mode `0600` and no .tmp is left', () => {
    const target = path.join(dir, 'x.json');
    fs.writeFileSync(target, 'old');
    fs.chmodSync(target, 0o644);
    fs.writeFileSync(target + '.tmp', 'stale');
    secureWriteFileSync(target, 'new');
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(target + '.tmp')).toBe(false);
  });

  it('4: WHEN the tombstones .tmp path is a dangling symlink THEN saveTombstones does not create the path it points to and tombstones.json holds the new ids', () => {
    const missing = path.join(root, 'not-there.txt');
    fs.symlinkSync(missing, path.join(dir, 'tombstones.json.tmp'));
    saveTombstones(dir, ['n9']);
    expect(fs.existsSync(missing)).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'tombstones.json'), 'utf8')).toBe('["n9"]');
  });

  it('5: WHEN tombstones.json is a directory THEN saveTombstones throws and leaves no tombstones.json.tmp behind', () => {
    fs.mkdirSync(path.join(dir, 'tombstones.json'));
    expect(() => saveTombstones(dir, ['n9'])).toThrow();
    expect(fs.existsSync(path.join(dir, 'tombstones.json.tmp'))).toBe(false);
  });

  it('6: WHEN recordAccountId writes account.json THEN secureWriteFileSync receives the final account.json path, the folder holds only `account.json` (no .tmp and no .tmp.tmp) and a symlink planted at account.json.tmp leaves its target unchanged', () => {
    const folder = path.join(dir, 'acct');
    fs.mkdirSync(folder);
    plant('acct/account.json.tmp');
    vi.mocked(secureWriteFileSync).mockClear();
    recordAccountId(folder, 'a@b.invalid');
    const paths = vi.mocked(secureWriteFileSync).mock.calls.map((c) => c[0]);
    expect(paths).toEqual([path.join(folder, 'account.json')]);
    expect(fs.readdirSync(folder)).toEqual(['account.json']);
    expect(victimIntact()).toBe(true);
  });
});
