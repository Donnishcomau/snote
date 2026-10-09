import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { Root } from '../../src/tui/Root';
import { makeStore } from '../../src/core/store';
import { loadToken, saveToken } from '../../src/core/token';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type { Auth } from '../../src/tui/Root';

const EXPIRED = 'Your session has expired or was revoked. Log in again.';

describe('T425 server-forced sign-out explains itself on the login screen', () => {
  let dir: string;
  let makeStoreFor: Mock;
  let requestCode: Mock;
  let completeLogin: Mock;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-session-expired-'));
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

  function seedStore(): Store<State> {
    const seedStore = makeStore({ stubClient: {} });
    seedStore.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: 'n1' as never,
      note: { content: 'Root note', systemTags: [], tags: [] },
    });
    return seedStore as Store<State>;
  }

  it(`1: WHEN a saved token exists, the app is shown, and the second argument makeStoreFor received is called THEN, waited with waitForFrame, the frame contains 'Email:' and 'Your session has expired or was revoked. Log in again.'`, async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    let logoutCallback: (() => void) | null = null;
    makeStoreFor = vi.fn((_auth: Auth, onLogout: () => void) => {
      logoutCallback = onLogout;
      return seedStore();
    });
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

    await waitForFrame(lastFrame, 'Root note');
    expect(logoutCallback).not.toBeNull();

    // The sync client emits `unauthorized`, which runs this callback.
    logoutCallback!();

    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Email:') && f.includes(EXPIRED),
    );
    expect(frame).toContain('Email:');
    expect(frame).toContain('Your session has expired or was revoked. Log in again.');

    unmount();
  });

  it(`2: WHEN a saved token exists and 'L' then 'y' are written THEN, waited with waitForFrame, the frame contains 'Email:' and does not contain 'session has expired'`, async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    makeStoreFor = vi.fn(() => seedStore());
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
    await waitForFrame(lastFrame, 'Root note');

    stdin.write('L');
    await waitForFrame(lastFrame, 'log out and delete local data?');
    stdin.write('y');

    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Email:') && !f.includes('session has expired'),
    );
    expect(frame).toContain('Email:');
    expect(frame).not.toContain('session has expired');

    unmount();
  });

  it(`3: WHEN after line 1 'a@b.co', '\\r', 'ABC123', '\\r' are written and completeLogin resolves 'tok2' THEN the frame contains 'Root note' and does not contain 'session has expired'`, async () => {
    await saveToken(dir, { email: 'a@b.co', token: 'tok' });
    let logoutCallback: (() => void) | null = null;
    makeStoreFor = vi.fn((_auth: Auth, onLogout: () => void) => {
      logoutCallback = onLogout;
      return seedStore();
    });
    completeLogin = vi.fn().mockResolvedValue('tok2');
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
    await waitForFrame(lastFrame, 'Root note');

    // The server signs the user out; the expired line appears.
    logoutCallback!();
    await waitForFrame(lastFrame, EXPIRED);

    // Let the event loop run once so Login's key handler is attached before typing.
    await new Promise((r) => setImmediate(r));

    // Log in again: the app returns with no stale error line.
    stdin.write('a@b.co');
    await waitForFrame(lastFrame, (f) => f.includes('a@b.co'));
    stdin.write('\r');
    await waitForFrame(lastFrame, (f) => f.includes('ABC123') || f.includes('Code'));
    stdin.write('ABC123');
    await waitForFrame(lastFrame, (f) => f.includes('ABC123'));
    stdin.write('\r');

    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Root note') && !f.includes('session has expired'),
    );
    expect(frame).toContain('Root note');
    expect(frame).not.toContain('session has expired');

    unmount();
  });
});
