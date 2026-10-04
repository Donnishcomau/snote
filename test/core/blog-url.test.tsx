import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AddressInfo } from 'node:net';
import React from 'react';
import { render } from 'ink-testing-library';

import { normalizeBlogUrl } from '../../src/core/blog-client';
import { blogStatusLine } from '../../src/core/blog-sent';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

describe('blog url normalisation', () => {
  it('a: WHEN the url is `//host/write/x` and the origin is `https://skryf.art` THEN the result is `https://host/write/x`', () => {
    expect(normalizeBlogUrl('//host/write/x', 'https://skryf.art')).toBe('https://host/write/x');
  });

  it('b: WHEN the url is `/write/x` and the origin is `https://skryf.art` THEN the result is `https://skryf.art/write/x`', () => {
    expect(normalizeBlogUrl('/write/x', 'https://skryf.art')).toBe('https://skryf.art/write/x');
  });

  it('c: WHEN the url is `https://host/x` THEN it is unchanged', () => {
    expect(normalizeBlogUrl('https://host/x', 'https://skryf.art')).toBe('https://host/x');
  });

  it('e: WHEN a saved record holds a protocol-relative url THEN the status line shows `https://`', () => {
    const line = blogStatusLine({ sentAt: '2026-10-01T00:00:00Z', url: '//wonka.skryf.art/write/p' });
    expect(line).toBe('Sent as draft · 2026-10-01 · https://wonka.skryf.art/write/p');
  });

  it('d: WHEN the server returns a protocol-relative url THEN the preview shows `Sent as draft` and the origin scheme (`http://` for the local fake) plus the host', async () => {
    const server = createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'p9', url: '//wonka.skryf.art/write/p9' }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    const base = mkdtempSync(join(tmpdir(), 'blog-url-'));
    const dir = join(base, 'snote');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'blog.json'),
      JSON.stringify({ origin: `http://127.0.0.1:${port}`, token: 't' }),
    );
    const prev = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = base;
    try {
      const store = makeStore({ stubClient: {} });
      store.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: 'k1' as never,
        note: {
          content: 'Hello',
          tags: [],
          systemTags: [],
          deleted: false,
          creationDate: 1000,
          modificationDate: 1000,
        } as never,
      });
      const r = render(<App store={store} width={100} height={24} />);
      await delay(50);
      r.stdin.write('\t');
      await delay(50);
      r.stdin.write('b');
      let frame = '';
      for (let i = 0; i < 50 && !frame.includes('Send this note'); i++) {
        await delay(50);
        frame = stripAnsi(r.lastFrame());
      }
      r.stdin.write('y');
      for (let i = 0; i < 50; i++) {
        await delay(50);
        frame = stripAnsi(r.lastFrame());
        if (frame.includes('Sent as draft') && frame.includes('http://wonka.skryf.art')) break;
      }
      expect(frame).toContain('Sent as draft');
      expect(frame).toContain('http://wonka.skryf.art');
      r.unmount();
    } finally {
      if (prev === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prev;
      server.close();
      rmSync(base, { recursive: true, force: true });
    }
  });
});
