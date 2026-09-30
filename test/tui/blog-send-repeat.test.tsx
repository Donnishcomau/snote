/**
 * Regression: a second send-to-blog question in one running app must still
 * answer to `y`.
 *
 * Root cause: useBlogSendAskState's phase-application effect ran as a
 * passive `useEffect`, adding an extra deferred render hop between the
 * `b`/`y` keypress and the freshly mounted Confirm's own `useInput`
 * listener registering (which Ink also does in a passive effect). Under
 * load the gap could outlast the next keypress, so the second `y` was
 * silently dropped: the Confirm stayed on screen, unanswered. Switching
 * the phase-application effect to `useLayoutEffect` collapses that extra
 * hop so the new Confirm (and its listener) is ready before the next
 * keypress is simulated.
 */

import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AddressInfo } from 'node:net';
import React from 'react';
import { render } from 'ink-testing-library';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

const QUESTION = 'Send this note to your blog as a draft?';

async function pollUntil(
  lastFrame: () => string | undefined,
  done: (frame: string) => boolean,
): Promise<string> {
  let frame = '';
  for (let i = 0; i < 50; i++) {
    await delay(50);
    frame = stripAnsi(lastFrame());
    if (done(frame)) return frame;
  }
  return frame;
}

async function withTempDataDir(run: (dir: string) => Promise<void>): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'blog-send-repeat-'));
  const dir = join(base, 'snote');
  mkdirSync(dir, { recursive: true });
  const prev = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = base;
  try {
    await run(dir);
  } finally {
    if (prev === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = prev;
    rmSync(base, { recursive: true, force: true });
  }
}

describe('blog send repeat', () => {
  it('WHEN a note is sent successfully and then `b` and `y` are pressed again while the server now returns 401 THEN the frame contains `unauthorized`', async () => {
    await withTempDataDir(async (dir) => {
      let status = 201;
      const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(
            status === 201
              ? JSON.stringify({ id: 'p1', url: 'https://blog.example/write/p1' })
              : '',
          );
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as AddressInfo).port;
      const url = `http://127.0.0.1:${port}`;
      writeFileSync(join(dir, 'blog.json'), JSON.stringify({ origin: url, token: 'tok' }));
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
        const r = render(<App store={store} width={80} height={24} />);
        await delay(50);
        r.stdin.write('\t');
        await delay(50);
        r.stdin.write('b');
        await pollUntil(r.lastFrame, (f) => f.includes(QUESTION));
        r.stdin.write('y');
        await pollUntil(r.lastFrame, (f) => f.includes('draft sent') || !f.includes(QUESTION));
        await delay(100);

        status = 401;
        r.stdin.write('b');
        await pollUntil(r.lastFrame, (f) => f.includes('Already sent'));
        r.stdin.write('y');
        const frame = await pollUntil(r.lastFrame, (f) => f.includes('unauthorized'));
        expect(frame).toContain('unauthorized');
        r.unmount();
      } finally {
        server.close();
      }
    });
  }, 10000);
});
