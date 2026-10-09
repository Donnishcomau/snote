/**
 * T375: a running snote opens the new-note editor when a same-process
 * request arrives (emitNewRequest), and drops it while an editor is already
 * open, while search is open, or while the inline editor is open.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { emitNewRequest, onNewRequest } from '../../src/core/new-request';
import { testNotes } from './fixtures';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Poll until the frame looks right; every asserted value sits in the poll.
async function settle(
  lastFrame: () => string | undefined,
  wanted: (frame: string) => boolean
): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (wanted(lastFrame() ?? '')) return;
    await delay(25);
  }
}

const CONTENT = 'from bar';

// Three seeded notes, fixture index-based ids (as start-new does).
function seedNotes(): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  for (const [idx, note] of [testNotes[0], testNotes[2], testNotes[3]].entries()) {
    store.dispatch({
      type: 'CREATE_NOTE_WITH_ID',
      noteId: eid(`note-${idx + 1}`),
      note: {
        content: note.content,
        systemTags: note.systemTags,
        tags: note.tags,
        deleted: note.deleted,
        modificationDate: note.modificationDate,
        creationDate: note.creationDate,
      },
    });
  }
  return store;
}

describe('T375 external new-note request', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = seedNotes();
    // Module state in src/core/new-request.ts leaks between tests of one
    // file: drain any request a previous test left pending.
    const stop = onNewRequest(() => undefined);
    stop();
  });

  it("1: WHEN 3 notes are rendered, note-1 is made markdown (`MARKDOWN_NOTE`), then `emitNewRequest()` runs THEN, polled, `runEditor` (returns `from bar`) got `''` once, 4 notes exist, the new one has systemTags `['markdown']`", async () => {
    store.dispatch({
      type: 'MARKDOWN_NOTE',
      noteId: eid('note-1'),
      shouldEnableMarkdown: true,
    } as never);

    const runEditor = vi.fn().mockResolvedValue(CONTENT);
    const { lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await delay(50);

    emitNewRequest();

    let ok = false;
    await settle(
      lastFrame,
      (f) =>
        (ok =
          runEditor.mock.calls.length === 1 &&
          runEditor.mock.calls[0][0] === '' &&
          store.getState().data.notes.size === 4 &&
          f.includes('>from bar'))
    );

    expect(ok).toBe(true);
    const created = [...store.getState().data.notes.values()].find(
      (n) => n.content === CONTENT
    );
    expect(created).toBeDefined();
    expect(created!.systemTags).toEqual(['markdown']);
  });

  it('2: WHEN the first `runEditor` call is a pending promise, then `emitNewRequest()` runs again and `n` is written THEN `runEditor` was called exactly `1` time (resolve the promise at the end)', async () => {
    let resolveEditor!: (value: string | null) => void;
    const runEditor = vi.fn(
      () => new Promise<string | null>((r) => (resolveEditor = r))
    );
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await delay(50);

    emitNewRequest();
    await settle(lastFrame, () => runEditor.mock.calls.length === 1);

    emitNewRequest();
    stdin.write('n');
    await delay(100);

    expect(runEditor).toHaveBeenCalledTimes(1);

    // resolve the pending editor so no session leaks into the next test
    resolveEditor(null);
    await delay(50);
    expect(lastFrame() ?? '').toBeTruthy();
  });

  it("3: WHEN `/` then `ab` are written and `emitNewRequest()` runs THEN `runEditor` was called `0` times and the frame contains `ab` and does not contain `abn`", async () => {
    const runEditor = vi.fn().mockResolvedValue(CONTENT);
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await delay(50);

    stdin.write('/');
    await delay(50);
    stdin.write('ab');
    await delay(50);

    emitNewRequest();
    await delay(100);

    const frame = lastFrame() ?? '';
    expect(runEditor).toHaveBeenCalledTimes(0);
    expect(frame).toContain('ab');
    expect(frame).not.toContain('abn');

    // Escape closes the search, leaving no live listener for the next test
    stdin.write('\x1b');
    await delay(50);
    expect(lastFrame() ?? '').toBeTruthy();
  });

  it("4: WHEN `i` is written with a note selected and `emitNewRequest()` runs THEN `runEditor` was called `0` times and the frame does not contain `Preview:`", async () => {
    const runEditor = vi.fn().mockResolvedValue(CONTENT);
    const { stdin, lastFrame } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await delay(50);

    stdin.write('i');
    await delay(50);

    emitNewRequest();
    await delay(100);

    const frame = lastFrame() ?? '';
    expect(runEditor).toHaveBeenCalledTimes(0);
    expect(frame).not.toContain('Preview:');

    // close the inline editor (no edits, so Escape closes it directly)
    stdin.write('\x1b');
    await delay(50);
    expect(lastFrame() ?? '').toContain('Preview:');
  });

  it("5: WHEN `src/tui/App.tsx` is read THEN `trimEnd().split('\\n').length` is `247` and the line starting `  useAppEffects(` contains `EXTERNAL_KEY` and `startNew`", () => {
    const src = readFileSync(resolve(process.cwd(), 'src/tui/App.tsx'), 'utf8');
    expect(src.trimEnd().split('\n').length).toBe(247);
    const line = src.split('\n').find((l) => l.startsWith('  useAppEffects('));
    expect(line).toBeDefined();
    expect(line).toContain('EXTERNAL_KEY');
    expect(line).toContain('startNew');
  });

  it('6: WHEN the App was unmounted and then `emitNewRequest()` runs THEN `runEditor` was called `0` times', async () => {
    const runEditor = vi.fn().mockResolvedValue(CONTENT);
    const { unmount } = render(
      <App store={store} width={80} height={24} runEditor={runEditor} />
    );
    await delay(50);

    unmount();
    await delay(50);

    emitNewRequest();
    await delay(100);

    // the request stays pending (drained by the next test's beforeEach)
    expect(runEditor).toHaveBeenCalledTimes(0);
    expect(store.getState().data.notes.size).toBe(3);
  });
});
