/**
 * #319: a synced store keeps writing its data folder after a test's last assertion: its client writes `ghosts-*.json`
 * (and makes the folder again) whenever its socket delivers a message, and its savers write state.json and the
 * unsynced records. A test removes that folder only after this resolves: every store has stopped saving and ended its
 * client, every fake server takes no new connection, and every TCP connection to it has closed, so no socket can
 * deliver another message. No fixed sleep: it waits for the connections, within the 3 s hook timeout.
 */
import { vi } from 'vitest';

type Client = { end?: () => void; socket?: { readyState: number; close: () => void } };
type Built = { store: { client?: unknown }; stopSaving: () => void };
type Server = { stop: () => void; openSockets: Set<unknown> };

export async function stopSyncWriters(built: Built[], servers: Server[]): Promise<void> {
  const clients = built.map((b) => b.store.client as Client | undefined);
  for (const b of built) b.stopSaving();
  for (const c of clients) {
    c?.end?.();
    // end() closes only an open socket: one still connecting (readyState 0) would open later and sync, so close it too
    if (c?.socket?.readyState === 0) c.socket.close();
  }
  for (const s of servers) s.stop();
  await vi.waitFor(() => {
    const open = servers.reduce((n, s) => n + s.openSockets.size, 0);
    if (open !== 0) throw new Error(`#319: ${open} connection(s) to the fake server still open`);
  }, { timeout: 2000, interval: 10 });
  // a socket that opened after end() restarted the client's heartbeat: end it again, now that nothing is connected
  for (const c of clients) c?.end?.();
}
