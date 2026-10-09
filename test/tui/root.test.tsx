import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import { makeStore } from '../../src/core/store';
import { loadToken, saveToken } from '../../src/core/token';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { Auth } from '../../src/tui/Root';

const eid = (id: string) => id as never;

const waitFor = async (fn: () => boolean, ms = 1500) => {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
};

describe('T31 Root screen', () => {
  let dir: string;
  let makeStoreFor: Mock;
  let requestCode: Mock;
  let completeLogin: Mock;
  let onQuit: Mock;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-root-'));
    onQuit = vi.fn();
    requestCode = vi.fn().mockResolvedValue(undefined);
    completeLogin = vi.fn().mockResolvedValue('tok2');
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Helper: create a mock store factory that returns a stub store seeded with one note
  function createMakeStoreFor(): Mock {
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

  it("1: WHEN the dir is empty and Root is rendered THEN after 50 ms the frame contains 'Email:' and not 'Root note', and makeStoreFor was not called", async () => {
    makeStoreFor = createMakeStoreFor();
    const { lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        width={80}
        height={24}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
      />
    );

    await waitFor(() => {
      const frame = lastFrame();
      return frame.includes('Email:');
    });

    const frame = lastFrame();
    expect(frame).toContain('Email:');
    expect(frame).not.toContain('Root note');
    expect(makeStoreFor).not.toHaveBeenCalled();

    unmount();
  });

  it("2: WHEN a saved token exists and Root is rendered THEN makeStoreFor was called once with first argument email 'a@b.co', token 'tok'; the frame has 'Notes' and 'Root note' and no 'Email:'; after 'q' is written onQuit was called once", async () => {
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
        onQuit={onQuit}
      />
    );

    await waitFor(() => {
      const frame = lastFrame();
      return makeStoreFor.mock.calls.length >= 1 && frame.includes('Root note');
    });

    expect(makeStoreFor).toHaveBeenCalledTimes(1);
    expect(makeStoreFor).toHaveBeenCalledWith(
      { email: 'a@b.co', token: 'tok' },
      expect.any(Function)
    );

    let frame = lastFrame();
    expect(frame).toContain('Notes');
    expect(frame).toContain('Root note');
    expect(frame).not.toContain('Email:');

    stdin.write('q');
    await waitFor(() => onQuit.mock.calls.length >= 1);

    expect(onQuit).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("3: WHEN the dir is empty, completeLogin resolves 'tok2', and 'a@b.co', '\\r', 'ABC123', '\\r' are written THEN await loadToken(dir) has email 'a@b.co' and token 'tok2', makeStoreFor was called once, and the frame contains 'Root note'", async () => {
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

    await waitForInput(stdin);
    await waitForFrame(lastFrame, 'Email:');
    await new Promise((r) => setImmediate(r));

    stdin.write('a@b.co');
    await waitForFrame(lastFrame, 'Email: a@b.co');
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Code:');
    stdin.write('ABC123');
    await waitForFrame(lastFrame, 'Code: ABC123');
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Root note');

    const token = await loadToken(dir);
    expect(token).not.toBeNull();
    expect(token!.email).toBe('a@b.co');
    expect(token!.token).toBe('tok2');
    expect(makeStoreFor).toHaveBeenCalledTimes(1);

    const frame = lastFrame();
    expect(frame).toContain('Root note');

    unmount();
  });

  it("4: WHEN the same keys are written but completeLogin rejects with new Error('401 bad code') THEN await loadToken(dir) is null, makeStoreFor was not called, and the frame has 'Error: 401 bad code' and no 'Root note'", async () => {
    makeStoreFor = createMakeStoreFor();
    completeLogin = vi.fn().mockRejectedValue(new Error('401 bad code'));
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
    await waitForFrame(lastFrame, 'Email:');
    await new Promise((r) => setImmediate(r));

    stdin.write('a@b.co');
    await waitForFrame(lastFrame, 'Email: a@b.co');
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Code:');
    stdin.write('ABC123');
    await waitForFrame(lastFrame, 'Code: ABC123');
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Error: 401 bad code');

    const token = await loadToken(dir);
    expect(token).toBeNull();
    expect(makeStoreFor).not.toHaveBeenCalled();

    const frame = lastFrame();
    expect(frame).toContain('Error: 401 bad code');
    expect(frame).not.toContain('Root note');

    unmount();
  });

  it("5: WHEN a saved token exists, the app is shown and the second argument that makeStoreFor received is called THEN after 50 ms await loadToken(dir) is null, fs.readdirSync(dir) is empty, and the frame has 'Email:' and no 'Root note'", async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    let logoutCallback: (() => void) | null = null;
    makeStoreFor = vi.fn((auth: Auth, onLogout: () => void) => {
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

    await waitFor(() => makeStoreFor.mock.calls.length >= 1);

    expect(makeStoreFor).toHaveBeenCalledTimes(1);
    expect(logoutCallback).not.toBeNull();

    // Call the logout callback that was passed to makeStoreFor
    logoutCallback!();
    await waitFor(() => {
      const f = lastFrame();
      return f.includes('Email:');
    });

    const token = await loadToken(dir);
    expect(token).toBeNull();
    const files = fs.readdirSync(dir);
    expect(files).toEqual([]);

    const frame = lastFrame();
    expect(frame).toContain('Email:');
    expect(frame).not.toContain('Root note');

    unmount();
  });

  it("6: WHEN auth.json in the dir contains the text 'not json' and Root is rendered THEN the frame contains 'Email:', makeStoreFor was not called and nothing throws", async () => {
    fs.writeFileSync(path.join(dir, 'auth.json'), 'not json', { mode: 0o600 });
    makeStoreFor = createMakeStoreFor();
    const { lastFrame, unmount } = render(
      <Root
        dataDir={dir}
        width={80}
        height={24}
        makeStoreFor={makeStoreFor}
        requestCode={requestCode}
        completeLogin={completeLogin}
      />
    );

    await waitFor(() => {
      const frame = lastFrame();
      return frame.includes('Email:');
    });

    const frame = lastFrame();
    expect(frame).toContain('Email:');
    expect(makeStoreFor).not.toHaveBeenCalled();

    unmount();
  });
});
