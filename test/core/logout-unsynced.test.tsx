/**
 * T503 (F149, F150): logout removes `unsynced.json` and its temp sibling, so
 * an account folder holding only an offline edit goes away, and the
 * command-line `--logout` also removes the bar's `status.json` and its temp
 * sibling. Only snote's own files are ever touched (T457 stands).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { logout, saveToken, accountDir } from '../../src/core/token';
import { main, buildStore } from '../../src/cli/main';
import { Root, type Auth } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { initialState } from '../../src/core/simperium-reducer';
import { waitForInput, waitForFrame } from '../helpers/ink-waits';

import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { EntityId } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

// Poll a condition with a 10 ms step; every value asserted later was waited
// for here, so a slow timer only makes a test slower, never red.
const waitFor = async (cond: () => boolean, timeoutMs = 2500): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('T503 logout removes unsynced.json and --logout removes status.json', () => {
  let tmpDir: string;
  let savedStatusDir: string | undefined;
  let stopSaving: (() => void) | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t503-'));
    // Never let these runs touch the real bar folder.
    savedStatusDir = process.env.SNOTE_STATUS_DIR;
    process.env.SNOTE_STATUS_DIR = path.join(tmpDir, 'status-home');
  });

  afterEach(() => {
    stopSaving?.();
    stopSaving = undefined;
    if (savedStatusDir === undefined) {
      delete process.env.SNOTE_STATUS_DIR;
    } else {
      process.env.SNOTE_STATUS_DIR = savedStatusDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * A real session against no server: buildStore in the account folder, one
   * offline edit, wait until `unsynced.json` is on disk, then stop the saver.
   */
  const offlineEdit = async (dir: string): Promise<void> => {
    const acct = accountDir(dir, 'a@b.co');
    fs.mkdirSync(acct, { recursive: true });
    const built = buildStore(
      { dataDir: acct, appId: 'test-app', server: 'ws://127.0.0.1:9', noteEditDelayMs: 10 },
      { email: 'a@b.co', token: 'tok' },
      vi.fn()
    );
    stopSaving = built.stopSaving;
    built.store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: 'n1' as unknown as EntityId,
      note: { content: 'offline edit', systemTags: [], tags: [] },
    } as A.ActionType);
    const record = path.join(acct, 'unsynced.json');
    await waitFor(() => fs.existsSync(record));
    stopSaving();
    stopSaving = undefined;
  };

  it("1: WHEN the account folder holds `state.json`, `unsynced.json` and `unsynced.json.tmp` and the data dir holds `keep.txt` THEN after `logout(dir)` the data dir entries are `['keep.txt']`", async () => {
    const dir = path.join(tmpDir, 'data');
    fs.mkdirSync(path.join(dir, 'a@b.co'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'keep');
    fs.writeFileSync(path.join(dir, 'a@b.co', 'state.json'), '{}');
    fs.writeFileSync(path.join(dir, 'a@b.co', 'unsynced.json'), '{}');
    fs.writeFileSync(path.join(dir, 'a@b.co', 'unsynced.json.tmp'), '{}');

    await logout(dir);

    expect(fs.readdirSync(dir)).toEqual(['keep.txt']);
  });

  it("2: WHEN the account folder holds `unsynced.json` and `mine.txt` THEN after `logout(dir)` the account folder holds exactly `['mine.txt']` with content `mine`", async () => {
    const dir = path.join(tmpDir, 'data');
    const acct = path.join(dir, 'a@b.co');
    fs.mkdirSync(acct, { recursive: true });
    fs.writeFileSync(path.join(acct, 'unsynced.json'), '{}');
    fs.writeFileSync(path.join(acct, 'mine.txt'), 'mine');

    await logout(dir);

    await waitFor(() => fs.readdirSync(acct).join() === 'mine.txt');
    expect(fs.readdirSync(acct)).toEqual(['mine.txt']);
    expect(fs.readFileSync(path.join(acct, 'mine.txt'), 'utf8')).toBe('mine');
  });

  it("3: WHEN a session with no server saved an offline edit (`unsynced.json` exists in the account folder) and stopped THEN after `main(['--logout', '--data-dir', dir], io)` resolves `0` with `logged out` logged, the data dir entries are `[]`", async () => {
    const dir = path.join(tmpDir, 'data');
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    await offlineEdit(dir);
    expect(fs.existsSync(path.join(dir, 'a@b.co', 'unsynced.json'))).toBe(true);

    const logged: string[] = [];
    const io = { log: (text: string) => logged.push(text) };
    const code = await main(['--logout', '--data-dir', dir], io);

    expect(code).toBe(0);
    expect(logged).toContain('logged out');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("4: WHEN the status dir holds `status.json`, `status.json.tmp` and `other.txt` THEN after `main(['--logout', '--data-dir', dir], io)` resolves `0` the status dir entries are `['other.txt']` with content `other`", async () => {
    const dir = path.join(tmpDir, 'data');
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const status = process.env.SNOTE_STATUS_DIR as string;
    fs.mkdirSync(status, { recursive: true });
    fs.writeFileSync(path.join(status, 'status.json'), '{"title":"Latest note"}');
    fs.writeFileSync(path.join(status, 'status.json.tmp'), 'tmp');
    fs.writeFileSync(path.join(status, 'other.txt'), 'other');

    const logged: string[] = [];
    const io = { log: (text: string) => logged.push(text) };
    const code = await main(['--logout', '--data-dir', dir], io);

    expect(code).toBe(0);
    expect(fs.readdirSync(status)).toEqual(['other.txt']);
    expect(fs.readFileSync(path.join(status, 'other.txt'), 'utf8')).toBe('other');
  });

  it("5: WHEN `SNOTE_STATUS_DIR` names a folder that does not exist THEN `main(['--logout', '--data-dir', dir], io)` resolves `0` and that folder still does not exist", async () => {
    const dir = path.join(tmpDir, 'data');
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    const status = process.env.SNOTE_STATUS_DIR as string;
    expect(fs.existsSync(status)).toBe(false);

    const logged: string[] = [];
    const io = { log: (text: string) => logged.push(text) };
    const code = await main(['--logout', '--data-dir', dir], io);

    expect(code).toBe(0);
    expect(logged).toContain('logged out');
    expect(fs.existsSync(status)).toBe(false);
  });

  it("6: WHEN Root shows the app for a saved token with an offline edit saved in `unsynced.json` and `L`, the word `logout` and Enter are written THEN the frame contains `Email:` and the data dir entries are `[]` (no account folder, no `unsynced.json`)", async () => {
    const dir = path.join(tmpDir, 'data');
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    await offlineEdit(dir);
    expect(fs.existsSync(path.join(dir, 'a@b.co', 'unsynced.json'))).toBe(true);

    const acct = accountDir(dir, 'a@b.co');
    // Same preloaded shape a real start-up carries (state.json dropped,
    // tracking on), plus the note the offline record still names, so the
    // logout prompt asks for the word `logout` and not a plain y.
    const makeStoreFor: Mock = vi.fn((auth: Auth, onLogout: () => void) => {
      const seed = makeStore({
        stubClient: {},
        preloadedState: {
          simperium: { ...initialState, tracking: true, pendingNotes: { n1: 'dirty' } },
        } as never,
      });
      seed.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: 'n1' as unknown as EntityId,
        note: { content: 'offline edit', systemTags: [], tags: [] },
      } as A.ActionType);
      const built = buildStore(
        {
          dataDir: acct,
          appId: 'test-app',
          server: 'ws://127.0.0.1:9',
          noteEditDelayMs: 10,
        },
        { email: auth.email, token: auth.token },
        onLogout
      );
      stopSaving = built.stopSaving;
      for (const entry of seed.getState().data.notes.entries()) {
        built.store.dispatch({
          type: 'CREATE_NOTE_WITH_ID',
          noteId: entry[0] as EntityId,
          note: entry[1],
        } as A.ActionType);
      }
      return built.store as Store<State>;
    });
    const requestCode: Mock = vi.fn().mockResolvedValue(undefined);
    const completeLogin: Mock = vi.fn().mockResolvedValue('tok2');

    const { stdin, lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        width={80}
        height={24}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
      />
    );

    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'offline edit');

    stdin.write('L');
    await waitForFrame(lastFrame, "type 'logout' to confirm");
    stdin.write('logout');
    await waitForFrame(lastFrame, 'logout');
    stdin.write('\r');
    const frame = await waitForFrame(lastFrame, 'Email:');

    expect(frame).toContain('Email:');
    // The logout already happened (the login screen is up); wait until the
    // sweep is over, then re-assert the frame text that was waited for.
    await waitFor(() => fs.readdirSync(dir).length === 0);
    expect(lastFrame()).toContain('Email:');
    expect(fs.readdirSync(dir)).toEqual([]);

    unmount();
  });
});
