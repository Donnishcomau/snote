/**
 * #179 (test infrastructure): a websocket upgrade that the fake server handles after stop() destroys the socket
 * and never throws. Today `stop()` sets `wsServer` to null, and the `upgrade` handler then dereferences
 * `this.wsServer!` (server.ts, the `upgrade` handler), raising an unhandled TypeError that vitest blames on
 * whichever test file is running (seen in the #206 and sync-8 mini runs).
 * The race is made deterministic: a listener prepended to the http server's `upgrade` event calls stop() first.
 */
import { describe, it, expect } from 'vitest';
import * as http from 'node:http';
import * as net from 'node:net';
import { FakeSimperiumServer } from './server';

describe('#179 fake server: upgrade after stop', () => {
  it('1: WHEN the server handles a websocket upgrade after `stop()` THEN it destroys the socket and no `uncaughtException` is raised', async () => {
    const server = new FakeSimperiumServer();
    const { port } = await server.start();
    const httpServer = (server as unknown as { httpServer: http.Server }).httpServer;
    httpServer.prependListener('upgrade', () => server.stop());
    const errors: unknown[] = [];
    const onErr = (e: unknown) => errors.push(e);
    process.on('uncaughtException', onErr);
    const sock = net.connect(port, '127.0.0.1');
    sock.on('error', () => {}); // the server resets the socket; a client-side error is expected
    try {
      await new Promise<void>((resolve) => sock.once('connect', () => resolve()));
      const closed = new Promise<void>((resolve) => sock.once('close', () => resolve()));
      sock.write('GET /sock/1/test-app/websocket HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
      // settle on whichever comes first: the socket closes, or an uncaught error is seen (bounded at 1500 ms)
      const deadline = Date.now() + 1500;
      let isClosed = false;
      void closed.then(() => { isClosed = true; });
      while (!isClosed && errors.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setImmediate(r));
      expect(errors).toEqual([]);
      expect(sock.destroyed).toBe(true);
    } finally {
      process.off('uncaughtException', onErr);
      sock.destroy();
    }
  });
});
