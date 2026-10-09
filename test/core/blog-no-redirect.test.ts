import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { postBlogDraft } from '../../src/core/blog-client';

function listen(
  handler: http.RequestListener,
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

describe('blog send never follows a redirect', () => {
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
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end('{"id":"x","url":"/p/x"}');
      });
    });
    servers.push(b.server);
    bPort = b.port;
  });

  afterEach(async () => {
    await Promise.all(
      servers.map((s) => new Promise((r) => s.close(() => r(null)))),
    );
  });

  async function redirectingA(status: number): Promise<string> {
    const a = await listen((req, res) => {
      req.resume();
      res.writeHead(status, {
        Location: `http://127.0.0.1:${bPort}/api/agent/posts`,
      });
      res.end();
    });
    servers.push(a.server);
    return `http://127.0.0.1:${a.port}`;
  }

  const send = (origin: string) =>
    postBlogDraft({ origin, token: 'TOKEN', title: 'T', markdown: 'SECRETBODY' });

  it('1: WHEN A answers `307` THEN `postBlogDraft` rejects and B received `0` requests.', async () => {
    const origin = await redirectingA(307);
    await expect(send(origin)).rejects.toBeDefined();
    expect(bRequests.length).toBe(0);
  });

  it('2: WHEN A answers `308` THEN `postBlogDraft` rejects and B received `0` requests.', async () => {
    const origin = await redirectingA(308);
    await expect(send(origin)).rejects.toBeDefined();
    expect(bRequests.length).toBe(0);
  });

  it('3: WHEN A itself answers `201` with `{"id":"x","url":"/p/x"}` THEN `postBlogDraft` resolves with id `x`.', async () => {
    const a = await listen((req, res) => {
      req.resume();
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end('{"id":"x","url":"/p/x"}');
    });
    servers.push(a.server);
    const result = await send(`http://127.0.0.1:${a.port}`);
    expect(result.id).toBe('x');
  });
});
