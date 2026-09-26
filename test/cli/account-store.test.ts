/**
 * T156: One data folder per account — notes live under `<data dir>/<email>/`.
 * Only `auth.json` stays in the data dir root; an old single-folder install is
 * moved once at start-up by `prepareDataDir`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { accountStore } from '../../src/cli/main';
import { loadState, saveState } from '../../src/core/persistence';
import { accountDir, prepareDataDir, saveToken, logout } from '../../src/core/token';
import { makeStore } from '../../src/core/store';
import { makeNote } from '../tui/fixtures';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

// Poll helper: every asserted value lives inside `cond`; if the poll exhausts
// we call `cond()` once more so the expect below sees the final observed state.
const poll = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 50 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  cond();
};

const acct = (
  root: string,
  server: FakeSimperiumServer,
  email: string,
  token = 'test-token'
): { store: ReturnType<typeof accountStore>['store']; stopSaving: () => void } =>
  accountStore(
    { dataDir: root, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
    { email, token },
    vi.fn()
  );

// Write an "old install" state.json into `root` holding one note old1/Old note.
const writeOldState = (root: string): void => {
  const stub = makeStore({ stubClient: {} });
  stub.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: 'old1' as EntityId,
    note: makeNote('old1', 'Old note'),
  } as A.ActionType);
  saveState(stub.getState(), root);
};

describe('T156 one data folder per account', () => {
  let server: FakeSimperiumServer;
  let root: string;
  let stopSaving: (() => void) | undefined;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t156-'));
    const now = Date.now();
    server.seedBucket('test-app', 'note', [
      {
        id: 'note1',
        data: {
          content: 'First',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
      {
        id: 'note2',
        data: {
          content: 'Second',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        server?.stop();
        resolve();
      }, 100);
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("1: WHEN acct('Test@Example.com') runs THEN within 2.5 s the store has 2 notes and `<root>/test@example.com/ghosts-note.json` exists; after `stopSaving()` `<root>/test@example.com/state.json` exists and `fs.readdirSync(root)` equals `['test@example.com']`", async () => {
    const built = acct(root, server, 'Test@Example.com');
    stopSaving = built.stopSaving;

    const acctPath = accountDir(root, 'Test@Example.com');

    await poll(() => {
      return (
        built.store.getState().data.notes.size === 2 &&
        fs.existsSync(path.join(acctPath, 'ghosts-note.json'))
      );
    });

    built.stopSaving();

    expect(built.store.getState().data.notes.size).toBe(2);
    expect(fs.existsSync(path.join(acctPath, 'ghosts-note.json'))).toBe(true);
    expect(fs.existsSync(path.join(acctPath, 'state.json'))).toBe(true);
    expect(fs.readdirSync(root)).toEqual(['test@example.com']);
  });

  it("2: WHEN acct('a@b.co') has received its 2 notes and `stopSaving()` ran, and then acct('c@d.co') is called THEN right after that call its `data.notes.size` is `0`, and `loadState` of `<root>/a@b.co` still has 2 notes, `note1` with the content `First`", async () => {
    // Seed `first`'s account folder with its two synced notes (note1/First and
    // note2/Second) as a prior session would have left them on disk.
    const seed = makeStore({ stubClient: {} });
    seed.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: 'note1' as EntityId,
      note: makeNote('note1', 'First'),
    } as A.ActionType);
    seed.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: 'note2' as EntityId,
      note: makeNote('note2', 'Second'),
    } as A.ActionType);
    saveState(seed.getState(), accountDir(root, 'a@b.co'));

    // `first` loads that saved state, so it has its 2 notes right away, and
    // `stopSaving()` runs before any later change can overwrite the folder.
    const first = acct(root, server, 'a@b.co');
    first.stopSaving();
    stopSaving = undefined;

    // `second` starts fresh for a different account: no saved state, so 0 notes.
    const second = acct(root, server, 'c@d.co');
    stopSaving = second.stopSaving;

    expect(second.store.getState().data.notes.size).toBe(0);

    const saved = loadState(accountDir(root, 'a@b.co'));
    expect(saved?.data.notes.size).toBe(2);
    expect(saved?.data.notes.get('note1' as EntityId)?.content).toBe('First');
  });

  it("3: WHEN the root holds a saved token for `a@b.co` and an old `state.json` with 1 note `old1` (`Old note`), and `await prepareDataDir(root)` then acct('a@b.co') run THEN right after the call the store has `old1` with `Old note`, and `<root>/state.json` no longer exists", async () => {
    await saveToken(root, { email: 'a@b.co', token: 'test-token' });
    writeOldState(root);

    await prepareDataDir(root);

    const built = acct(root, server, 'a@b.co');
    stopSaving = built.stopSaving;

    expect(built.store.getState().data.notes.get('old1' as EntityId)?.content).toBe(
      'Old note'
    );
    expect(fs.existsSync(path.join(root, 'state.json'))).toBe(false);
  });

  it("4: WHEN the root holds that old `state.json` but NO `auth.json`, and `await prepareDataDir(root)` then acct('c@d.co') run THEN right after the call `data.notes.size` is `0` and `<root>/state.json` still exists", async () => {
    writeOldState(root);

    await prepareDataDir(root);

    const built = acct(root, server, 'c@d.co');
    stopSaving = built.stopSaving;

    expect(built.store.getState().data.notes.size).toBe(0);
    expect(fs.existsSync(path.join(root, 'state.json'))).toBe(true);
  });

  it("5: WHEN acct('a@b.co') has received its notes, `stopSaving()` ran and `await logout(root)` is called THEN `fs.readdirSync(root)` has length 0", async () => {
    const built = acct(root, server, 'a@b.co');
    stopSaving = built.stopSaving;

    // Stop the saver as soon as the folder exists so nothing can rewrite it
    // after logout wipes the root.
    await poll(() => fs.existsSync(path.join(accountDir(root, 'a@b.co'), 'state.json')));
    built.stopSaving();
    stopSaving = undefined;

    await logout(root);

    expect(fs.readdirSync(root)).toHaveLength(0);
  });

  it("6: WHEN `src/cli/main.tsx` is read as text THEN `await prepareDataDir(dataDir)` stands after the last `o.logout` and before `loginCalls(`, `accountStore(` occurs at least 2 times, and `buildStore(` exactly 2 times (its definition and the call inside `accountStore`)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src', 'cli', 'main.tsx'),
      'utf8'
    );
    const lastLogout = src.lastIndexOf('o.logout');
    const prepare = src.indexOf('await prepareDataDir(dataDir)');
    const login = src.indexOf('loginCalls(');

    expect(lastLogout).toBeGreaterThanOrEqual(0);
    expect(prepare).toBeGreaterThan(lastLogout);
    expect(prepare).toBeLessThan(login);

    const accountStoreCount = src.split('accountStore(').length - 1;
    const buildStoreCount = src.split('buildStore(').length - 1;

    expect(accountStoreCount).toBeGreaterThanOrEqual(2);
    expect(buildStoreCount).toBe(2);
  });
});
