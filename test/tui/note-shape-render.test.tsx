/**
 * #558: a note from another Simplenote client may lack tags or systemTags, or hold
 * null for either. The store holds [] for those, so the screens list the note, whether it
 * came in the saved state (preloaded) or as a remote update, and a pin, a tag filter and
 * a search work on it. A start with such a note sends nothing to the server.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { createElement } from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type Raw = Record<string, unknown>;
const good: Raw = { content: 'good note', creationDate: 1, modificationDate: 5000, deleted: false, systemTags: [], tags: [] };
const shapes: Array<[string, Raw]> = [
  ['bare (no tags, no systemTags)', { content: 'odd note', modificationDate: 4000, deleted: false }],
  ['content only', { content: 'odd note' }],
  ['tags but no systemTags', { content: 'odd note', modificationDate: 4000, tags: [] }],
  ['systemTags but no tags', { content: 'odd note', modificationDate: 4000, systemTags: [] }],
  ['tags null', { content: 'odd note', modificationDate: 4000, tags: null, systemTags: [] }],
  ['systemTags null', { content: 'odd note', modificationDate: 4000, tags: [], systemTags: null }],
];

const cleanups: Array<() => void> = [];
afterEach(() => {
  // last registered first: the screen, then the clients, then the server and the folder
  for (const c of cleanups.splice(0).reverse()) c();
});

// one time budget per test (AGENTS.md: 3 s per test): every wait gets what is left of it, so a slow wait on a busy
// runner may use most of it and a failing test still ends inside the limit; every asserted value sits inside a wait
const budget = (ms = 2500) => {
  const end = Date.now() + ms;
  return () => Math.max(100, end - Date.now());
};

const screen = (store: ReturnType<typeof makeStore>) => {
  const r = render(createElement(App, { store, width: 80, height: 24 }));
  cleanups.push(() => r.unmount());
  return r;
};
const asPreloaded = (notes: Array<[string, Raw]>) =>
  makeStore({ stubClient: {}, preloadedState: { data: { notes: new Map(notes) } } as never });
const asRemote = (notes: Array<[string, Raw]>) => {
  const store = makeStore({ stubClient: {} });
  for (const [noteId, note] of notes) store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId, note } as never);
  return store;
};
const noteOf = (store: ReturnType<typeof makeStore>, id: string) => store.getState().data.notes.get(id as never) as unknown as Raw;

describe('#558 notes without tags or systemTags', () => {
  it('1: WHEN every note is complete THEN the screen lists both notes (control)', async () => {
    const left = budget();
    const r = screen(asPreloaded([['n2', good], ['n3', { ...good, content: 'second note', modificationDate: 4000 }]]));
    const frame = await waitForFrame(r.lastFrame, 'second note', left());
    expect(frame).toContain('good note');
  });

  for (const [i, [label, shape]] of shapes.entries()) {
    it(`${2 + i}: WHEN the saved state holds a note with ${label} next to a good note THEN the screen lists both`, async () => {
      const left = budget();
      const store = asPreloaded([['n2', good], ['n1', shape]]);
      expect(noteOf(store, 'n1').tags).toEqual([]);
      expect(noteOf(store, 'n1').systemTags).toEqual([]);
      const r = screen(store);
      const frame = await waitForFrame(r.lastFrame, 'odd note', left());
      expect(frame).toContain('good note');
    });

    it(`${8 + i}: WHEN a remote update brings a note with ${label} next to a good note THEN the screen lists both`, async () => {
      const left = budget();
      const store = asRemote([['n2', good], ['n1', shape]]);
      expect(noteOf(store, 'n1').tags).toEqual([]);
      expect(noteOf(store, 'n1').systemTags).toEqual([]);
      const r = screen(store);
      const frame = await waitForFrame(r.lastFrame, 'odd note', left());
      expect(frame).toContain('good note');
    });
  }

  it('14: WHEN a note has no tags or systemTags and p is pressed on it THEN it is pinned and the screen still lists it', async () => {
    const left = budget();
    const store = asRemote([['n1', { content: 'odd note', modificationDate: 4000 }]]);
    const r = screen(store);
    await waitForInput(r.stdin, left());
    await waitForFrame(r.lastFrame, 'odd note', left());
    r.stdin.write('p');
    const frame = await waitForFrame(r.lastFrame, (f) => f.includes('Pinned') && f.includes('odd note'), left());
    expect(frame).toContain('odd note');
    await vi.waitFor(() => expect(noteOf(store, 'n1').systemTags).toEqual(['pinned']), { timeout: left(), interval: 10 });
  });

  it('15: WHEN the server holds a note without tags or systemTags and the client restarts THEN it is listed and a later pin of another note reaches the server with no change sent for it', async () => {
    const left = budget();
    const server = new FakeSimperiumServer();
    await server.start();
    server.seedBucket('test-app', 'note', [
      { id: 'n1', data: { content: 'odd note', creationDate: 1, modificationDate: 2000, deleted: false }, version: 1 },
      { id: 'n2', data: good, version: 1 },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'snote-558-'));
    const open = () => buildStore({ dataDir: dir, appId: 'test-app', server: server.url }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
    const close = (b: ReturnType<typeof buildStore>) => {
      b.stopSaving();
      (b.store.client as unknown as { end?: () => void })?.end?.();
      b.store.stopSync?.();
    };
    const closed = new Set<ReturnType<typeof buildStore>>();
    const closeOnce = (b: ReturnType<typeof buildStore>) => {
      if (!closed.has(b)) {
        closed.add(b);
        close(b);
      }
    };
    cleanups.push(() => {
      server.stop();
      rmSync(dir, { recursive: true, force: true });
    });
    const a = open();
    cleanups.push(() => closeOnce(a)); // registered at once: an early failing wait still closes the socket and the save timer
    // wait on the store and on the ghost file (a put writes it at once, a later one within 100 ms), never on the debounced state.json
    await vi.waitFor(() => {
      expect(a.store.getState().data.notes.size).toBe(2);
      expect(pendingCount(a.store.getState().simperium)).toBe(0);
      const ghosts = readFileSync(join(dir, 'ghosts-note.json'), 'utf8');
      expect(ghosts).toContain('"n1"');
      expect(ghosts).toContain('"n2"');
    }, { timeout: left(), interval: 10 });
    closeOnce(a); // stopSaving flushes state.json now; what is on disk after it is not a timing question
    expect(readFileSync(join(dir, 'state.json'), 'utf8')).toContain('odd note');
    const b = open();
    cleanups.push(() => closeOnce(b));
    const r = screen(b.store);
    const frame = await waitForFrame(r.lastFrame, (f) => f.includes('odd note') && f.includes('good note'), left());
    expect(frame).toContain('good note');
    b.store.dispatch({ type: 'PIN_NOTE', noteId: 'n2', shouldPin: true } as never);
    await vi.waitFor(() => {
      expect(server.getObject('test-app', 'note', 'n2')?.data.systemTags).toContain('pinned');
      expect(pendingCount(b.store.getState().simperium)).toBe(0);
      expect(server.getObject('test-app', 'note', 'n1')?.version).toBe(1);
      expect(server.getObject('test-app', 'note', 'n1')?.data.tags).toBeUndefined();
    }, { timeout: left(), interval: 10 });
  });

  it('16: WHEN the server holds a note with systemTags null and another client edits it THEN both notes list, the store holds arrays and the client sends nothing', async () => {
    const left = budget();
    const server = new FakeSimperiumServer();
    await server.start();
    const data = { content: 'odd note', creationDate: 1, modificationDate: 2000, deleted: false, tags: [], systemTags: null };
    server.seedBucket('test-app', 'note', [
      { id: 'n1', data, version: 1 },
      { id: 'n2', data: good, version: 1 },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'snote-558-'));
    const b = buildStore({ dataDir: dir, appId: 'test-app', server: server.url }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
    cleanups.push(() => {
      b.stopSaving();
      (b.store.client as unknown as { end?: () => void })?.end?.();
      b.store.stopSync?.();
      server.stop();
      rmSync(dir, { recursive: true, force: true });
    });
    const r = screen(b.store);
    await waitForFrame(r.lastFrame, (f) => f.includes('odd note') && f.includes('good note'), left());
    server.serverChange('note', 'n1', { ...data, content: 'edited elsewhere', modificationDate: 3000 });
    await waitForFrame(r.lastFrame, (f) => f.includes('edited elsewhere') && f.includes('good note'), left());
    // a pin of another note is the settle marker: once it is on the server, anything the client queued before it has been processed
    b.store.dispatch({ type: 'PIN_NOTE', noteId: 'n2', shouldPin: true } as never);
    await vi.waitFor(() => {
      expect(server.getObject('test-app', 'note', 'n2')?.data.systemTags).toContain('pinned');
      expect(Array.isArray(noteOf(b.store, 'n1').systemTags)).toBe(true);
      expect(Array.isArray(noteOf(b.store, 'n1').tags)).toBe(true);
      expect(pendingCount(b.store.getState().simperium)).toBe(0);
      expect(server.getObject('test-app', 'note', 'n1')?.version).toBe(2);
    }, { timeout: left(), interval: 10 });
  });
});
