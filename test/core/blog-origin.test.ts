/**
 * T504 (F153): a blog origin read from `blog.json` is refused unless it is
 * https, or http to localhost, 127.0.0.1 or [::1], with no credentials.
 * A refused origin sends no request.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { AddressInfo } from 'node:net';

import { sendNoteToBlog } from '../../src/core/blog-send';
import { loadBlogSend } from '../../src/core/blog-sent';

const REFUSAL = 'blog origin is not allowed: use https (http only for localhost)';

function setupTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blog-origin-test-'));
}

function writeBlogConfig(dir: string, origin: string): void {
  fs.writeFileSync(
    path.join(dir, 'blog.json'),
    JSON.stringify({ origin, token: 'BLOGTOKEN' }),
    { mode: 0o600 },
  );
}

// The gate scan in scripts/gates.sh requires an assert call inside every
// it() body, so this helper only counts fetches and returns the rejection;
// each it() below does its own asserting. The helper returns the rejection
// (it does not rethrow); if the promise unexpectedly resolves it returns the
// resolved value instead.
async function refusalOf(dir: string): Promise<unknown> {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = (async () => {
    fetchCalls++;
    return new Response('{}', { status: 201 });
  }) as typeof fetch;
  try {
    return await sendNoteToBlog({
      dir,
      noteId: 'n1',
      content: '# Hi\nbody',
      force: false,
      now: '2026-10-09T00:00:00.000Z',
    }).then(
      (r) => ({ resolved: r, fetchCalls }),
      (e: unknown) => ({ error: e, fetchCalls }),
    );
  } finally {
    global.fetch = originalFetch;
  }
}

describe('blog origin check on load (T504)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1: WHEN blog.json holds origin `http://evil.example` and sendNoteToBlog runs THEN it rejects with `blog origin is not allowed: use https (http only for localhost)`, the counting fetch stub was called 0 times and loadBlogSend(dir, \'n1\') is falsy', async () => {
    writeBlogConfig(tmpDir, 'http://evil.example');
    const r1 = await refusalOf(tmpDir);
    expect((r1 as { error: Error }).error.message).toBe(REFUSAL);
    expect((r1 as { fetchCalls: number }).fetchCalls).toBe(0);
    expect(loadBlogSend(tmpDir, 'n1')).toBeFalsy();
  });

  it('2: WHEN the origin is `https://user:pw@blog.example` THEN the same rejection, 0 fetch calls and no `blog-sent.json`', async () => {
    writeBlogConfig(tmpDir, 'https://user:pw@blog.example');
    const r2 = await refusalOf(tmpDir);
    expect((r2 as { error: Error }).error.message).toBe(REFUSAL);
    expect((r2 as { fetchCalls: number }).fetchCalls).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'blog-sent.json'))).toBe(false);
  });

  it('3: WHEN the origin is `ftp://blog.example`, and in a second case `not a url`, THEN each rejects with `blog origin is not allowed: use https (http only for localhost)` and 0 fetch calls', async () => {
    writeBlogConfig(tmpDir, 'ftp://blog.example');
    const ftp = await refusalOf(tmpDir);
    expect((ftp as { error: Error }).error.message).toBe(REFUSAL);
    expect((ftp as { fetchCalls: number }).fetchCalls).toBe(0);
    fs.writeFileSync(
      path.join(tmpDir, 'blog.json'),
      JSON.stringify({ origin: 'not a url', token: 'BLOGTOKEN' }),
      { mode: 0o600 },
    );
    const bad = await refusalOf(tmpDir);
    expect((bad as { error: Error }).error.message).toBe(REFUSAL);
    expect((bad as { fetchCalls: number }).fetchCalls).toBe(0);
  });

  it('4: WHEN the origin is `http://evil.example/\\u001b]52;c;aGk=\\u0007` THEN the rejection message equals the constant above, contains neither `evil.example` nor `52;c`, and 0 fetch calls', async () => {
    writeBlogConfig(tmpDir, 'http://evil.example/\u001b]52;c;aGk=\u0007');
    const originalFetch = global.fetch;
    let fetchCalls = 0;
    global.fetch = (async () => {
      fetchCalls++;
      return new Response('{}', { status: 201 });
    }) as typeof fetch;
    try {
      const error = await sendNoteToBlog({
        dir: tmpDir,
        noteId: 'n1',
        content: '# Hi\nbody',
        force: false,
        now: '2026-10-09T00:00:00.000Z',
      }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(REFUSAL);
      expect((error as Error).message).not.toContain('evil.example');
      expect((error as Error).message).not.toContain('52;c');
      expect(fetchCalls).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('5: WHEN the origin is `http://127.0.0.1:<port>` of a local server and the token is `BLOGTOKEN` THEN the result postId is `p1` and the server saw exactly 1 request with header `Bearer BLOGTOKEN`', async () => {
    const seen: { count: number; authorization?: string } = { count: 0 };
    const server = http.createServer((req, res) => {
      seen.count++;
      seen.authorization = req.headers.authorization;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'p1', url: 'https://blog.example/write/p1' }));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    writeBlogConfig(tmpDir, `http://127.0.0.1:${port}`);
    try {
      const result = await sendNoteToBlog({
        dir: tmpDir,
        noteId: 'n1',
        content: '# Hi\nbody',
        force: false,
        now: '2026-10-09T00:00:00.000Z',
      });
      expect(result.already).not.toBe(true);
      expect((result as { postId: string }).postId).toBe('p1');
      expect(seen.count).toBe(1);
      expect(seen.authorization).toBe('Bearer BLOGTOKEN');
    } finally {
      server.close();
    }
  });
});
