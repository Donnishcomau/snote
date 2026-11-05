/**
 * #402: a note deleted forever on another device while it is open in the inline editor comes back with the typed
 * text on the next store, and the notice line says so once.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeStore, waitForNotes } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const FOOTER = 'Autosaves · Esc close · Ctrl+S save now';
const NOTICE = 'This note was deleted on another device - your typed text was kept.';
const noteData = (content: string, modificationDate: number, tags: string[] = [], systemTags: string[] = []) => ({ content, creationDate: 1_000, modificationDate, deleted: false, systemTags, tags });

describe('#402 a note deleted elsewhere while open in the inline editor', () => {
  let server: FakeSimperiumServer;
  let done: (() => void)[] = [];
  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket('test-app', 'note', [
      { id: 'n1', data: noteData('Note n1', 4_000, ['work'], ['pinned', 'published', 'shared', 'markdown']), version: 1 },
      { id: 'n2', data: noteData('Note n2', 3_000), version: 1 },
    ]);
  });
  afterEach(async () => {
    for (const d of done.splice(0)) d();
    await new Promise((r) => setTimeout(r, 100));
    server.stop();
  });

  async function openN1() {
    const store = makeStore({ sync: { appId: 'test-app', token: 'test-token', username: 'test@example.com', clientOptions: { url: server.url }, noteEditDelayMs: 10 } });
    await waitForNotes(store, 2500);
    const r = render(<App store={store} width={100} height={24} />);
    done = [() => store.stopSync!(), r.unmount];
    await waitForInput(r.stdin);
    await waitForFrame(r.lastFrame, 'Note n2');
    r.stdin.write('i');
    await waitForFrame(r.lastFrame, FOOTER);
    r.stdin.write('Z');
    await waitForFrame(r.lastFrame, 'Note n1Z');
    return { ...r, store, note: (id: string) => store.getState().data.notes.get(eid(id)) };
  }

  it('1: WHEN n1 `Note n1` is open in the inline editor, `Z` is typed, another device deletes n1 forever and Ctrl+S is pressed THEN n1 is `Note n1Z` again, n2 is still `Note n2` and the frame shows `This note was deleted on another device - your typed text was kept.`, and n1 keeps its tag `work`, only its system tags `pinned` and `markdown` (not `published` or `shared`) and its creation date', async () => {
    const { stdin, lastFrame, store, note } = await openN1();
    server.serverRemove('note', 'n1');
    await waitForFrame(lastFrame, () => !store.getState().data.notes.has(eid('n1')), 3000);
    stdin.write('\x13');
    const frame = await waitForFrame(lastFrame, (f) => f.includes(NOTICE) && note('n1')?.content === 'Note n1Z' && note('n2')?.content === 'Note n2' && JSON.stringify([note('n1')?.tags, note('n1')?.systemTags, note('n1')?.creationDate]) === '[["work"],["pinned","markdown"],1000]', 3000);
    expect(frame).toContain(NOTICE);
    expect(note('n1')?.content).toBe('Note n1Z');
    expect(note('n2')?.content).toBe('Note n2');
    expect(note('n1')?.tags).toEqual(['work']);
    expect(note('n1')?.systemTags).toEqual(['pinned', 'markdown']);
    expect(note('n1')?.creationDate).toBe(1_000);
  }, 15000);

  it('2: WHEN n1 is open in the inline editor, `Z` is typed and Ctrl+S is pressed with no deletion THEN n1 is `Note n1Z` and the frame does not show the deleted-elsewhere notice', async () => {
    const { stdin, lastFrame, note } = await openN1();
    stdin.write('\x13');
    const frame = await waitForFrame(lastFrame, (f) => note('n1')?.content === 'Note n1Z' && !f.includes(FOOTER), 3000);
    expect(note('n1')?.content).toBe('Note n1Z');
    expect(frame).not.toContain('deleted on another device');
  }, 15000);
});
