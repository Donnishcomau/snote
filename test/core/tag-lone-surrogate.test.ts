/**
 * #360 ( residual): a lone surrogate half in a tag name never throws in
 * the vendored tag hash, so tag actions, note imports and the start-up
 * re-send of offline edits complete. One it() per acceptance line.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from 'redux';

import { makeStore } from '../../src/core/store';
import { requeueUnsynced } from '../../src/core/requeue';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { currentProblem } from '../../src/core/problem-signal';
import { InMemoryGhost } from '../../vendor/simplenote/state/simperium/functions/in-memory-ghost.js';
import { tagHashOf } from '../../vendor/simplenote/utils/tag-hash';
import { FakeSimperiumServer } from '../fake-simperium/server';
import { makeNote } from '../tui/fixtures';

import type { EntityId, Note } from '@vendor/types';
import type { State } from '../../src/core/store';
import type * as A from '@vendor/state/action-types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const th = (s: string) => tagHashOf(s as never) as string;
const LONE_LOW = 'd\uDE00';
const LONE_HIGH = 'c\uD800';

const seedNote = (store: ReturnType<typeof makeStore>, id: string, tags: string[] = []) =>
  store.dispatch({
    type: 'IMPORT_NOTE_WITH_ID',
    noteId: eid(id),
    note: makeNote(id, `note ${id}`, { modificationDate: 1000 }),
  } as A.ActionType) && void tags;

describe('tag hash of a lone surrogate half', () => {
  it('1: WHEN tagHashOf gets `d\\uDE00`, `c\\uD800` and `A\\uD800b` THEN nothing throws and the hashes are `d%EF%BF%BD`, `c%EF%BF%BD` and `a%EF%BF%BDb`, and `😀`, `Work`, `é` and `a-b` give the same hashes as the base (`%F0%9F%98%80`, `work`, `%C3%A9`, `a%2Db`)', () => {
    expect(th('d\uDE00')).toBe('d%EF%BF%BD');
    expect(th('c\uD800')).toBe('c%EF%BF%BD');
    expect(th('A\uD800b')).toBe('a%EF%BF%BDb');
    expect(th('😀')).toBe('%F0%9F%98%80');
    expect(th('Work')).toBe('work');
    expect(th('é')).toBe('%C3%A9');
    expect(th('a-b')).toBe('a%2Db');
  });

  it('2: WHEN a note exists and ADD_NOTE_TAG is dispatched with tagName `d\\uDE00` THEN nothing throws, the note\'s tags hold `d\\uDE00` as typed, and state.data.tags holds exactly one entry with the key `d%EF%BF%BD`', () => {
    const store = makeStore({ stubClient: {} });
    seedNote(store, 'n1');
    expect(() =>
      store.dispatch({ type: 'ADD_NOTE_TAG', noteId: eid('n1'), tagName: LONE_LOW } as unknown as A.ActionType)
    ).not.toThrow();
    const s = store.getState();
    expect(s.data.notes.get(eid('n1'))?.tags).toEqual([LONE_LOW]);
    expect([...s.data.tags.keys()]).toEqual(['d%EF%BF%BD']);
  });

  it('3: WHEN EDIT_NOTE changes the tags of a note to [`c\\uD800`] and IMPORT_NOTE_WITH_ID imports a note whose tags are [`c\\uD800`] THEN neither throws and state.data.tags holds the key `c%EF%BF%BD` for each', () => {
    const edited = makeStore({ stubClient: {} });
    seedNote(edited, 'n1');
    expect(() =>
      edited.dispatch({
        type: 'EDIT_NOTE',
        noteId: eid('n1'),
        changes: { tags: [LONE_HIGH] },
      } as unknown as A.ActionType)
    ).not.toThrow();
    expect(edited.getState().data.tags.has('c%EF%BF%BD' as never)).toBe(true);

    const imported = makeStore({ stubClient: {} });
    expect(() =>
      imported.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: eid('n2'),
        note: makeNote('n2', 'imported', { tags: [LONE_HIGH], modificationDate: 1000 }),
      } as A.ActionType)
    ).not.toThrow();
    expect(imported.getState().data.tags.has('c%EF%BF%BD' as never)).toBe(true);
  });

  it('4: WHEN REMOTE_NOTE_UPDATE gives note `n1` the tags [`c\\uD800`] (as the server sent it), and an offline edit of n1 is then re-sent by requeueUnsynced (no whenCaughtUp, a ghost with no data) THEN requeueUnsynced resolves and its IMPORT_NOTE_WITH_ID is dispatched (a spy on dispatch)', async () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'REMOTE_NOTE_UPDATE',
      noteId: eid('n1'),
      note: makeNote('n1', 'offline edit', { tags: [LONE_HIGH], modificationDate: 2000 }),
    } as unknown as A.ActionType);
    const spy = vi.spyOn(store, 'dispatch');
    const ids = await requeueUnsynced(store as Store<State, A.ActionType>, new InMemoryGhost<Note>());
    expect(ids).toBeDefined();
    const imports = spy.mock.calls
      .map((c) => c[0] as { type: string; noteId: string })
      .filter((a) => a.type === 'IMPORT_NOTE_WITH_ID');
    expect(imports.map((a) => a.noteId)).toEqual(['n1']);
  });

  it('5: WHEN requeueUnsynced holds two unconfirmed notes, the FIRST (`n1`, in the order the loop visits them) with a tag `c\\uD800` and the second (`n2`) with none THEN both IMPORT_NOTE_WITH_ID actions are dispatched (a tag with a lone half no longer stops the loop before n2)', async () => {
    const store = makeStore({ stubClient: {} });
    store.dispatch({
      type: 'REMOTE_NOTE_UPDATE',
      noteId: eid('n1'),
      note: makeNote('n1', 'first', { tags: [LONE_HIGH], modificationDate: 2000 }),
    } as unknown as A.ActionType);
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: eid('n2'),
      note: makeNote('n2', 'second', { modificationDate: 2000 }),
    } as A.ActionType);
    const spy = vi.spyOn(store, 'dispatch');
    await requeueUnsynced(store as Store<State, A.ActionType>, new InMemoryGhost<Note>());
    const imports = spy.mock.calls
      .map((c) => c[0] as { type: string; noteId: string })
      .filter((a) => a.type === 'IMPORT_NOTE_WITH_ID')
      .map((a) => a.noteId);
    expect(imports).toEqual(['n1', 'n2']);
  });
});

// ---------------------------------------------------------------- test 6 rig

const APP_ID = 'test-app';
const AUTH = { email: 'store1@example.com', token: 'store1-token' };
const OFFLINE = 'ws://127.0.0.1:9';
type Built = ReturnType<typeof buildStore>;

describe('restart with a lone-half tag', () => {
  const servers: FakeSimperiumServer[] = [];
  const dirs: string[] = [];
  const open: Built[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    for (const b of open.splice(0)) {
      try {
        b.stopSaving();
        (b.store.client as unknown as { end?: () => void })?.end?.();
        b.store.stopSync?.();
      } catch {
        /* already stopped */
      }
    }
    for (const s of servers.splice(0)) s.stop();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const waitFor = async (cond: () => boolean, ms: number, label: string) => {
    const start = Date.now();
    while (!cond()) {
      if (Date.now() - start > ms) throw new Error(`timed out (${ms} ms): ${label}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  const noteData = (content: string, date: number, tags: string[]) => ({
    content,
    creationDate: 1000,
    deleted: false,
    modificationDate: date,
    systemTags: [],
    tags,
  });
  const serverContent = (s: FakeSimperiumServer, id: string) =>
    (s.getObject(APP_ID, 'note', id)?.data as { content?: string } | undefined)?.content;
  const localContent = (b: Built, id: string) =>
    (b.store.getState().data.notes.get(eid(id)) as Note | undefined)?.content;
  const open_ = (dir: string, url: string): Built => {
    const b = buildStore({ dataDir: dir, appId: APP_ID, server: url, noteEditDelayMs: 10 }, AUTH, () => {});
    open.push(b);
    return b;
  };
  const stop = async (b: Built) => {
    b.stopSaving();
    (b.store.client as unknown as { end?: () => void })?.end?.();
    b.store.stopSync?.();
    open.splice(open.indexOf(b), 1);
    await new Promise((r) => setTimeout(r, 300));
  };
  const savedHolds = (dir: string, id: string, content: string) => {
    try {
      const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as {
        data?: { notes?: { __map?: [string, { content?: string }][] } };
      };
      return s.data?.notes?.__map?.find(([k]) => k === id)?.[1]?.content === content;
    } catch {
      return false;
    }
  };

  it('6: WHEN a synced store restarts (buildStore, fake server on localhost, the restart rig test/integration/restart-battery-rig.ts) on a state.json holding two notes with unconfirmed offline edits, one of them tagged `c\\uD800` (as the server holds it), and the ghost file `ghosts-note.json` was deleted before the restart (as after a corrupt ghost: the offline copy is re-sent whole), THEN no unhandled rejection occurs, no notice starts `could not re-send offline edits`, pendingCount is `0`, and the server holds both edited texts', async () => {
    process.on('unhandledRejection', onUnhandled);
    currentProblem();
    const server = new FakeSimperiumServer();
    await server.start();
    servers.push(server);
    server.seedBucket(APP_ID, 'note', [
      { id: 'n1', data: noteData('one', 2000, [LONE_HIGH]), version: 3 },
      { id: 'n2', data: noteData('two', 2000, []), version: 1 },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'snote-tag360-'));
    dirs.push(dir);

    // session 1: synced, state.json holds both notes
    const a = open_(dir, server.url);
    await waitFor(
      () => localContent(a, 'n1') === 'one' && localContent(a, 'n2') === 'two' && pendingCount(a.store.getState().simperium) === 0 && savedHolds(dir, 'n1', 'one') && savedHolds(dir, 'n2', 'two'),
      8000,
      'both notes synced and saved'
    );
    await stop(a);

    // session 2: offline edits of both notes, saved to state.json
    const o = open_(dir, OFFLINE);
    const noteIds = ['n1', 'n2'];
    for (const id of noteIds) {
      o.store.dispatch({ type: 'EDIT_NOTE', noteId: eid(id), changes: { content: `${id} OFFLINE` } } as unknown as A.ActionType);
    }
    await waitFor(() => savedHolds(dir, 'n1', 'n1 OFFLINE') && savedHolds(dir, 'n2', 'n2 OFFLINE'), 8000, 'offline edits saved');
    await stop(o);

    // the ghost file is gone (as after a corrupt ghost): the offline copy is held for the catch-up and re-sent whole
    rmSync(join(dir, 'ghosts-note.json'), { force: true });

    // session 3: restart against the server
    const b = open_(dir, server.url);
    await waitFor(
      () =>
        serverContent(server, 'n1') === 'n1 OFFLINE' &&
        serverContent(server, 'n2') === 'n2 OFFLINE' &&
        pendingCount(b.store.getState().simperium) === 0,
      15000,
      'server holds both edits and nothing is pending'
    );
    const problem = currentProblem();
    expect(unhandled).toEqual([]);
    expect(problem === null || !problem.startsWith('could not re-send offline edits')).toBe(true);
    expect(pendingCount(b.store.getState().simperium)).toBe(0);
    expect(serverContent(server, 'n1')).toBe('n1 OFFLINE');
    expect(serverContent(server, 'n2')).toBe('n2 OFFLINE');
  }, 30000);
});

describe('tag hash identity', () => {
  it('7: WHEN tagHashOf gets the same name twice, and the names `x\\uD800` and `x�` THEN the two calls give equal hashes and the two names give equal hashes (the stated cost), and tagHashOf of `Ab` equals tagHashOf of `aB`', () => {
    expect(th('Work\uD800')).toBe(th('Work\uD800'));
    expect(th('x\uD800')).toBe(th('x�'));
    expect(th('Ab')).toBe(th('aB'));
  });
});
