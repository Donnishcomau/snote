/**
 * #191 (marketplace review #12334): the login request's deadline covers the
 * whole body, and the reply is read through the one bounded helper.
 */
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { completeLogin, loginWithPassword } from '../../src/core/auth';

const servers: Server[] = [];
const sockets = new Set<Socket>();

/** Start a local server; resolves to its base url. */
async function serve(handler: (url: string, res: ServerResponse, socket: Socket) => void): Promise<string> {
  const server = createServer((req, res) => {
    req.resume();
    handler(req.url ?? '', res, req.socket);
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** The message the login call failed with, or a marker if it was still pending after `ms`. */
async function outcome(call: Promise<unknown>, ms: number): Promise<string> {
  return Promise.race([
    call.then(
      () => 'resolved',
      (e: Error) => e.message,
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve(`still pending after ${ms} ms`), ms)),
  ]);
}

afterEach(async () => {
  for (const s of sockets) s.destroy();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe('#191 login request is bounded', () => {
  it('1: WHEN the login server sends the headers and part of the body and never finishes it, and the timeout is `300` ms THEN loginWithPassword rejects with a message containing `no answer from 127.0.0.1:` within 1500 ms and the server sees the request socket `closed` within 500 ms after that', async () => {
    let closed: Promise<string> = new Promise(() => undefined);
    const base = await serve((_url, res, socket) => {
      closed = new Promise((resolve) => socket.once('close', () => resolve('closed')));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"access_token":"t",');
    });
    const message = await outcome(
      loginWithPassword('a@b.co', 'pw', { authBase: base, appId: 'app', apiKey: 'k', timeoutMs: 300 }),
      1500,
    );
    const socketState = await Promise.race([
      closed,
      new Promise<string>((resolve) => setTimeout(() => resolve('still open 500 ms after the reject'), 500)),
    ]);
    expect(message).toContain('no answer from 127.0.0.1:');
    expect(socketState).toBe('closed');
  });

  it('2: WHEN the login server sends a body larger than 1 MiB (8 MiB, never ended) THEN loginWithPassword rejects with a message containing `is larger than 1048576 bytes` within 2000 ms', async () => {
    const chunk = Buffer.alloc(65536, 97);
    const base = await serve((_url, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      let sent = 0;
      const pump = (): void => {
        while (!res.destroyed && sent < 8 * 1048576) {
          sent += chunk.length;
          if (!res.write(chunk)) {
            res.once('drain', pump);
            return;
          }
        }
      };
      pump();
    });
    const message = await outcome(
      loginWithPassword('a@b.co', 'pw', { authBase: base, appId: 'app', apiKey: 'k' }),
      2000,
    );
    expect(message).toContain('is larger than 1048576 bytes');
  });

  it('3: WHEN the login server answers normally THEN loginWithPassword resolves with `tok-1`, completeLogin on a 401 rejects with `401 bad code`, and a 200 reply that is not JSON rejects with `unexpected reply from 127.0.0.1:` without the reply\'s bytes', async () => {
    const base = await serve((url, res) => {
      if (url.startsWith('/account/complete-login')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end('{"message":"bad code"}');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"access_token":"tok-1","userid":"u1"}');
      }
    });
    const token = await loginWithPassword('a@b.co', 'pw', { authBase: base, appId: 'app', apiKey: 'k' });
    expect(token).toBe('tok-1');
    const message = await outcome(completeLogin('a@b.co', 'abc', { accountBase: base }), 2000);
    expect(message).toBe('401 bad code');
    const hostile = await serve((_url, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('\x1b]52;c;aGk=\x07 not json');
    });
    const unexpected = await outcome(loginWithPassword('a@b.co', 'pw', { authBase: hostile, appId: 'app', apiKey: 'k' }), 2000);
    expect(unexpected).toContain('unexpected reply from 127.0.0.1:');
    expect(unexpected).not.toContain('\x1b');
  });
});
