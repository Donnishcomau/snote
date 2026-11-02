/**

 * dynamic `import()` (#234). When that chunk cannot be loaded, the user sees an error notice and
 * nothing is lost: the note is unchanged and no file is written. Here both chunks fail to load:
 * each module's mock factory throws, so the `import()` rejects (vitest wraps the factory's error in
 * its own message, so the tests read the notice line, not a fixed wording).
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

vi.mock('../../src/core/blog-send', () => {
  throw new Error('chunk load failed: blog-send');
});
vi.mock('../../src/core/export-note', () => {
  throw new Error('chunk load failed: export-note');
});

/** The notice line: the line right above the key hints (`? Help ...`), or '' when there is none. */
function noticeLine(frame: string): string {
  const lines = frame.split('\n');
  const hints = lines.findIndex((l) => l.startsWith('? Help'));
  return hints > 0 ? lines[hints - 1] : '';
}

const NOTE = { content: '# Plan\nkeep this draft', tags: [], systemTags: [], deleted: false, creationDate: 1000, modificationDate: 1000 };

describe('#237 a lazy chunk that fails to load', () => {
  let base: string;
  let docs: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'snote-lazy-chunk-'));
    docs = join(base, 'docs');
    mkdirSync(join(base, 'snote'), { recursive: true });
    mkdirSync(docs);
    for (const k of ['XDG_DATA_HOME', 'XDG_DOCUMENTS_DIR']) saved[k] = process.env[k];
    process.env.XDG_DATA_HOME = base;
    process.env.XDG_DOCUMENTS_DIR = docs;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(base, { recursive: true, force: true });
  });

  it('1: WHEN the blog-send chunk import rejects after `y` THEN the frame shows an error notice and the draft is still there', async () => {
    writeFileSync(join(base, 'snote', 'blog.json'), JSON.stringify({ origin: 'http://127.0.0.1:9', token: 'tok' }));
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'k1' as never, note: NOTE as never });
    const r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, '1 note');
    r.stdin.write('\t');
    await waitForFrame(r.lastFrame, 'keep this draft');
    r.stdin.write('b');
    await waitForFrame(r.lastFrame, 'Send this note to your blog as a draft?');
    r.stdin.write('y');
    const frame = await waitForFrame(r.lastFrame, (f) => /error/.test(noticeLine(f)) && f.includes('keep this draft'));
    expect(noticeLine(frame)).toMatch(/error/);
    expect(noticeLine(frame)).not.toContain('focus:');
    expect(frame).toContain('keep this draft');
    expect(frame).not.toContain('draft sent to your blog');
    expect((store.getState().data.notes.get('k1' as never) as { content: string }).content).toBe('# Plan\nkeep this draft');
    expect(existsSync(join(base, 'snote', 'blog-sent.json'))).toBe(false);
    r.unmount();
  });

  it('2: WHEN the note-export chunk import rejects THEN the frame shows an error notice and no file is written', async () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'w1' as never, note: NOTE as never });
    const r = render(<App store={store} width={80} height={24} />);
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, '1 note');
    r.stdin.write('w');
    await waitForFrame(r.lastFrame, 'export');
    r.stdin.write('\r');
    const frame = await waitForFrame(r.lastFrame, (f) => noticeLine(f).startsWith('export failed:'));
    expect(noticeLine(frame)).toMatch(/^export failed: .*error/);
    expect(frame).not.toContain('exported:');
    expect(readdirSync(docs)).toEqual([]);
    r.unmount();
  });
});
