/**
 * Issue #79 (slice C): `r` never claims "synced" while not connected, and a
 * server-forced sign-out ends the old sync client (no leaked socket) without
 * changing what is left on disk. Real client wiring (accountStore) against the
 * fake server; the forced sign-out is the client's own `unauthorized` event.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { accountStore } from '../../src/cli/main';
import { makeStore } from '../../src/core/store';
import { saveToken } from '../../src/core/token';
import { App } from '../../src/tui/App';
import { Root } from '../../src/tui/Root';
import type { Auth } from '../../src/tui/Root';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const EXPIRED = 'Error: Your session has expired or was revoked. Log in again.';
const EMAIL = 'test@example.com';

describe('issue #79 slice C: honest r, no leaked socket', () => {
  it('1: WHEN `r` is pressed and the store is not connected THEN the frame contains `sync requested` and does not contain `synced`', { timeout: 8000 }, async () => {
    const store = makeStore({ stubClient: {} });
    const spy = vi.fn();
    const { stdin, lastFrame, unmount } = render(<App store={store} width={80} height={24} onForceSync={spy} />);
    await waitForInput(stdin);
    stdin.write('r');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('sync requested') && !f.includes('synced'));
    expect(frame).toContain('sync requested');
    expect(frame).not.toContain('synced');
    expect(spy).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('2: WHEN `r` is pressed and the connection is green THEN the frame contains `synced ` followed by a time and forceSync was called `1` time', { timeout: 8000 }, async () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'green' } as never);
    const spy = vi.fn();
    const { stdin, lastFrame, unmount } = render(<App store={store} width={80} height={24} onForceSync={spy} />);
    await waitForInput(stdin);
    stdin.write('r');
    const frame = await waitForFrame(lastFrame, (f) => /synced \d\d:\d\d/.test(f));
    expect(frame).toMatch(/synced \d\d:\d\d/);
    expect(frame).not.toContain('sync requested');
    expect(spy).toHaveBeenCalledTimes(1);
    unmount();
  });

  describe('server-forced sign-out', () => {
    let server: FakeSimperiumServer | null = null;
    let dir = '';

    afterEach(() => {
      server?.stop();
      server = null;
      fs.rmSync(dir, { recursive: true, force: true });
    });

    /** Root on a real account store; the server never answers the login, so a note stays unsynced. */
    async function start(saved: boolean) {
      server = new FakeSimperiumServer();
      await server.start();
      server.ignoreInitConnections = 1000;
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-79c-'));
      if (saved) await saveToken(dir, { email: EMAIL, token: 'test-token', server: server.url });
      let built: ReturnType<typeof accountStore> | null = null;
      const makeStoreFor = vi.fn((auth: Auth, onLogout: () => void) => {
        built = accountStore({ dataDir: dir, appId: 'test-app', server: server!.url, authWatchdogMs: 60000 }, auth, onLogout);
        return built.store as never;
      });
      const r = render(
        <Root
          dataDir={dir}
          server={server.url}
          width={80}
          height={24}
          makeStoreFor={makeStoreFor}
          requestCode={vi.fn().mockResolvedValue(undefined)}
          completeLogin={vi.fn().mockResolvedValue('test-token')}
          passwordLogin={vi.fn().mockResolvedValue('test-token')}
        />,
      );
      if (!saved) {
        await waitForInput(r.stdin);
        await waitForFrame(r.lastFrame, 'Email:');
        await new Promise((res) => setImmediate(res));
        r.stdin.write(EMAIL);
        await waitForFrame(r.lastFrame, `Email: ${EMAIL}`);
        r.stdin.write('\t');
        await waitForFrame(r.lastFrame, `Password login for ${EMAIL}`);
        r.stdin.write('hunter2secret');
        await waitForFrame(r.lastFrame, 'Password: *************');
        r.stdin.write('\r');
      }
      await vi.waitFor(() => {
        const c = (built as unknown as ReturnType<typeof accountStore> | null)?.store as unknown as { client?: { open?: boolean } } | undefined;
        if (!c?.client?.open || server!.openSockets.size !== 1) throw new Error('no connected client and one open socket yet');
      }, { timeout: 5000, interval: 10 });
      const b = built as unknown as ReturnType<typeof accountStore>;
      b.store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n1' as never, note: { content: 'unsynced', systemTags: [], tags: [] } } as never);
      const unsynced = path.join(dir, EMAIL, 'unsynced.json');
      await vi.waitFor(() => {
        if (!fs.existsSync(unsynced)) throw new Error('unsynced.json not written yet');
      }, { timeout: 5000, interval: 10 });
      return { r, b, unsynced };
    }

    async function forceLogout(saved: boolean, waitForSockets: boolean) {
      const { r, b, unsynced } = await start(saved);
      const existed = fs.existsSync(unsynced);
      (b.store as unknown as { client: { emit: (e: string) => void } }).client.emit('unauthorized');
      const frame = await waitForFrame(r.lastFrame, (f) => f.includes('Email:') && f.includes(EXPIRED));
      if (waitForSockets) {
        await vi.waitFor(() => {
          if (server!.openSockets.size !== 0) throw new Error(`${server!.openSockets.size} sockets still open`);
        }, { timeout: 5000, interval: 10 });
      }
      r.unmount();
      return { existed, frame, left: fs.readdirSync(dir) };
    }

    it('3: WHEN a saved-token session is signed out by the server with one unsynced note THEN the server\'s open sockets drop to `0` and the data folder is left `[]` exactly as before this change', { timeout: 15000 }, async () => {
      const { existed, left } = await forceLogout(true, true);
      expect(existed).toBe(true);
      expect(server!.openSockets.size).toBe(0);
      expect(left).toEqual([]);
    });

    it('4: WHEN a session started from the login screen is signed out by the server with one unsynced note THEN the server\'s open sockets drop to `0` and the data folder is left `[]` exactly as before this change', { timeout: 15000 }, async () => {
      const { existed, left } = await forceLogout(false, true);
      expect(existed).toBe(true);
      expect(server!.openSockets.size).toBe(0);
      expect(left).toEqual([]);
    });

    it('5: WHEN the server signs the session out THEN the login screen still shows `Error: Your session has expired or was revoked. Log in again.`', { timeout: 15000 }, async () => {
      const { frame } = await forceLogout(true, false);
      expect(frame).toContain(EXPIRED);
      expect(frame).toContain('Email:');
    });

    it('6: WHEN the user logs out themselves (`L`, then `logout` and Enter) THEN the login screen shows no `expired` text and the server\'s open sockets drop to `0`', { timeout: 15000 }, async () => {
      const { r } = await start(true);
      await waitForFrame(r.lastFrame, '1 note');
      r.stdin.write('L');
      await waitForFrame(r.lastFrame, "type 'logout' to confirm");
      r.stdin.write('logout');
      await waitForFrame(r.lastFrame, "to confirm: logout");
      r.stdin.write('\r');
      const frame = await waitForFrame(r.lastFrame, (f) => f.includes('Email:'));
      await vi.waitFor(() => {
        if (server!.openSockets.size !== 0) throw new Error('socket still open');
      }, { timeout: 5000, interval: 10 });
      expect(frame).not.toContain('expired');
      expect(server!.openSockets.size).toBe(0);
      r.unmount();
    });
  });
});
