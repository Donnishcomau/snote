import { postBlogDraft } from '../../src/core/blog-client';

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
          const result = handler({
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

describe('blog-client', () => {
  describe('postBlogDraft', () => {
    it('1: WHEN postBlogDraft sends title "Hello" and token "secret-token" THEN the path is "/api/agent/posts" and the Authorization header is "Bearer secret-token"', async () => {
      let captured: { url: string; headers: Record<string, string> } | null = null;

      const { server, url } = await createServer((req) => {
        captured = { url: req.url, headers: req.headers };
        return { status: 201, body: { id: 'p1', url: 'https://blog.example/write/p1' } };
      });

      try {
        await postBlogDraft({
          origin: url,
          token: 'secret-token',
          title: 'Hello',
          markdown: 'some content',
        });

        expect(captured).not.toBeNull();
        expect(captured!.url).toBe('/api/agent/posts');
        expect(captured!.headers['authorization']).toBe('Bearer secret-token');
      } finally {
        server.close();
      }
    });

    it('2: WHEN the server returns 201 body {"id":"p1","url":"https://blog.example/write/p1","state":"draft"} THEN the result id is "p1", the url is "https://blog.example/write/p1", and the posted JSON draft is true', async () => {
      let capturedBody: unknown = null;

      const { server, url } = await createServer((req) => {
        capturedBody = req.body;
        return {
          status: 201,
          body: { id: 'p1', url: 'https://blog.example/write/p1', state: 'draft' },
        };
      });

      try {
        const result = await postBlogDraft({
          origin: url,
          token: 'token1',
          title: 'Test',
          markdown: 'content',
        });

        expect(result.id).toBe('p1');
        expect(result.url).toBe('https://blog.example/write/p1');
        expect((capturedBody as { draft?: unknown })?.draft).toBe(true);
      } finally {
        server.close();
      }
    });

    it('3: WHEN the server returns 401 THEN the thrown message is "unauthorized"', async () => {
      const { server, url } = await createServer(() => {
        return { status: 401, body: {} };
      });

      try {
        await expect(
          postBlogDraft({
            origin: url,
            token: 'token1',
            title: 'Test',
            markdown: 'content',
          }),
        ).rejects.toThrow('unauthorized');
      } finally {
        server.close();
      }
    });

    it('4: WHEN the server returns 422 with body {"error":"a title is required"} THEN the thrown message is "a title is required"', async () => {
      const { server, url } = await createServer(() => {
        return {
          status: 422,
          body: { error: 'a title is required' },
        };
      });

      try {
        await expect(
          postBlogDraft({
            origin: url,
            token: 'token1',
            title: 'Test',
            markdown: 'content',
          }),
        ).rejects.toThrow('a title is required');
      } finally {
        server.close();
      }
    });

    it('5: WHEN the server returns 429 THEN the thrown message is "rate limited"', async () => {
      const { server, url } = await createServer(() => {
        return { status: 429, body: {} };
      });

      try {
        await expect(
          postBlogDraft({
            origin: url,
            token: 'token1',
            title: 'Test',
            markdown: 'content',
          }),
        ).rejects.toThrow('rate limited');
      } finally {
        server.close();
      }
    });

    it('6: WHEN the origin ends in "/" THEN the request path is still "/api/agent/posts"', async () => {
      let captured: { url: string; headers: Record<string, string> } | null = null;

      const { server, url } = await createServer((req) => {
        captured = { url: req.url, headers: req.headers };
        return { status: 201, body: { id: 'p1', url: 'https://blog.example/write/p1' } };
      });

      try {
        await postBlogDraft({
          origin: `${url}/`,
          token: 'secret-token',
          title: 'Hello',
          markdown: 'some content',
        });

        expect(captured).not.toBeNull();
        expect(captured!.url).toBe('/api/agent/posts');
      } finally {
        server.close();
      }
    });
  });
});
