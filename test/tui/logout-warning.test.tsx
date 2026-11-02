/**
 * F237b: the user's own logout deletes every account folder, so its warning
 * says how many unsynced changes are deleted here and how many more other
 * accounts keep. Real BottomArea against account folders on disk.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';
import type { Store } from 'redux';

import { BottomArea } from '../../src/tui/BottomArea';
import { Root } from '../../src/tui/Root';
import type { Auth } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { initialState } from '../../src/core/simperium-reducer';
import { setActiveAccount } from '../../src/core/data-root';
import { accountDir, saveToken } from '../../src/core/token';
import { recordAccountId, resolveAccountDir } from '../../src/core/account-id';
import type { State } from '../../src/core/store';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId, Note } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const note = { content: 'Alpha note', creationDate: 1, deleted: false, modificationDate: 1, systemTags: [], tags: [] } as Note;
const noteEntries = [{ id: eid('note-a'), note }];
const view = {
  allTagNames: [] as string[], connected: false, noteEntries, inTrash: false, sortLabelStr: 'sort: modified', pending: 0,
  selectedIndex: 0, setSelectedIndex: vi.fn(), query: '', setQuery: vi.fn(), tagNames: [] as string[], collection: { type: 'all' },
} as never;

const flat = (f: string | undefined): string => (f ?? '').replace(/\s+/g, ' ');

describe('F237b: the logout warning counts what other accounts keep', () => {
  let dir = '';
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** The signed-in account keeps 1 change; `other` is the record another account's folder holds. */
  function setup(other: Record<string, number> | null) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f237b-'));
    fs.mkdirSync(path.join(dir, 'test@example.com'));
    fs.writeFileSync(path.join(dir, 'test@example.com', 'unsynced.json'), '{"own":1}');
    if (other) {
      fs.mkdirSync(path.join(dir, 'other@example.com'));
      fs.writeFileSync(path.join(dir, 'other@example.com', 'unsynced.json'), JSON.stringify(other));
    }
    setActiveAccount(dir, path.join(dir, 'test@example.com'));
  }

  /** #109: the signed-in o_brien account lives in its ~hash folder; the o'brien account keeps 2 changes in the plain one. */
  function setupCollision() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f237b-'));
    const first = accountDir(dir, "o'brien@example.com");
    fs.mkdirSync(first);
    recordAccountId(first, "o'brien@example.com");
    fs.writeFileSync(path.join(first, 'unsynced.json'), '{"x":1,"y":2}');
    setActiveAccount(dir, resolveAccountDir(dir, 'o_brien@example.com'));
  }

  /**
   * Root signed in as o'brien@example.com (a saved token, or the login screen) with
   * o_brien@example.com keeping 1 change in its folder; `L` opens the logout question.
   * Root must record its own (hashed) folder for the warning to count the other.
   */
  async function rootWarning(saved: boolean): Promise<string> {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f237b-'));
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f237b-none-'));
    setActiveAccount(empty, path.join(empty, 'none')); // forget any earlier test's account (an empty readable root: 0 kept)
    const plain = accountDir(dir, 'o_brien@example.com');
    fs.mkdirSync(plain);
    recordAccountId(plain, 'o_brien@example.com');
    fs.writeFileSync(path.join(plain, 'unsynced.json'), '{"a":1}');
    if (saved) await saveToken(dir, { email: "o'brien@example.com", token: 'tok' });
    const makeStoreFor = vi.fn((_auth: Auth, _onLogout: () => void) => {
      const st = makeStore({ stubClient: {}, preloadedState: { simperium: { ...initialState, tracking: true, pendingNotes: { n1: 'dirty' } } } as never });
      st.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: 'offline edit', systemTags: [], tags: [] } } as never);
      return st as Store<State>;
    });
    const r = render(
      <Root dataDir={dir} width={100} height={24} makeStoreFor={makeStoreFor} requestCode={vi.fn().mockResolvedValue(undefined)}
        completeLogin={vi.fn().mockResolvedValue('tok')} passwordLogin={vi.fn().mockResolvedValue('tok')} />,
    );
    await waitForInput(r.stdin);
    if (!saved) {
      await waitForFrame(r.lastFrame, 'Email:');
      await new Promise((res) => setImmediate(res));
      r.stdin.write("o'brien@example.com");
      await waitForFrame(r.lastFrame, "Email: o'brien@example.com");
      r.stdin.write('\t');
      await waitForFrame(r.lastFrame, "Password login for o'brien@example.com");
      r.stdin.write('hunter2secret');
      await waitForFrame(r.lastFrame, 'Password: *************');
      r.stdin.write('\r');
    }
    await waitForFrame(r.lastFrame, '1 note');
    r.stdin.write('L');
    const frame = flat(await waitForFrame(r.lastFrame, (f) => flat(f).includes('log out:')));
    r.unmount();
    fs.rmSync(empty, { recursive: true, force: true });
    return frame;
  }

  /** A store with `edited` notes waiting for the server (pendingCount) and the logout question open. */
  async function ask(edited: number): Promise<string> {
    const store = makeStore({ stubClient: {}, preloadedState: { simperium: { ...initialState, tracking: true } } as never });
    for (let i = 0; i < edited; i++) {
      store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid(`u${i}`), note: { content: 'x', systemTags: [], tags: [], deleted: false, creationDate: 1, modificationDate: 1 } } as never);
      store.dispatch({ type: 'EDIT_NOTE', noteId: eid(`u${i}`), changes: { content: 'edited' } } as never);
    }
    const r = render(
      <BottomArea
        store={store as Store<State>} view={view} selectedEntry={noteEntries[0]} width={80} onLogout={vi.fn()}
        tagEditorOpen={false} setTagEditorOpen={vi.fn()} tagDialog={null} setTagDialog={vi.fn()} logoutAsk={true}
        setLogoutAsk={vi.fn()} emptyAsk={0} setEmptyAsk={vi.fn()} copyResult={null} tagsFocused={false} searchOpen={false}
      />,
    );
    await vi.waitFor(() => {
      if (!flat(r.lastFrame()).includes('log out')) throw new Error('no logout question yet');
    }, { timeout: 2000, interval: 10 });
    const frame = flat(r.lastFrame());
    r.unmount();
    return frame;
  }

  it('1: WHEN the logout question is open with 1 unsynced note here and another account keeps 2 changes THEN the frame contains `log out: 1 unsynced change (2 more kept for other accounts) will be deleted.`', async () => {
    setup({ x: 1, y: 2 });
    const frame = await ask(1);
    expect(frame).toContain('log out: 1 unsynced change (2 more kept for other accounts) will be deleted.');
  });

  it('2: WHEN the logout question is open with 1 unsynced note here and no other account keeps anything THEN the frame contains `log out: 1 unsynced change will be deleted.` and not `more kept`', async () => {
    setup(null);
    const frame = await ask(1);
    expect(frame).toContain('log out: 1 unsynced change will be deleted.');
    expect(frame).not.toContain('more kept');
  });

  it('3: WHEN the logout question is open with nothing unsynced here and another account keeps 2 changes THEN the frame contains `log out: 0 unsynced changes (2 more kept for other accounts) will be deleted.` and not `y/n`', async () => {
    setup({ x: 1, y: 2 });
    const frame = await ask(0);
    expect(frame).toContain('log out: 0 unsynced changes (2 more kept for other accounts) will be deleted.');
    expect(frame).not.toContain('y/n');
  });

  it('4: WHEN the signed-in account `o_brien@example.com` shares its folder name with `o\'brien@example.com`, which keeps 2 changes, THEN the frame contains `log out: 1 unsynced change (2 more kept for other accounts) will be deleted.`, and, through Root signed in as `o\'brien@example.com` (saved token, then the login screen) with `o_brien@example.com` keeping 1 change, the frame contains `log out: 1 unsynced change (1 more kept for other accounts) will be deleted.`', { timeout: 20000 }, async () => {
    setupCollision();
    const frame = await ask(1);
    expect(frame).toContain('log out: 1 unsynced change (2 more kept for other accounts) will be deleted.');
    // The same through Root, on both sign-in paths: Root records the own folder.
    fs.rmSync(dir, { recursive: true, force: true });
    expect(await rootWarning(true)).toContain('log out: 1 unsynced change (1 more kept for other accounts) will be deleted.');
    fs.rmSync(dir, { recursive: true, force: true });
    expect(await rootWarning(false)).toContain('log out: 1 unsynced change (1 more kept for other accounts) will be deleted.');
  });

  /** Another account's folder holding `files` (name -> content); the signed-in account keeps 1 change. */
  function setupRaw(files: Record<string, string>) {
    setup(null);
    fs.mkdirSync(path.join(dir, 'other@example.com'));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'other@example.com', name), text);
  }

  it('5: WHEN another account keeps an `unsynced.json` of 1 000 001 bytes THEN the frame contains `(1 more kept for other accounts)` and the question is the typed prompt, not y/n, even with 0 unsynced here', async () => {
    setupRaw({ 'unsynced.json': `{"a":"${'x'.repeat(1_000_001 - 8)}"}` });
    expect(fs.statSync(path.join(dir, 'other@example.com', 'unsynced.json')).size).toBe(1_000_001);
    const frame = await ask(0);
    expect(frame).toContain('(1 more kept for other accounts)');
    expect(frame).toContain("type 'logout' to confirm");
    expect(frame).not.toContain('y/n');
  });

  it('6: WHEN another account keeps an `unsynced.json` holding `{not json` (damaged, over 2 bytes) THEN the frame contains `(1 more kept for other accounts)` and not `y/n`', async () => {
    setupRaw({ 'unsynced.json': '{not json' });
    const frame = await ask(0);
    expect(frame).toContain('(1 more kept for other accounts)');
    expect(frame).not.toContain('y/n');
  });

  it('7: WHEN another account\'s `drafts` is a symlink to a folder holding 3 `snote-x` folders THEN the number in the parenthesis is not 3 and the target folder is untouched', async () => {
    setupRaw({});
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-f237b-target-'));
    try {
      for (const n of ['snote-a', 'snote-b', 'snote-c']) fs.mkdirSync(path.join(target, n));
      fs.symlinkSync(target, path.join(dir, 'other@example.com', 'drafts'));
      const frame = await ask(1);
      expect(frame).toContain('log out: 1 unsynced change');
      expect(frame).not.toContain('(3 more kept for other accounts)');
      expect(fs.readdirSync(target).sort()).toEqual(['snote-a', 'snote-b', 'snote-c']);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  // root ignores mode 000 (the mini runs as root in docker), so the unreadable-root path cannot happen there
  it.skipIf(process.getuid?.() === 0)('8: WHEN the data root cannot be read (mode `000`) while an account is set THEN the frame contains `(1 more kept for other accounts)` and not `y/n`', async () => {
    setup(null);
    fs.chmodSync(dir, 0o000);
    try {
      const frame = await ask(0);
      expect(frame).toContain('(1 more kept for other accounts)');
      expect(frame).not.toContain('y/n');
    } finally {
      fs.chmodSync(dir, 0o700);
    }
  });
});
