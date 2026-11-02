/**
 * #247b: a start-up sweep removes the leftover temp files of the lock-protected
 * store files, only after the instance lock is held.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { acquireInstanceLock } from '../../src/core/instance-lock';
import { loadState, saveState } from '../../src/core/persistence';
import { sweepStaleTemps } from '../../src/core/token';
import { makeStore } from '../../src/core/store';
import { makeNote } from '../tui/fixtures';

import type { EntityId } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

const EIGHT = [
  'state.json.tmp',
  'tombstones.json.tmp',
  'ghosts-account.json.tmp',
  'ghosts-note.json.tmp',
  'ghosts-preferences.json.tmp',
  'ghosts-tag.json.tmp',
  'unsynced.json.tmp',
  'sent-changes.json.tmp',
];

describe('#247b start-up sweep', () => {
  let server: FakeSimperiumServer;
  let root: string;
  let dir: string;
  let stopSaving: (() => void) | undefined;
  let held: { release: () => void } | undefined;

  const build = () => {
    const result = buildStore(
      { dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      () => undefined
    );
    stopSaving = result.stopSaving;
    return result;
  };

  const writeEight = (): void => {
    for (const n of EIGHT) fs.writeFileSync(path.join(dir, n), 'LEFTOVER');
  };
  const eightHold = (text: string): boolean =>
    EIGHT.every((n) => fs.existsSync(path.join(dir, n)) && fs.readFileSync(path.join(dir, n), 'utf8') === text);
  const noneOfEight = (): boolean => EIGHT.every((n) => !fs.existsSync(path.join(dir, n)));

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-247b-'));
    dir = path.join(root, 'acct');
    fs.mkdirSync(dir);
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    held?.release();
    held = undefined;
    await server.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('1: WHEN the account folder holds `state.json.tmp`, `tombstones.json.tmp`, `ghosts-account.json.tmp`, `ghosts-note.json.tmp`, `ghosts-preferences.json.tmp`, `ghosts-tag.json.tmp`, `unsynced.json.tmp` and `sent-changes.json.tmp` (each with text `LEFTOVER`), a committed `state.json` seeded with a note `First`, a committed `unsynced.json` and `keep.txt` (text `mine`), and no other snote holds the lock, and `buildStore` runs THEN none of the eight `.tmp` files exists, `keep.txt` still holds `mine`, and `loadState(dir)` still returns the note `First`', () => {
    const seed = makeStore({ stubClient: {} });
    seed.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: 'note1' as EntityId,
      note: makeNote('note1', 'First'),
    } as A.ActionType);
    saveState(seed.getState(), dir);
    fs.writeFileSync(path.join(dir, 'unsynced.json'), '{}');
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'mine');
    writeEight();
    expect(eightHold('LEFTOVER')).toBe(true);

    build();

    expect(noneOfEight()).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8')).toBe('mine');
    expect(loadState(dir)?.data?.notes.get('note1' as never)?.content).toBe('First');
  });

  it('2: WHEN the same eight `.tmp` files exist and another holder has the instance lock (the test calls `acquireInstanceLock(dir)` first and keeps it) and `buildStore` runs THEN it throws a message containing `it holds the instance lock` and all eight `.tmp` files still exist with text `LEFTOVER`', () => {
    writeEight();
    held = acquireInstanceLock(dir);

    expect(() => build()).toThrow('it holds the instance lock');

    expect(eightHold('LEFTOVER')).toBe(true);
  });

  it('3: WHEN `state.json.tmp` is a symlink to `victim.txt` (outside the folder, text `victim`) and `buildStore` runs THEN the link no longer exists and `victim.txt` still holds `victim`', () => {
    const victim = path.join(root, 'victim.txt');
    fs.writeFileSync(victim, 'victim');
    const link = path.join(dir, 'state.json.tmp');
    fs.symlinkSync(victim, link);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);

    build();

    expect(() => fs.lstatSync(link)).toThrow();
    expect(fs.readFileSync(victim, 'utf8')).toBe('victim');
  });

  it('4: WHEN the account folder holds `new-note.request.tmp` and `account.json.tmp` (text `LIVE`) and its parent data folder holds `auth.json.tmp`, `blog.json.tmp` and `blog-sent.json.tmp` (text `LIVE`) and `buildStore` runs THEN all five still exist with text `LIVE` (they are outside the sweep set)', () => {
    const files = [
      path.join(dir, 'new-note.request.tmp'),
      path.join(dir, 'account.json.tmp'),
      path.join(root, 'auth.json.tmp'),
      path.join(root, 'blog.json.tmp'),
      path.join(root, 'blog-sent.json.tmp'),
    ];
    for (const f of files) fs.writeFileSync(f, 'LIVE');

    build();

    for (const f of files) {
      expect(fs.readFileSync(f, 'utf8')).toBe('LIVE');
    }
  });

  it('5: WHEN `instance.lock` holds the pid of a process that no longer exists (a stale lock) and the eight `.tmp` files exist and `buildStore` runs THEN it succeeds, none of the eight `.tmp` files exists and `instance.lock` holds this process\'s pid', () => {
    const dead = spawnSync(process.execPath, ['-e', '']).pid as number;
    fs.writeFileSync(path.join(dir, 'instance.lock'), String(dead));
    writeEight();

    expect(() => build()).not.toThrow();

    expect(noneOfEight()).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'instance.lock'), 'utf8')).toBe(String(process.pid));
  });

  it('6: WHEN `instance.lock` is a regular file written by the test holding the pid of a live process other than this one (`process.ppid`, written after that process started) and the eight `.tmp` files exist and `buildStore` runs THEN it throws a message containing `it holds the instance lock`, all eight `.tmp` files still hold `LEFTOVER` and `instance.lock` still holds that pid', () => {
    const lock = path.join(dir, 'instance.lock');
    fs.writeFileSync(lock, String(process.ppid));
    writeEight();

    expect(() => build()).toThrow('it holds the instance lock');

    expect(eightHold('LEFTOVER')).toBe(true);
    expect(fs.readFileSync(lock, 'utf8')).toBe(String(process.ppid));
  });

  it('7: WHEN `ghosts-note.json.tmp` in the account folder is a directory holding `keep.txt` (text `mine`) and `sweepStaleTemps(dir)` runs THEN it does not throw and `ghosts-note.json.tmp/keep.txt` still holds `mine`', () => {
    const sub = path.join(dir, 'ghosts-note.json.tmp');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'keep.txt'), 'mine');

    expect(() => sweepStaleTemps(dir)).not.toThrow();

    expect(fs.readFileSync(path.join(sub, 'keep.txt'), 'utf8')).toBe('mine');
  });
});
