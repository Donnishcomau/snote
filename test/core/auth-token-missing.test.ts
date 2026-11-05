/**
 * #627: a 200 reply to a login call that carries no token is refused, so no
 * token-less auth.json is saved (the caller only saves what the call returns).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { completeLogin, loginWithPassword } from '../../src/core/auth';

const servers: Server[] = [];

/** A local server that answers every request with status 200 and `body`; resolves to its base url. */
async function answer(body: string): Promise<string> {
  const server = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** The message the call failed with, or `resolved <value>`. */
async function outcome(call: Promise<string>): Promise<string> {
  return call.then(
    (v) => `resolved ${JSON.stringify(v)}`,
    (e: Error) => e.message,
  );
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe('#627 a 200 login reply without a token is refused', () => {
  it('1: WHEN the login server answers 200 with `{}`, `null`, `{"sync_token":""}` or `{"sync_token":5}` THEN completeLogin rejects with `unexpected reply from 127.0.0.1:<port>` each time', async () => {
    for (const body of ['{}', 'null', '{"sync_token":""}', '{"sync_token":5}']) {
      const base = await answer(body);
      const message = await outcome(completeLogin('a@b.co', 'abc', { accountBase: base }));
      expect(message, body).toBe(`unexpected reply from ${new URL(base).host}`);
    }
  });

  it('2: WHEN the login server answers 200 with `{}`, `null`, `{"access_token":""}` or `{"access_token":5}` THEN loginWithPassword rejects with `unexpected reply from 127.0.0.1:<port>` each time', async () => {
    for (const body of ['{}', 'null', '{"access_token":""}', '{"access_token":5}']) {
      const base = await answer(body);
      const message = await outcome(loginWithPassword('a@b.co', 'pw', { authBase: base, appId: 'app', apiKey: 'k' }));
      expect(message, body).toBe(`unexpected reply from ${new URL(base).host}`);
    }
  });

  it('3: WHEN the login server answers 200 with `{"sync_token":"st-1"}` and `{"access_token":"tok-1"}` THEN completeLogin resolves with `st-1` and loginWithPassword with `tok-1`', async () => {
    const code = await answer('{"sync_token":"st-1"}');
    const pw = await answer('{"access_token":"tok-1","userid":"u1"}');
    expect(await outcome(completeLogin('a@b.co', 'abc', { accountBase: code }))).toBe('resolved "st-1"');
    expect(await outcome(loginWithPassword('a@b.co', 'pw', { authBase: pw, appId: 'app', apiKey: 'k' }))).toBe('resolved "tok-1"');
  });
});
