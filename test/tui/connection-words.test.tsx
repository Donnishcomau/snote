/**
 * Issue #79 (slice A): the status bar says which kind of not-connected it is.
 * `[connecting]` until the session has received a frame, `[stale]` when the
 * socket is open but the monitor turned red, `[offline]` when the socket is
 * closed, `[connected]` while green.
 */
import { afterEach, describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { hasOpenSocket, snoteWebsocketProvider } from '../../src/core/websocket-provider';
import { App } from '../../src/tui/App';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const strip = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const statusLine = (frame: string | undefined): string => strip(frame).split('\n').find((l) => /^\[\w+\] \d+ notes?\b/.test(l.trim()))?.trim() ?? '';
// A seeded store: the note count only shows after the first state read, which is also what sets the word.
const seeded = (): ReturnType<typeof makeStore> => {
  const store = makeStore({ stubClient: {} });
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: 'n1' as never,
    note: { content: 'First note', creationDate: 1000, modificationDate: 1000, deleted: false, systemTags: [], tags: [] } as never,
  } as never);
  return store;
};
const status = (store: ReturnType<typeof makeStore>, s: 'green' | 'red'): void => {
  store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: s } as never);
};

describe('issue #79 the status bar says which kind of not-connected it is', () => {
  let server: FakeSimperiumServer | undefined;
  let socket: ReturnType<typeof snoteWebsocketProvider> | undefined;
  let synced: (ReturnType<typeof makeStore> & { stopSync?: () => void }) | undefined;

  afterEach(() => {
    socket?.close();
    socket = undefined;
    synced?.stopSync?.();
    synced = undefined;
    server?.stop();
    server = undefined;
  });

  async function openSocket(): Promise<void> {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    socket = snoteWebsocketProvider(url);
    await expect.poll(() => hasOpenSocket(), { timeout: 2000 }).toBe(true);
  }

  it('1: WHEN a fresh store has received no frame THEN the status line, trimmed, is `[connecting] 1 note`', async () => {
    const store = seeded();
    const r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    const frame = await waitForFrame(r.lastFrame, (f) => statusLine(f) === '[connecting] 1 note');
    expect(statusLine(frame)).toBe('[connecting] 1 note');
    r.unmount();
  });

  it('2: WHEN the session was green and the monitor turns it red while a socket is open THEN the status line, trimmed, is `[stale] 1 note`', async () => {
    await openSocket();
    const store = seeded();
    status(store, 'green');
    const r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, (f) => statusLine(f) === '[connected] 1 note');
    status(store, 'red');
    const frame = await waitForFrame(r.lastFrame, (f) => statusLine(f) === '[stale] 1 note');
    expect(statusLine(frame)).toBe('[stale] 1 note');
    r.unmount();
  });

  it('3: WHEN the server closes the connection of a green session THEN the status line, trimmed, is `[offline] 0 notes`', async () => {
    server = new FakeSimperiumServer();
    await server.start();
    synced = makeStore({
      sync: { appId: 'test-app', token: 'test-token', username: 'test@example.com', clientOptions: { url: server.url }, noteEditDelayMs: 10 },
    });
    const r = render(<App store={synced} width={80} height={24} />);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, (f) => statusLine(f) === '[connected] 0 notes');
    server.dropClient('test@example.com');
    const frame = await waitForFrame(r.lastFrame, (f) => statusLine(f) === '[offline] 0 notes');
    expect(statusLine(frame)).toBe('[offline] 0 notes');
    r.unmount();
  });

  it('4: WHEN the first frame arrives THEN the status line, trimmed, is `[connected] 1 note`, and a new store starts at `[connecting] 1 note` again', async () => {
    const store = seeded();
    const r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, (f) => statusLine(f) === '[connecting] 1 note');
    status(store, 'green');
    const frame = await waitForFrame(r.lastFrame, (f) => statusLine(f) === '[connected] 1 note');
    expect(statusLine(frame)).toBe('[connected] 1 note');
    r.unmount();
    const next = render(<App store={seeded()} width={80} height={24} />);
    await waitForInput(next.stdin);
    const again = await waitForFrame(next.lastFrame, (f) => statusLine(f) === '[connecting] 1 note');
    expect(statusLine(again)).toBe('[connecting] 1 note');
    next.unmount();
  });
});
