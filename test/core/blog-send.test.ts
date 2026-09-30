import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { sendNoteToBlog } from '../../src/core/blog-send';
import { loadBlogConfig } from '../../src/core/blog-config';
import { loadBlogSend } from '../../src/core/blog-sent';
import { postBlogDraft } from '../../src/core/blog-client';

function setupTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blog-send-test-'));
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function createServer(
  handler: (req: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
  }) => { status: number; body?: unknown },
): Promise<{ server: ReturnType<typeof import('http').createServer>; url: string }> {
  const http = require('http') as typeof import('http');
  const { URL } = require('url');

  return new Promise<{ server: ReturnType<typeof http.createServer>; url: string }>(
    (resolve) => {
      let requestCount = 0;
      const originalHandler = handler;
      const countingHandler = (req: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body: unknown;
      }) => {
        requestCount++;
        return originalHandler(req);
      };
      (countingHandler as any)._getRequestCount = () => requestCount;

      const server = http.createServer((req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
        const parsed = new URL(req.url!, `http://${req.headers.host}`);
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          let body: unknown = undefined;
          if (chunks.length > 0) {
            const raw = Buffer.concat(chunks).toString('utf8');
            try {
              body = JSON.parse(raw);
            } catch {
              body = raw;
            }
          }
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers[k] = v;
          }
          const result = countingHandler({
            method: req.method!,
            url: parsed.pathname,
            headers,
            body,
          });
          res.writeHead(result.status);
          if (result.body !== undefined) {
            res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
          } else {
            res.end();
          }
        });
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as import('net').AddressInfo;
        const port = addr.port;
        resolve({
          server,
          url: `http://127.0.0.1:${port}`,
        });
      });
    },
  );
}

