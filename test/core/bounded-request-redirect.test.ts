// (#626): a bounded request refuses a redirect, so the credentials in the body
// never reach the server named by a Location header.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { completeLogin, loginWithPassword, requestLoginCode } from '../../src/core/auth';

function listen(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

describe('auth requests refuse a redirect', () => {
  let servers: http.Server[] = [];
  let bRequests: string[] = [];
  let bPort = 0;

  beforeEach(async () => {
    servers = [];
    bRequests = [];
    const b = await listen((req, res) => {
      req.resume();
      req.on('end', () => {
        bRequests.push(req.url ?? '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"access_token":"t","sync_token":"t"}');
      });
    });
    servers.push(b.server);
    bPort = b.port;
  });

  afterEach(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(() => r(null)))));
  });

  async function redirectingA(status: number): Promise<string> {
    const a = await listen((req, res) => {
      req.resume();
      res.writeHead(status, { Location: `http://127.0.0.1:${bPort}/steal` });
      res.end();
    });
    servers.push(a.server);
    return `http://127.0.0.1:${a.port}`;
  }

  it('1: WHEN A answers a POST with 307 naming B THEN loginWithPassword rejects with `could not reach` and B received 0 requests', async () => {
    const base = await redirectingA(307);
    await expect(loginWithPassword('e@x.test', 'pw', { authBase: base })).rejects.toThrow('could not reach');
    expect(bRequests).toEqual([]);
  });

  it('2: WHEN A answers 307 or 308 THEN completeLogin and requestLoginCode (and for 308 loginWithPassword) reject with `could not reach` and B received 0 requests', async () => {
    for (const status of [307, 308]) {
      const base = await redirectingA(status);
      await expect(completeLogin('e@x.test', '123456', { accountBase: base })).rejects.toThrow('could not reach');
      await expect(requestLoginCode('e@x.test', { accountBase: base })).rejects.toThrow('could not reach');
      if (status === 308) {
        await expect(loginWithPassword('e@x.test', 'pw', { authBase: base })).rejects.toThrow('could not reach');
      }
    }
    expect(bRequests).toEqual([]);
  });

  it('3: WHEN A answers 200 with an access_token THEN loginWithPassword resolves with it and B received 0 requests', async () => {
    const a = await listen((req, res) => {
      req.resume();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"access_token":"tok1"}');
    });
    servers.push(a.server);
    const token = await loginWithPassword('e@x.test', 'pw', { authBase: `http://127.0.0.1:${a.port}` });
    expect(token).toBe('tok1');
    expect(bRequests).toEqual([]);
  });
});
