/**
 * T538R-1 (F224, F221 structure): one stdin read is seen in one place.
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

async function atDiscardPrompt() {
  const store = seeded('hello world');
  const r = render(<App store={store} width={80} height={24} />);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, 'hello world');
  r.stdin.write('i');
  await waitForFrame(r.lastFrame, 'Ctrl+S save');
  r.stdin.write('Z');
  await waitForFrame(r.lastFrame, 'hello worldZ');
  r.stdin.write('\x1b');
  await waitForFrame(r.lastFrame, 'discard changes?');
  return { ...r, store };
}

const settle = () => new Promise((res) => setTimeout(res, 100));

describe('T538R-1 read gate', () => {
  it('1: WHEN the logout confirm shows and `y\\x1b[B` arrives as one read THEN `onLogout` is called 0 times and the frame still contains `log out and delete local data? y/n`', async () => {
    const { stdin, lastFrame, onLogout } = await atLogoutConfirm();
    stdin.write('y\x1b[B');
    await settle();
    expect(onLogout).toHaveBeenCalledTimes(0);
    expect(lastFrame()).toContain(ASK);
  });

  it('2: WHEN the inline editor shows `discard changes?` and `y\\x1b[B` arrives as one read THEN the frame still contains `discard changes?` and `hello worldZ`', async () => {
    const { stdin, lastFrame } = await atDiscardPrompt();
    stdin.write('y\x1b[B');
    await settle();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('discard changes?');
    expect(frame).toContain('hello worldZ');
  });

  it('3: WHEN the logout confirm shows and `y` arrives alone as one read THEN `onLogout` is called 1 time', async () => {
    const { stdin, onLogout } = await atLogoutConfirm();
    stdin.write('y');
    await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('4: WHEN the inline editor shows `discard changes?` and `\\x1b` arrives alone as one read THEN the frame no longer contains `discard changes?` and still contains `hello worldZ`', async () => {
    const { stdin, lastFrame } = await atDiscardPrompt();
    stdin.write('\x1b');
    const frame = await waitForFrame(lastFrame, (f) => !f.includes('discard changes?') && f.includes('hello worldZ'));
    expect(frame).not.toContain('discard changes?');
    expect(frame).toContain('hello worldZ');
  });

  it('6: WHEN the inline editor shows `discard changes?` and `\\x1by` arrives as one read THEN the frame still contains `discard changes?` and `hello worldZ`', async () => {
    const { stdin, lastFrame } = await atDiscardPrompt();
    stdin.write('\x1by');
    await settle();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('discard changes?');
    expect(frame).toContain('hello worldZ');
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
