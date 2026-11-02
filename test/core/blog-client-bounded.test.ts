/**
 * #195: the blog send has a deadline that covers headers and
 * body, and reads the reply through the one bounded helper.
 */
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { postBlogDraft } from '../../src/core/blog-client';

const servers: Server[] = [];
const sockets = new Set<Socket>();

/** Start a local server; resolves to its origin. */
async function serve(handler: (res: ServerResponse) => void): Promise<string> {
  const server = createServer((req, res) => {
    req.resume();
    handler(res);
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** The message the send failed with, 'resolved', or a marker if it was still pending after `ms`. */
async function outcome(call: Promise<unknown>, ms: number): Promise<string> {
  return Promise.race([
    call.then(
      () => 'resolved',
      (e: Error) => e.message,
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve(`still pending after ${ms} ms`), ms)),
  ]);
}

const send = (origin: string, timeoutMs?: number) =>
  postBlogDraft({ origin, token: 'TOKEN', title: 'T', markdown: 'body', timeoutMs });

afterEach(async () => {
  for (const s of sockets) s.destroy();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe('#195 blog send is bounded', () => {
  it('1: WHEN the blog server accepts the request and never sends headers, and the timeout is `300` ms THEN postBlogDraft rejects with a message containing `no answer from 127.0.0.1:` within 1500 ms', async () => {
    const origin = await serve(() => {
      /* accept and never answer */
    });
    expect(await outcome(send(origin, 300), 1500)).toContain('no answer from 127.0.0.1:');
  });

  it('2: WHEN the blog server sends 201 headers and part of the body and never finishes it, and the timeout is `300` ms THEN postBlogDraft rejects with a message containing `no answer from 127.0.0.1:` within 1500 ms', async () => {
    const origin = await serve((res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.write('{"id":"x",');
    });
    expect(await outcome(send(origin, 300), 1500)).toContain('no answer from 127.0.0.1:');
  });

  it('3: WHEN the blog server sends a body larger than 1 MiB (8 MiB, never ended) THEN postBlogDraft rejects with a message containing `is larger than 1048576 bytes` within 2000 ms', async () => {
    const chunk = Buffer.alloc(65536, 97);
    const origin = await serve((res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
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
    expect(await outcome(send(origin), 2000)).toContain('is larger than 1048576 bytes');
  });

  it('4: WHEN the blog server answers 201, 401, 422 and 429 THEN postBlogDraft resolves with id `p1` and rejects with `unauthorized`, `a title is required` and `rate limited`, and a 201 reply that is not JSON rejects with `unexpected reply from 127.0.0.1:` without the reply\'s bytes', async () => {
    const originFor = (status: number, body: string): Promise<string> =>
      serve((res) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(body);
      });
    const answer = async (status: number, body: string): Promise<string> =>
      outcome(send(await originFor(status, body)), 2000);
    const created = await send(await originFor(201, '{"id":"p1","url":"/write/p1"}'));
    expect(created.id).toBe('p1');
    const hostile = await serve((res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end('\x1b]52;c;aGk=\x07 not json');
    });
    const unexpected = await outcome(send(hostile), 2000);
    expect(unexpected).toContain('unexpected reply from 127.0.0.1:');
    expect(unexpected).not.toContain('\x1b');
    expect(await answer(401, '')).toBe('unauthorized');
    expect(await answer(422, '{"error":"a title is required"}')).toBe('a title is required');
    expect(await answer(429, '')).toBe('rate limited');
  });
});