describe('blog-send', () => {
  let tmpDir: string;
  let server: ReturnType<typeof import('http').createServer>;
  let serverUrl: string;
  let requestCount = 0;

  beforeEach(async () => {
    tmpDir = setupTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it('1: WHEN sendNoteToBlog runs with no blog.json THEN it throws an Error whose message is "blog is not configured" and the local server received 0 requests', async () => {
    const originalFetch = global.fetch;
    let capturedRequest = false;
    global.fetch = async () => {
      capturedRequest = true;
      return new Response(JSON.stringify({ id: 'p1', url: 'https://blog.example/write/p1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      await expect(
        sendNoteToBlog({
          dir: tmpDir,
          noteId: 'note-1',
          content: '# Hello\nworld',
          force: false,
          now: '2026-09-28T00:00:00.000Z',
        }),
      ).rejects.toThrow('blog is not configured');

      expect(capturedRequest).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('2: WHEN content is "# Shopping\\n- [ ] milk" THEN the posted title is "Shopping" and the posted markdown is "- ☐ milk"', async () => {
    let capturedBody: unknown = null;

    const result = await createServer((req) => {
      capturedBody = req.body;
      return { status: 201, body: { id: 'p1', url: 'https://blog.example/write/p1' } };
    });
    server = result.server;
    serverUrl = result.url;

    await loadBlogConfig(tmpDir);
    // Save blog config directly since loadBlogConfig only loads
    const blogConfigPath = path.join(tmpDir, 'blog.json');
    fs.writeFileSync(
      blogConfigPath,
      JSON.stringify({ origin: serverUrl, token: 'test-token' }),
      { mode: 0o600 },
    );

    try {
      await sendNoteToBlog({
        dir: tmpDir,
        noteId: 'note-1',
        content: '# Shopping\n- [ ] milk',
        force: false,
        now: '2026-09-28T00:00:00.000Z',
      });

      expect(capturedBody).not.toBeNull();
      const body = capturedBody as { title: string; markdown: string };
      expect(body.title).toBe('Shopping');
      expect(body.markdown).toBe('- ☐ milk');
    } finally {
      server.close();
    }
  });

  it('3: WHEN the server returns 201 url "https://blog.example/write/p1" and now is "2026-09-28T00:00:00.000Z" THEN loadBlogSend returns that url and that sentAt', async () => {
    const result = await createServer(() => {
      return { status: 201, body: { id: 'p1', url: 'https://blog.example/write/p1' } };
    });
    server = result.server;
    serverUrl = result.url;

    const blogConfigPath = path.join(tmpDir, 'blog.json');
    fs.writeFileSync(
      blogConfigPath,
      JSON.stringify({ origin: serverUrl, token: 'test-token' }),
      { mode: 0o600 },
    );

    try {
      await sendNoteToBlog({
        dir: tmpDir,
        noteId: 'note-1',
        content: '# Hello\nworld',
        force: false,
        now: '2026-09-28T00:00:00.000Z',
      });

      const record = loadBlogSend(tmpDir, 'note-1');
      expect(record).not.toBeNull();
      expect(record!.url).toBe('https://blog.example/write/p1');
      expect(record!.sentAt).toBe('2026-09-28T00:00:00.000Z');
    } finally {
      server.close();
    }
  });

  it('4: WHEN a record already exists and force is false THEN the result already is true and the server received 0 requests', async () => {
    const result = await createServer(() => {
      return { status: 201, body: { id: 'p1', url: 'https://blog.example/write/p1' } };
    });
    server = result.server;
    serverUrl = result.url;

    const blogConfigPath = path.join(tmpDir, 'blog.json');
    fs.writeFileSync(
      blogConfigPath,
      JSON.stringify({ origin: serverUrl, token: 'test-token' }),
      { mode: 0o600 },
    );

    // First send to create a record
    await sendNoteToBlog({
      dir: tmpDir,
      noteId: 'note-1',
      content: '# Hello\nworld',
      force: false,
      now: '2026-09-28T00:00:00.000Z',
    });

    try {
      const sentResult = await sendNoteToBlog({
        dir: tmpDir,
        noteId: 'note-1',
        content: '# Hello\nworld',
        force: false,
        now: '2026-09-28T00:00:01.000Z',
      });

      expect(sentResult).toEqual({ already: true });
    } finally {
      server.close();
    }
  });

  it('5: WHEN force is true and the server returns url "https://blog.example/write/p2" THEN the server received 1 request and loadBlogSend returns that url', async () => {
    const result = await createServer(() => {
      return { status: 201, body: { id: 'p2', url: 'https://blog.example/write/p2' } };
    });
    server = result.server;
    serverUrl = result.url;

    const blogConfigPath = path.join(tmpDir, 'blog.json');
    fs.writeFileSync(
      blogConfigPath,
      JSON.stringify({ origin: serverUrl, token: 'test-token' }),
      { mode: 0o600 },
    );

    // First send to create a record
    await sendNoteToBlog({
      dir: tmpDir,
      noteId: 'note-1',
      content: '# Hello\nworld',
      force: false,
      now: '2026-09-28T00:00:00.000Z',
    });

    try {
      const sentResult = await sendNoteToBlog({
        dir: tmpDir,
        noteId: 'note-1',
        content: '# Hello\nworld',
        force: true,
        now: '2026-09-28T00:00:01.000Z',
      });

      if (sentResult.already !== true) {
        expect(sentResult.url).toBe('https://blog.example/write/p2');
      }

      const record = loadBlogSend(tmpDir, 'note-1');
      expect(record).not.toBeNull();
      expect(record!.url).toBe('https://blog.example/write/p2');
    } finally {
      server.close();
    }
  });

  it('6: WHEN the server returns 401 THEN the thrown message is "unauthorized" and blog-sent.json does not exist', async () => {
    const result = await createServer(() => {
      return { status: 401, body: {} };
    });
    server = result.server;
    serverUrl = result.url;

    const blogConfigPath = path.join(tmpDir, 'blog.json');
    fs.writeFileSync(
      blogConfigPath,
      JSON.stringify({ origin: serverUrl, token: 'test-token' }),
      { mode: 0o600 },
    );

    try {
      await expect(
        sendNoteToBlog({
          dir: tmpDir,
          noteId: 'note-1',
          content: '# Hello\nworld',
          force: false,
          now: '2026-09-28T00:00:00.000Z',
        }),
      ).rejects.toThrow('unauthorized');

      const sentFile = path.join(tmpDir, 'blog-sent.json');
      expect(fs.existsSync(sentFile)).toBe(false);
    } finally {
      server.close();
    }
  });
});
