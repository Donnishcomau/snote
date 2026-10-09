import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForInput, waitForFrame } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const NOTICE = 'A line is over 10,000 characters: press e to edit in your editor';
const HOSTILE = 'Title\n\n\x1b]52;c;UFdORUQ=\x07' + '漢'.repeat(10001);
const EDGE = 'Title\n\n' + '漢'.repeat(10000);
const LATER = 'Title\n\nshort\n' + 'a'.repeat(10001) + '\nend';

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

describe('inline editor line cap (T456)', () => {
  it('1: WHEN HOSTILE is selected and `i` is written THEN the frame contains `Preview:` and `A line is over 10,000 characters: press e to edit in your editor`, has no `\\x1b]52`, and the note is unchanged', async () => {
    const store = seed(HOSTILE);
    const { stdin, lastFrame } = render(<App store={store} width={100} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    const frame = await waitForFrame(lastFrame, (f) => f.includes(NOTICE) && f.includes('Preview:') && !f.includes('\x1b]52'));
    expect(frame).toContain('Preview:');
    expect(frame).toContain(NOTICE);
    expect(frame).not.toContain('\x1b]52');
    expect(content(store)).toBe(HOSTILE);
  });

  it('2: WHEN EDGE (a line of exactly 10000) is selected and `i` is written THEN within 1 s the frame contains neither `Preview:` nor `A line is over`', async () => {
    const store = seed(EDGE);
    const { stdin, lastFrame } = render(<App store={store} width={100} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    const frame = await waitForFrame(lastFrame, (f) => !f.includes('Preview:') && !f.includes('A line is over'), 1000);
    expect(frame).not.toContain('Preview:');
    expect(frame).not.toContain('A line is over');
  });

  it('3: WHEN LATER (the long line is not the first) is selected and `i` is written THEN the frame contains `A line is over 10,000 characters` and `Preview:`', async () => {
    const store = seed(LATER);
    const { stdin, lastFrame } = render(<App store={store} width={100} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('A line is over 10,000 characters') && f.includes('Preview:'));
    expect(frame).toContain('A line is over 10,000 characters');
    expect(frame).toContain('Preview:');
  });

  it('4: WHEN, after the refusal in line 3, `e` is written to an App with a `runEditor` spy THEN within 1 s the spy was called `1` time with LATER as its first argument', async () => {
    const store = seed(LATER);
    const runEditor = vi.fn().mockResolvedValue(LATER);
    const { stdin, lastFrame } = render(<App store={store} width={100} height={24} runEditor={runEditor} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>Title');
    stdin.write('i');
    await waitForFrame(lastFrame, 'A line is over 10,000 characters');
    stdin.write('e');
    await vi.waitFor(() => {
      expect(runEditor.mock.calls.length).toBe(1);
      expect(runEditor.mock.calls[0][0]).toBe(LATER);
    }, { timeout: 1000 });
    expect(runEditor).toHaveBeenCalledTimes(1);
    expect(runEditor.mock.calls[0][0]).toBe(LATER);
  });

  it('5: WHEN the note is `hello` and `i`, `X`, Ctrl+S (`\\x13`) are written THEN the note content is `helloX` and no frame contained `A line is over`', async () => {
    const store = seed('hello');
    const { stdin, lastFrame, frames } = render(<App store={store} width={100} height={24} />);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, '>hello');
    stdin.write('i');
    await waitForFrame(lastFrame, (f) => !f.includes('Preview:'));
    stdin.write('X');
    await waitForFrame(lastFrame, 'helloX');
    stdin.write('\x13');
    await vi.waitFor(() => {
      expect(content(store)).toBe('helloX');
    });
    expect(content(store)).toBe('helloX');
    expect(frames.some((f) => f.includes('A line is over'))).toBe(false);
  });

  it('6: WHEN src/tui/App.tsx is read THEN `trimEnd().split(\'\\n\').length` is `247`', () => {
    const src = readFileSync('src/tui/App.tsx', 'utf8');
    expect(src.trimEnd().split('\n').length).toBe(247);
  });
});
