/**
 * T82 Sync state: real connection status and notes waiting to be sent.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { makeStore, waitForNotes } from '../../src/core/store';
import { initialState, pendingCount } from '../../src/core/simperium-reducer';
import { FakeSimperiumServer } from '../fake-simperium/server';

import type { Store } from 'redux';
import type { State } from '../../src/core/store';
import type * as A from '@vendor/state/action-types';

type TestStore = ReturnType<typeof makeStore>;

// A "tracking store": stub client (no real sync) but tracking switched on.
function trackingStore(): TestStore {
  return makeStore({
    stubClient: {},
    preloadedState: { simperium: { ...initialState, tracking: true } } as never,
  });
}

function sim(store: TestStore) {
  return store.getState().simperium;
}

function createNote(store: TestStore, noteId: string) {
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: noteId as never,
    note: { content: 'content of ' + noteId, systemTags: [], tags: [] },
  } as A.ActionType);
}

function editNote(store: TestStore, noteId: string, content?: string) {
  store.dispatch({
    type: 'EDIT_NOTE',
    noteId: noteId as never,
    changes: content === undefined ? { content: 'new content' } : { content },
  } as A.ActionType);
}

describe('T82 sync status and pending notes', () => {
  let server: FakeSimperiumServer | undefined;

  afterEach(async () => {
    if (server) {
      const s = server;
      server = undefined;
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          s.stop();
          resolve();
        }, 100);
      });
    }
  });

  it('1: WHEN a stub store is new THEN sim.connected is false, sim.connectionStatus is red, sim.tracking is false, and after CREATE_NOTE_WITH_ID for n1 pendingCount(sim) is still 0', () => {
    const store = makeStore({ stubClient: {} });

    expect(sim(store).connected).toBe(false);
    expect(sim(store).connectionStatus).toBe('red');
    expect(sim(store).tracking).toBe(false);

    createNote(store, 'n1');

    expect(pendingCount(sim(store))).toBe(0);
  });

  it('2: WHEN CHANGE_CONNECTION_STATUS is dispatched with green, red, offline THEN sim.connected is true, false, false; WHEN green is dispatched twice in a row THEN sim is the same object after the second dispatch', () => {
    const store = makeStore({ stubClient: {} });

    store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'green' } as A.ActionType);
    expect(sim(store).connected).toBe(true);

    store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'red' } as A.ActionType);
    expect(sim(store).connected).toBe(false);

    store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'offline' } as A.ActionType);
    expect(sim(store).connected).toBe(false);

    store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'green' } as A.ActionType);
    const before = sim(store);
    store.dispatch({ type: 'CHANGE_CONNECTION_STATUS', status: 'green' } as A.ActionType);
    expect(sim(store)).toBe(before);
  });

  it('3: WHEN a tracking store gets CREATE_NOTE_WITH_ID for n1, EDIT_NOTE for n1, PIN_NOTE for n2 and REMOTE_NOTE_UPDATE for n9 THEN pendingCount(sim) is 2 and sim.pendingNotes has n1 and n2 as dirty and no n9', () => {
    const store = trackingStore();

    createNote(store, 'n1');
    editNote(store, 'n1');
    store.dispatch({ type: 'PIN_NOTE', noteId: 'n2' as never, shouldPin: true } as A.ActionType);
    store.dispatch({
      type: 'REMOTE_NOTE_UPDATE',
      noteId: 'n9' as never,
      note: {} as never,
    } as A.ActionType);

    expect(pendingCount(sim(store))).toBe(2);
    expect(sim(store).pendingNotes['n1']).toBe('dirty');
    expect(sim(store).pendingNotes['n2']).toBe('dirty');
    expect('n9' in sim(store).pendingNotes).toBe(false);
  });

  it('4: WHEN then SUBMIT_PENDING_CHANGE and ACKNOWLEDGE_PENDING_CHANGE arrive for n1, and an ACKNOWLEDGE_PENDING_CHANGE for n2 without a submit THEN pendingCount(sim) is 1 and sim.pendingNotes still has n2', () => {
    const store = trackingStore();

    createNote(store, 'n1');
    editNote(store, 'n1');
    store.dispatch({ type: 'PIN_NOTE', noteId: 'n2' as never, shouldPin: true } as A.ActionType);

    store.dispatch({ type: 'SUBMIT_PENDING_CHANGE', entityId: 'n1' as never, ccid: 'c1' } as A.ActionType);
    store.dispatch({ type: 'ACKNOWLEDGE_PENDING_CHANGE', entityId: 'n1' as never, ccid: 'c1' } as A.ActionType);
    store.dispatch({ type: 'ACKNOWLEDGE_PENDING_CHANGE', entityId: 'n2' as never, ccid: 'c2' } as A.ActionType);

    expect(pendingCount(sim(store))).toBe(1);
    expect('n2' in sim(store).pendingNotes).toBe(true);
  });

  it('5: WHEN n3 gets EDIT_NOTE, SUBMIT_PENDING_CHANGE, EDIT_NOTE, ACKNOWLEDGE_PENDING_CHANGE in that order THEN sim.pendingNotes has n3 as dirty; WHEN DELETE_NOTE_FOREVER for n3 follows THEN pendingCount(sim) is 0', () => {
    const store = trackingStore();

    editNote(store, 'n3');
    store.dispatch({ type: 'SUBMIT_PENDING_CHANGE', entityId: 'n3' as never, ccid: 'c3' } as A.ActionType);
    editNote(store, 'n3');
    store.dispatch({ type: 'ACKNOWLEDGE_PENDING_CHANGE', entityId: 'n3' as never, ccid: 'c3' } as A.ActionType);

    expect(sim(store).pendingNotes['n3']).toBe('dirty');

    store.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId: 'n3' as never } as A.ActionType);

    expect(pendingCount(sim(store))).toBe(0);
  });

  it('6: WHEN a store is built with sync against a fake server holding the one note note1 and has loaded it THEN sim.tracking is true, sim.connected is true and pendingCount(sim) is 0', async () => {
    server = new FakeSimperiumServer();
    await server.start();
    const now = Date.now();

    server.seedBucket('test-app', 'note', [
      {
        id: 'note1',
        data: {
          content: 'Content 1',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);

    const store: Store<State, A.ActionType> & { stopSync?: () => void } = makeStore({
      sync: {
        appId: 'test-app',
        token: 'test-token',
        username: 'test@example.com',
        clientOptions: { url: server.url },
        noteEditDelayMs: 10,
      },
    });

    await waitForNotes(store, 2500);

    expect(sim(store).tracking).toBe(true);
    expect(sim(store).connected).toBe(true);
    expect(pendingCount(sim(store))).toBe(0);
  });
});
