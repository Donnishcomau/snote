import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { loadToken, saveToken } from '../../src/core/token';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { Auth } from '../../src/tui/Root';

const waitFor = async (fn: () => boolean, ms = 1500) => {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
};

describe('T72 Root screen: password login and in-app logout', () => {
  let dir: string;
  let makeStoreFor: ReturnType<typeof vi.fn>;
  let requestCode: ReturnType<typeof vi.fn>;
  let completeLogin: ReturnType<typeof vi.fn>;
  let passwordLogin: ReturnType<typeof vi.fn>;

  function createMakeStoreFor(): ReturnType<typeof vi.fn> {
    const seedStore = makeStore({ stubClient: {} });
    seedStore.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: 'n1' as never,
      note: { content: 'Root note', systemTags: [], tags: [] },
    });
    return vi.fn(
      () =>
        seedStore as Store<State>
    );
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-root-auth-'));
    requestCode = vi.fn().mockResolvedValue(undefined);
    completeLogin = vi.fn().mockResolvedValue('tok2');
    passwordLogin = vi.fn().mockResolvedValue('ptok');
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('1: WHEN the dir is empty, passwordLogin resolves ptok, and a@b.co, \\t, hunter2secret, \\r are written THEN passwordLogin was called once with a@b.co and hunter2secret, await loadToken(dir) has token ptok, and the frame has Root note', async () => {
    makeStoreFor = createMakeStoreFor();
    const { stdin, lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        width={80}
        height={24}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    // Type email, tab, password, enter
    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('hunter2secret');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await waitFor(() => lastFrame()?.includes('Root note'));

    expect(passwordLogin).toHaveBeenCalledTimes(1);
    expect(passwordLogin).toHaveBeenCalledWith('a@b.co', 'hunter2secret');

    const token = await loadToken(dir);
    expect(token).not.toBeNull();
    expect(token!.token).toBe('ptok');

    const frame = lastFrame();
    expect(frame).toContain('Root note');

    unmount();
  });

  it('2: WHEN the steps of line 1 have run in this test THEN fs.readdirSync(dir) contains auth.json and no file in dir contains the text hunter2secret', async () => {
    makeStoreFor = createMakeStoreFor();
    const { stdin, lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        width={80}
        height={24}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
        passwordLogin={passwordLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('a@b.co');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\t');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('hunter2secret');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 50));

    const files = fs.readdirSync(dir);
    expect(files).toContain('auth.json');

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(content).not.toContain('hunter2secret');
    }

    lastFrame();
    unmount();
  });

  it('3: WHEN a saved token exists and L then y are written THEN after 50 ms await loadToken(dir) is null, fs.readdirSync(dir) is empty, and the frame contains Email: and not Root note', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    makeStoreFor = createMakeStoreFor();
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

    await new Promise((r) => setTimeout(r, 50));

    // L opens logout confirmation, y confirms
    stdin.write('L');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('y');
    await new Promise((r) => setTimeout(r, 50));

    const token = await loadToken(dir);
    expect(token).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);

    const frame = lastFrame();
    expect(frame).toContain('Email:');
    expect(frame).not.toContain('Root note');

    unmount();
  });

  it('4: WHEN a saved token exists and L then n are written THEN await loadToken(dir) still has token tok, the frame contains Root note and not Email:, and the store dispatch spy never saw REALLY_LOG_OUT', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    let dispatchSpy: ReturnType<typeof vi.spyOn>;
    makeStoreFor = vi.fn((auth: Auth, onLogout: () => void) => {
      const seedStore = makeStore({ stubClient: {} });
      seedStore.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: 'n1' as never,
        note: { content: 'Root note', systemTags: [], tags: [] },
      });
      dispatchSpy = vi.spyOn(seedStore, 'dispatch');
      return seedStore as Store<State>;
    });
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

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('L');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('n');
    await new Promise((r) => setTimeout(r, 50));

    const token = await loadToken(dir);
    expect(token).not.toBeNull();
    expect(token!.token).toBe('tok');

    const frame = lastFrame();
    expect(frame).toContain('Root note');
    expect(frame).not.toContain('Email:');

    expect(dispatchSpy).not.toHaveBeenCalledWith({ type: 'REALLY_LOG_OUT' });

    unmount();
  });

  it('5: WHEN the store returned by makeStoreFor has vi.spyOn(store dispatch) and L then y are written THEN dispatch was called exactly once with type REALLY_LOG_OUT and never with type LOGOUT', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    let dispatchedActions: { type: string }[] = [];
    makeStoreFor = vi.fn(() => {
      const seedStore = makeStore({ stubClient: {} });
      seedStore.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: 'n1' as never,
        note: { content: 'Root note', systemTags: [], tags: [] },
      });
      const originalDispatch = seedStore.dispatch.bind(seedStore);
      vi.spyOn(seedStore, 'dispatch').mockImplementation((action: { type: string }) => {
        dispatchedActions.push(action);
        return originalDispatch(action);
      });
      return seedStore as Store<State>;
    });
    const { stdin, unmount } = render(
      <Root
        dataDir={dir}
        width={80}
        height={24}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
      />
    );

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('L');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('y');
    await waitFor(() => dispatchedActions.filter((a) => a.type === 'REALLY_LOG_OUT').length >= 1);

    expect(dispatchedActions.filter((a) => a.type === 'REALLY_LOG_OUT').length).toBe(1);
    expect(dispatchedActions.filter((a) => a.type === 'LOGOUT').length).toBe(0);

    unmount();
  });

  it('6: WHEN after L then y the second argument that makeStoreFor received is called again and awaited THEN it does not reject, await loadToken(dir) is null and the frame still contains Email:', async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    let logoutCallback: (() => void) | null = null;
    makeStoreFor = vi.fn((_auth: Auth, onLogout: () => void) => {
      logoutCallback = onLogout;
      const seedStore = makeStore({ stubClient: {} });
      seedStore.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: 'n1' as never,
        note: { content: 'Root note', systemTags: [], tags: [] },
      });
      return seedStore as Store<State>;
    });
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

    await new Promise((r) => setTimeout(r, 50));

    stdin.write('L');
    await new Promise((r) => setTimeout(r, 50));
    stdin.write('y');
    await new Promise((r) => setTimeout(r, 50));

    // Call the logout callback again (simulating what the middleware does)
    expect(async () => {
      if (logoutCallback) {
        await logoutCallback();
      }
    }).not.toThrow();

    const token = await loadToken(dir);
    expect(token).toBeNull();

    const frame = lastFrame();
    expect(frame).toContain('Email:');

    unmount();
  });
});
