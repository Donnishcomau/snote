/**
 * #895: after a sign-out no ghost store of the old account writes a ghosts-*.json: not into a removed
 * account folder (also for a bucket with no ghost file yet), and not into a folder the logout sweep kept. A folder
 * missing at the start is still made on the first write (test/core/ghost-store-missing-dir.test.ts 1 and 3), and a
 * store made after the sweep (the next sign-in) writes as before. Tests 4 and 5: the same holds
 * after a server-forced sign-out, whether nothing was kept (the full sweep) or the account's files were kept.
 * Tests 6 to 8 (fake timers): a put's delayed (coalesced) write that is due after the sign-out writes nothing either.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileGhostStore } from '../../src/core/ghost-store';
import { logout, signOutByServer } from '../../src/core/token';

const ghostFiles = (dir: string): string[] => fs.readdirSync(dir).filter((n) => n.startsWith('ghosts-'));

describe('#895 no ghost write after a sign-out', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-895g-'));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('1: WHEN a ghost store for the bucket `preferences` is made on an existing account folder with no ghost file, the folder is then removed as a sign-out does, and the change version `cv1` and a put of `p1` are saved THEN the folder does not exist', async () => {
    const dir = path.join(tmp, 'acct');
    fs.mkdirSync(dir);
    const store = new FileGhostStore(dir, 'preferences');

    fs.rmSync(dir, { recursive: true, force: true });
    await store.setChangeVersion('cv1');
    await store.put('p1', 1, {});

    expect(fs.existsSync(dir)).toBe(false);
  });

  it('2: WHEN a ghost store for `note` has written `ghosts-note.json` in an account folder that also holds `keep.txt`, the logout sweep runs on the data folder and then the change version `cv2` and a put of `n1` are saved THEN the folder still holds `keep.txt` and no ghosts-*.json', async () => {
    const dir = path.join(tmp, 'acct');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'not snote');
    const store = new FileGhostStore(dir, 'note');
    await store.setChangeVersion('cv1');
    expect(ghostFiles(dir)).toEqual(['ghosts-note.json']);

    await logout(tmp);
    await store.setChangeVersion('cv2');
    await store.put('n1', 1, {});

    expect(fs.readdirSync(dir)).toEqual(['keep.txt']);
  });

  it('3: WHEN the logout sweep has run and a new ghost store for `note` is made on the account folder afterwards (the next sign-in) and saves the change version `cv3` THEN `ghosts-note.json` holds `cv3`', async () => {
    const dir = path.join(tmp, 'acct');
    fs.mkdirSync(dir);
    await logout(tmp);
    fs.mkdirSync(dir, { recursive: true });
    const store = new FileGhostStore(dir, 'note');
    await store.setChangeVersion('cv3');

    expect(JSON.parse(fs.readFileSync(path.join(dir, 'ghosts-note.json'), 'utf8')).cv).toBe('cv3');
  });

  it('4: WHEN a ghost store for `note` has written `ghosts-note.json` in an account folder that also holds `keep.txt` and nothing kept, the server signs the account out and then the change version `cv2` and a put of `n1` are saved THEN the sign-out returns no notice and the folder still holds `keep.txt` and no ghosts-*.json', async () => {
    const dir = path.join(tmp, 'acct');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'not snote');
    const store = new FileGhostStore(dir, 'note');
    await store.setChangeVersion('cv1');
    expect(ghostFiles(dir)).toEqual(['ghosts-note.json']);

    const notice = signOutByServer(tmp, dir);
    await store.setChangeVersion('cv2');
    await store.put('n1', 1, {});

    expect(notice).toBeNull();
    expect(fs.readdirSync(dir)).toEqual(['keep.txt']);
  });

  it('5: WHEN a ghost store for `note` has saved the change version `cv1` in an account folder whose `unsynced.json` keeps the note `n1`, the server signs the account out and then the change version `cv2` and a put of `n2` are saved THEN the notice says `1 unsynced change is kept in acct` and `ghosts-note.json` still holds `cv1`', async () => {
    const dir = path.join(tmp, 'acct');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'unsynced.json'), JSON.stringify({ n1: { content: 'kept edit' } }));
    const store = new FileGhostStore(dir, 'note');
    await store.setChangeVersion('cv1');

    const notice = signOutByServer(tmp, dir);
    await store.setChangeVersion('cv2');
    await store.put('n2', 1, {});

    expect(notice).toContain('1 unsynced change is kept in acct');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'ghosts-note.json'), 'utf8')).cv).toBe('cv1');
  });

  it('6: WHEN a ghost store for `note` has saved the change version `cv1` in an account folder whose `unsynced.json` keeps the note `n1`, a put of `n2` right after it waits for the delayed write, the server signs the account out and 100 ms pass THEN `ghosts-note.json` still holds `cv1` and no ghost', async () => {
    vi.useFakeTimers();
    const dir = path.join(tmp, 'acct');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'unsynced.json'), JSON.stringify({ n1: { content: 'kept edit' } }));
    const store = new FileGhostStore(dir, 'note');
    await store.setChangeVersion('cv1');
    await store.put('n2', 1, { content: 'server text' });
    expect(vi.getTimerCount()).toBe(1);

    const notice = signOutByServer(tmp, dir);
    vi.advanceTimersByTime(100);

    expect(vi.getTimerCount()).toBe(0);
    expect(notice).toContain('1 unsynced change is kept in acct');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'ghosts-note.json'), 'utf8'))).toEqual({ version: 1, cv: 'cv1', ghosts: [] });
  });

  it('7: WHEN a ghost store for `note` has saved the change version `cv1` in an account folder that also holds `keep.txt` and nothing kept, a put of `n1` right after it waits for the delayed write, the server signs the account out, a new ghost store for `note` (the next sign-in) saves `cv3` and 100 ms pass THEN `ghosts-note.json` holds `cv3` and no ghost', async () => {
    vi.useFakeTimers();
    const dir = path.join(tmp, 'acct');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'not snote');
    const store = new FileGhostStore(dir, 'note');
    await store.setChangeVersion('cv1');
    await store.put('n1', 1, { content: 'server text' });
    expect(vi.getTimerCount()).toBe(1);

    const notice = signOutByServer(tmp, dir);
    const next = new FileGhostStore(dir, 'note');
    await next.setChangeVersion('cv3');
    vi.advanceTimersByTime(100);

    expect(vi.getTimerCount()).toBe(0);
    expect(notice).toBeNull();
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'ghosts-note.json'), 'utf8'))).toEqual({ version: 1, cv: 'cv3', ghosts: [] });
  });

  it('8: WHEN a ghost store for `note` has saved the change version `cv1` in an account folder that also holds `keep.txt`, a put of `n1` right after it waits for the delayed write, the logout sweep runs on the data folder and 100 ms pass THEN the folder still holds `keep.txt` and no ghosts-*.json', async () => {
    vi.useFakeTimers();
    const dir = path.join(tmp, 'acct');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'not snote');
    const store = new FileGhostStore(dir, 'note');
    await store.setChangeVersion('cv1');
    await store.put('n1', 1, { content: 'server text' });
    expect(vi.getTimerCount()).toBe(1);

    await logout(tmp);
    vi.advanceTimersByTime(100);

    expect(vi.getTimerCount()).toBe(0);
    expect(fs.readdirSync(dir)).toEqual(['keep.txt']);
  });
});
