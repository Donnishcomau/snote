import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForInput, waitForFrame } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const NOTICE = 'The note has over 20,000 non-ASCII characters: press e to edit in your editor';

function lines(ch: string, count: number): string {
  const parts: string[] = [];
  let left = count;
  while (left > 0) {
    const n = Math.min(99, left);
    parts.push(ch.repeat(n));
    left -= n;
  }
  return parts.join('\n');
}

const OVER = 'Title\n\n' + lines('漢', 20001);
const EDGE = 'Title\n\n' + lines('漢', 20000);
const EMOJI_EDGE = 'Title\n\n' + lines('\u{1F600}', 20000);
const BIG_ASCII = 'Title\n\n' + lines('a', 1000000);

function seed(content: string): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  const now = Date.now();
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: { content, systemTags: [], tags: [], deleted: false, modificationDate: now, creationDate: now },
  });
  return store;
}
const content = (s: ReturnType<typeof makeStore>) => s.getState().data.notes.get(eid('t1'))?.content;

describe('inline editor non-ASCII total cap (T516)', () => {
  it('1: WHEN OVER (`Title` and 20001 `漢` in lines of 99) is selected at width 80 and `i` is written THEN the frame contains `Preview:` and `The note has over 20,000 non-ASCII characters: press e to edit in your editor`, and the note is unchanged', async () => {
    const store = seed(OVER);
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Preview:') && f.includes(NOTICE), 1000);
    expect(frame).toContain('Preview:');
    expect(frame).toContain(NOTICE);
    expect(content(store)).toBe(OVER);
  });

  it('2: WHEN EDGE (`Title` and exactly 20000 `漢`) is selected and `i` is written THEN within 1 s the frame contains `Ctrl+S` and contains neither `Preview:` nor `non-ASCII characters`', async () => {
    const store = seed(EDGE);
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Ctrl+S') && !f.includes('Preview:') && !f.includes('non-ASCII characters'),
      1000,
    );
    expect(frame).toContain('Ctrl+S');
    expect(frame).not.toContain('Preview:');
    expect(frame).not.toContain('non-ASCII characters');
  });

  it('3: WHEN EDGE is open in the editor and `Z` is written THEN within 1 s the frame contains `Z`, and Ctrl+S saves EDGE followed by `Z`', async () => {
    const store = seed(EDGE);
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    await waitForFrame(lastFrame, (f) => f.includes('Ctrl+S') && !f.includes('Preview:'), 1000);
    stdin.write('Z');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Z'), 1000);
    expect(frame).toContain('Z');
    stdin.write('\x13');
    await vi.waitFor(
      () => {
        expect(content(store)).toBe(EDGE + 'Z');
      },
      { timeout: 1000 },
    );
    expect(content(store)).toBe(EDGE + 'Z');
  });

  it('4: WHEN, after the refusal in line 1, `e` is written to an App with a `runEditor` spy THEN within 1 s the spy was called `1` time with OVER as its first argument', async () => {
    const store = seed(OVER);
    const runEditor = vi.fn().mockResolvedValue(OVER);
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} runEditor={runEditor} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    await waitForFrame(lastFrame, NOTICE, 1000);
    stdin.write('e');
    await vi.waitFor(
      () => {
        expect(runEditor.mock.calls.length).toBe(1);
        expect(runEditor.mock.calls[0][0]).toBe(OVER);
      },
      { timeout: 1000 },
    );
    expect(runEditor).toHaveBeenCalledTimes(1);
    expect(runEditor.mock.calls[0][0]).toBe(OVER);
  });

  it('5: WHEN EMOJI_EDGE (exactly 20000 `\\u{1F600}`, each one code point but two UTF-16 units) is selected and `i` is written THEN within 1 s the frame contains `Ctrl+S` and contains neither `Preview:` nor `non-ASCII characters`', async () => {
    const store = seed(EMOJI_EDGE);
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Ctrl+S') && !f.includes('Preview:') && !f.includes('non-ASCII characters'),
      1000,
    );
    expect(frame).toContain('Ctrl+S');
    expect(frame).not.toContain('Preview:');
    expect(frame).not.toContain('non-ASCII characters');
  });

  it('6: WHEN BIG_ASCII (`Title` and lines of 99 `a`, 1000000 characters, none non-ASCII) is selected and `i` is written THEN within 1 s the frame contains `Ctrl+S` and contains neither `Preview:` nor `non-ASCII characters`', async () => {
    const store = seed(BIG_ASCII);
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    const frame = await waitForFrame(
      lastFrame,
      (f) => f.includes('Ctrl+S') && !f.includes('Preview:') && !f.includes('non-ASCII characters'),
      1000,
    );
    expect(frame).toContain('Ctrl+S');
    expect(frame).not.toContain('Preview:');
    expect(frame).not.toContain('non-ASCII characters');
  });
});
