/**
 * ( structure): one stdin read is seen in one place.
 *
 * Ink splits one stdin read into several input events at every escape
 * sequence, so `y` followed by an arrow in ONE read reaches a y/n confirm as
 * a lone `y`. Each `stdin.write` below is one read.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const ASK = 'log out and delete local data? y/n';

function seeded(content: string): ReturnType<typeof makeStore> {
  const store = makeStore({ stubClient: {} });
  const now = Date.now();
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: { content, systemTags: [], tags: [], deleted: false, modificationDate: now, creationDate: now },
  });
  return store;
}

async function atLogoutConfirm() {
  const store = seeded('hello world');
  const onLogout = vi.fn();
  const r = render(<App store={store} width={80} height={24} onLogout={onLogout} onQuit={vi.fn()} />);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, 'hello world');
  r.stdin.write('L');
  await waitForFrame(r.lastFrame, ASK);
  return { ...r, onLogout };
}

// #387: the discard prompt is gone; the editor stays open showing the typed `Z`
async function atEditorWithZ() {
  const store = seeded('hello world');
  const r = render(<App store={store} width={80} height={24} />);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, 'hello world');
  r.stdin.write('i');
  await waitForFrame(r.lastFrame, 'Ctrl+S save');
  r.stdin.write('Z');
  await waitForFrame(r.lastFrame, 'hello worldZ');
  return { ...r, store };
}

const settle = () => new Promise((res) => setTimeout(res, 100));

describe('read gate', () => {
  it('1: WHEN the logout confirm shows and `y\\x1b[B` arrives as one read THEN `onLogout` is called 0 times and the frame still contains `log out and delete local data? y/n`', async () => {
    const { stdin, lastFrame, onLogout } = await atLogoutConfirm();
    stdin.write('y\x1b[B');
    await settle();
    expect(onLogout).toHaveBeenCalledTimes(0);
    expect(lastFrame()).toContain(ASK);
  });

  it('2: WHEN the inline editor is open showing `hello worldZ` and `y\\x1b[B` arrives as one read THEN the editor stays open and shows `hello worldZy` (#387)', async () => {
    const { stdin, lastFrame } = await atEditorWithZ();
    stdin.write('y\x1b[B');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('hello worldZy') && f.includes('Ctrl+S save now') && !f.includes('Preview:'));
    expect(frame).toContain('hello worldZy');
    expect(frame).toContain('Ctrl+S save now');
    expect(frame).not.toContain('Preview:');
  });

  it('3: WHEN the logout confirm shows and `y` arrives alone as one read THEN `onLogout` is called 1 time', async () => {
    const { stdin, onLogout } = await atLogoutConfirm();
    stdin.write('y');
    await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('4: WHEN the inline editor is open showing `hello worldZ` and `\\x1b` arrives alone as one read THEN the frame shows `Preview:` and the note is `hello worldZ` (#387: Esc closes and keeps the text)', async () => {
    const { stdin, lastFrame, store } = await atEditorWithZ();
    stdin.write('\x1b');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Preview:') && store.getState().data.notes.get(eid('t1'))?.content === 'hello worldZ');
    expect(frame).toContain('Preview:');
    expect(store.getState().data.notes.get(eid('t1'))?.content).toBe('hello worldZ');
  });

  it('6: WHEN the inline editor is open showing `hello worldZ` and `\\x1by` arrives as one read THEN the editor stays open and shows `hello worldZy` (#387)', async () => {
    const { stdin, lastFrame } = await atEditorWithZ();
    stdin.write('\x1by');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('hello worldZy') && f.includes('Ctrl+S save now') && !f.includes('Preview:'));
    expect(frame).toContain('hello worldZy');
    expect(frame).toContain('Ctrl+S save now');
    expect(frame).not.toContain('Preview:');
  });

  it('7: WHEN the logout confirm shows and `\\x1by` arrives as one read THEN `onLogout` is called 0 times', async () => {
    const { stdin, onLogout } = await atLogoutConfirm();
    stdin.write('\x1by');
    await settle();
    expect(onLogout).toHaveBeenCalledTimes(0);
  });

  it('5: WHEN the files in `src/tui` are read THEN only `read-gate.ts` assigns `.emit =` or `.read =`', () => {
    const dir = path.join(__dirname, '../../src/tui');
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /\.(emit|read) = /.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(files).toEqual(['read-gate.ts']);
  });
});
