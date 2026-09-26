/**
 * T293: `a` (add checklist item) opens the Prompt and inserts through
 * `insertChecklistItem` — including a bunched `soy\r` paste chunk, the
 * trash notice, and a real write landing on the fake server.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

const G = 'Groceries\n- [ ] milk\n- [x] bread';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll every 50 ms up to `timeoutMs`; every assertion lives in `cond`. */
async function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      // Always a failed expect(), even when the loop never entered `cond`'s own expects.
      await Promise.resolve(expect(cond()).toBe(true));
      throw new Error(`timed out (${timeoutMs} ms) waiting for: ${label}`);
    }
    await delay(50);
  }
}

function setup() {
  const store = makeStore({ stubClient: {} });
  const ts = 1_700_000_000;
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid('g'),
    note: makeNote('g', G, { modificationDate: ts, creationDate: ts }) as never,
  });
  return store;
}

const content = (store: ReturnType<typeof makeStore>): unknown =>
  store.getState().data.notes.get(eid('g'))?.content;

describe('checklist add item (T293)', () => {
  it('1: WHEN Tab, a, t, e, a, Enter are written on a store seeded with note g (content Groceries\\n- [ ] milk\\n- [x] bread) THEN store.getState().data.notes.get("g")?.content is Groceries\\n- [ ] milk\\n- [ ] tea\\n- [x] bread', async () => {
    const store = setup();
    const { stdin } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('\t');
    await delay(50);
    stdin.write('a');
    await delay(50);
    stdin.write('t');
    await delay(50);
    stdin.write('e');
    await delay(50);
    stdin.write('a');
    await delay(50);
    stdin.write('\r');
    await delay(50);
    expect(content(store)).toBe('Groceries\n- [ ] milk\n- [ ] tea\n- [x] bread');
  });

  it('2: WHEN Tab, a, s, o, y, Escape are written THEN store.getState().data.notes.get("g")?.content is still Groceries\\n- [ ] milk\\n- [x] bread', async () => {
    const store = setup();
    const { stdin } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('\t');
    await delay(50);
    stdin.write('a');
    await delay(50);
    stdin.write('s');
    await delay(50);
    stdin.write('o');
    await delay(50);
    stdin.write('y');
    await delay(50);
    stdin.write('\x1b');
    await delay(50);
    expect(content(store)).toBe('Groceries\n- [ ] milk\n- [x] bread');
  });

  it('3: WHEN Tab, a are written then the single bunched chunk soy\\r is written THEN store.getState().data.notes.get("g")?.content is Groceries\\n- [ ] milk\\n- [ ] soy\\n- [x] bread', async () => {
    const store = setup();
    const { stdin } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('\t');
    await delay(50);
    stdin.write('a');
    await delay(50);
    stdin.write('soy\r');
    await delay(50);
    expect(content(store)).toBe('Groceries\n- [ ] milk\n- [ ] soy\n- [x] bread');
  });

  it('4: WHEN Tab, a, Enter (no text typed) are written THEN store.getState().data.notes.get("g")?.content is still Groceries\\n- [ ] milk\\n- [x] bread', async () => {
    const store = setup();
    const { stdin } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('\t');
    await delay(50);
    stdin.write('a');
    await delay(50);
    stdin.write('\r');
    await delay(50);
    expect(content(store)).toBe('Groceries\n- [ ] milk\n- [x] bread');
  });

  it('5: WHEN a store is seeded with one trashed note note-1 (deleted: true) and T, Tab, a are written THEN the frame contains In trash: press u to restore first and store.getState().data.notes.get("note-1")?.content is unchanged', async () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('note-1'),
      note: makeNote('note-1', 'Trashed note\nDeleted content', { deleted: true }) as never,
    });
    const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
    await delay(50);
    stdin.write('T');
    await delay(50);
    stdin.write('\t');
    await delay(50);
    stdin.write('a');
    await waitFor(
      () => {
        expect(store.getState().data.notes.get(eid('note-1'))?.content).toBe(
          'Trashed note\nDeleted content'
        );
        return lastFrame()?.includes('In trash: press u to restore first') ?? false;
      },
      2000,
      'frame contains In trash: press u to restore first'
    );
  });

  it('6: WHEN a FakeSimperiumServer is seeded with note n1 (content Shopping\\n- [ ] eggs) and the app drives Tab, a, m, i, l, k, Enter THEN within 10000 ms server.getObject(appId,"note","n1")?.data.content is Shopping\\n- [ ] eggs\\n- [ ] milk and pendingCount is 0', async () => {
    vi.setConfig({ testTimeout: 20000, hookTimeout: 20000 });
    const APP_ID = 'test-app';
    const server = new FakeSimperiumServer();
    await server.start();
    const now = Date.now();
    server.seedBucket(APP_ID, 'note', [
      {
        id: 'n1',
        data: {
          content: 'Shopping\n- [ ] eggs',
          creationDate: now,
          modificationDate: now,
          deleted: 0,
          systemTags: [],
          tags: [],
        },
        version: 1,
      },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'snote-t293-'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store, stopSaving } = buildStore(
      { dataDir: dir, appId: APP_ID, server: server.url, noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      () => {}
    );
    const { stdin } = render(<App store={store} width={80} height={24} />);
    try {
      await waitFor(
        () => store.getState().data.notes.size === 1 && store.getState().data.notes.has(eid('n1')),
        2500,
        'initial index of n1'
      );
      stdin.write('\t');
      await delay(50);
      stdin.write('a');
      await delay(50);
      stdin.write('m');
      await delay(50);
      stdin.write('i');
      await delay(50);
      stdin.write('l');
      await delay(50);
      stdin.write('k');
      await delay(50);
      stdin.write('\r');
      await waitFor(
        () => {
          const ok =
            server.getObject(APP_ID, 'note', 'n1')?.data.content ===
              'Shopping\n- [ ] eggs\n- [ ] milk' &&
            pendingCount(store.getState().simperium) === 0;
          expect(store.getState().data.notes.has(eid('n1'))).toBe(true);
          return ok;
        },
        10000,
        'server stores Shopping\\n- [ ] eggs\\n- [ ] milk with pendingCount 0'
      );
    } finally {
      stopSaving();
      warn.mockRestore();
      await delay(100);
      server.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
