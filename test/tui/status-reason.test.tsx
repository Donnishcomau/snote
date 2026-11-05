/**
 * #79, #619, #632: the status line says why it is offline and when it last synced.
 * Real stores against the fake server on localhost (or a closed localhost port); App rendered at 80x24.
 */
import { afterEach, describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { snoteWebsocketProvider } from '../../src/core/websocket-provider';
import { App } from '../../src/tui/App';
import { StatusBar } from '../../src/tui/StatusBar';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

type SyncStore = ReturnType<typeof makeStore> & { stopSync?: () => void; client?: unknown };
const strip = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const statusLine = (frame: string | undefined): string => strip(frame).split('\n').find((l) => /^\[\w+\] /.test(l.trim()))?.trim() ?? '';

describe('#79 #619 #632 the status line gives a reason and the last sync time', () => {
  let server: FakeSimperiumServer | undefined;
  let store: SyncStore | undefined;
  let r: ReturnType<typeof render> | undefined;

  afterEach(() => {
    r?.unmount();
    r = undefined;
    store?.stopSync?.();
    store = undefined;
    server?.stop();
    server = undefined;
  });

  function syncStore(url: string, handshakeMs = 300): SyncStore {
    const s = makeStore({
      sync: {
        appId: 'test-app', token: 'test-token', username: 'test@example.com', noteEditDelayMs: 10,
        clientOptions: { url, websocketClientProvider: (u: string) => snoteWebsocketProvider(u, handshakeMs) } as never,
      },
    }) as SyncStore;
    (s.client as { reconnectionTimer: { interval: () => number } }).reconnectionTimer.interval = () => 20;
    return s;
  }

  it("1: (#632) WHEN snote starts and the sync server port refuses the connection THEN the status line is `[offline] can't reach the sync server, retrying · 0 notes`, never `[connecting]` after that", async () => {
    const closed = new FakeSimperiumServer();
    const { url } = await closed.start();
    closed.stop();
    store = syncStore(url);
    r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    const frame = await waitForFrame(r.lastFrame, (f) => statusLine(f) === "[offline] can't reach the sync server, retrying · 0 notes");
    expect(statusLine(frame)).toBe("[offline] can't reach the sync server, retrying · 0 notes");
  });

  it('2: (#79) WHEN snote starts and the server never answers the upgrade THEN the status line is `[offline] sync server not answering, retrying · 0 notes`', async () => {
    server = new FakeSimperiumServer();
    server.silentUpgrades = 1000;
    const { url } = await server.start();
    store = syncStore(url);
    r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    const frame = await waitForFrame(r.lastFrame, (f) => statusLine(f) === '[offline] sync server not answering, retrying · 0 notes');
    expect(statusLine(frame)).toBe('[offline] sync server not answering, retrying · 0 notes');
  });

  it('3: (#619, #79) WHEN the first upgrade goes unanswered, the next connects and the server then drops the session THEN the line first matches `[connected] synced hh:mm · 0 notes` and then `[offline] connection lost, retrying · synced hh:mm · 0 notes`', async () => {
    server = new FakeSimperiumServer();
    server.silentUpgrades = 1;
    const { url } = await server.start();
    store = syncStore(url);
    r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    const ok = await waitForFrame(r.lastFrame, (f) => /^\[connected\] synced \d\d:\d\d · 0 notes$/.test(statusLine(f)));
    expect(statusLine(ok)).toMatch(/^\[connected\] synced \d\d:\d\d · 0 notes$/);
    server.dropClient('test@example.com');
    const lost = await waitForFrame(r.lastFrame, (f) => /^\[offline\] connection lost, retrying · synced \d\d:\d\d · 0 notes$/.test(statusLine(f)));
    expect(statusLine(lost)).toMatch(/^\[offline\] connection lost, retrying · synced \d\d:\d\d · 0 notes$/);
  });

  it("4: WHEN <StatusBar> is offline with a reason, `synced 31 Oct 20:34` and 1089 notes THEN at width 90 it starts `[offline] can't reach the sync server, retrying · synced 31 Oct 20:34 · 1089 notes`; with 2 pending at width 80 the synced part is dropped first and the line is exactly `[offline] can't reach the sync server, retrying · 1089 notes 2 pending (no sync)`; at width 20 both are dropped and the line is `[offline] 1089 note…`", () => {
    const bar = (width: number, pending: number): string => strip(render(<StatusBar connected={false} word="offline" count={1089} width={width} pending={pending} reason="can't reach the sync server, retrying" synced="synced 31 Oct 20:34" />).lastFrame()).trimEnd();
    expect(bar(90, 0).startsWith("[offline] can't reach the sync server, retrying · synced 31 Oct 20:34 · 1089 notes")).toBe(true);
    expect(bar(80, 2)).toBe("[offline] can't reach the sync server, retrying · 1089 notes 2 pending (no sync)");
    expect(bar(20, 2)).toBe('[offline] 1089 note…');
  });

  it('5: WHEN <StatusBar> is connected with `synced 20:34` and 1089 notes THEN at width 80 it starts `[connected] synced 20:34 · 1089 notes`, and at width 20 it is `[connected] 1089 no…`', () => {
    const bar = (width: number): string => strip(render(<StatusBar connected word="connected" count={1089} width={width} synced="synced 20:34" />).lastFrame()).trimEnd();
    expect(bar(80).startsWith('[connected] synced 20:34 · 1089 notes')).toBe(true);
    expect(bar(20)).toBe('[connected] 1089 no…');
  });

  it("6: (#649) WHEN a session that shows `[offline] can't reach the sync server, retrying` signs out and the next session's server leaves the upgrade unanswered THEN, once a note is made there, the new session's line is `[connecting] 1 note 1 pending (no sync)`, with no reason left from the session before", async () => {
    const closed = new FakeSimperiumServer();
    const { url: gone } = await closed.start();
    closed.stop();
    store = syncStore(gone);
    r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, (f) => statusLine(f) === "[offline] can't reach the sync server, retrying · 0 notes");
    r.unmount();
    store.stopSync?.();
    server = new FakeSimperiumServer();
    server.silentUpgrades = 1000;
    const { url } = await server.start();
    store = syncStore(url, 60_000);
    r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    // a store change, so the line is drawn from the new session's state (the first frame is the hook's default word)
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n649', note: { content: 'n', systemTags: [], tags: [] } } as never);
    const frame = await waitForFrame(r.lastFrame, (f) => statusLine(f) === '[connecting] 1 note 1 pending (no sync)');
    expect(statusLine(frame)).toBe('[connecting] 1 note 1 pending (no sync)');
  });
});
