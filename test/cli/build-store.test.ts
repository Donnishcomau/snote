/**
 * T111: buildStore — saved state in, sync on, save on change.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { loadState } from '../../src/core/persistence';

const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('T111 buildStore', () => {
  let server: FakeSimperiumServer;
  let dir: string;
  let stopSaving: (() => void) | undefined;

  const build = (
    token = 'test-token',
    onLogout = vi.fn()
  ) => {
    const result = buildStore(
      {
        dataDir: dir,
        appId: 'test-app',
        server: server.url,
        noteEditDelayMs: 10,
      },
      { email: 'test@example.com', token },
      onLogout
    );
    stopSaving = result.stopSaving;
    return result;
  };

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t111-'));
    const now = Date.now();
    server.seedBucket('test-app', 'note', [
      {
        id: 'note1',
        data: {
          content: 'First',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
      {
        id: 'note2',
        data: {
          content: 'Second',
          creationDate: now,
          deleted: 0,
          modificationDate: now,
          systemTags: [],
          tags: [],
        },
      },
    ]);
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        server.stop();
        resolve();
      }, 100);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1: WHEN build runs on an empty dir THEN right after the call data.notes.size is 0; within 2.5 s it is 2, note1 has content First, the file ghosts-note.json exists in dir, and onLogout was not called', async () => {
    const onLogout = vi.fn();
    const { store } = build('test-token', onLogout);

    // Right after the call, no notes yet.
    expect(store.getState().data.notes.size).toBe(0);

    await waitFor(
      () =>
        store.getState().data.notes.size === 2 &&
        store.getState().data.notes.get('note1' as never)?.content === 'First' &&
        fs.existsSync(path.join(dir, 'ghosts-note.json')) &&
        onLogout.mock.calls.length === 0
    );

    expect(store.getState().data.notes.size).toBe(2);
    expect(store.getState().data.notes.get('note1' as never)?.content).toBe('First');
    expect(fs.existsSync(path.join(dir, 'ghosts-note.json'))).toBe(true);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('2: WHEN the 2 notes have arrived, EDIT_NOTE with changes: { content: "edited" } is dispatched for note1 and stopSaving() is called THEN loadState(dir).data.notes has note1 with content edited and note2 with content Second', async () => {
    const { store, stopSaving: stop } = build();

    await waitFor(() => store.getState().data.notes.size === 2);

    store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'edited' },
    });
    stop();

    const saved = loadState(dir);
    expect(saved?.data.notes.get('note1' as never)?.content).toBe('edited');
    expect(saved?.data.notes.get('note2' as never)?.content).toBe('Second');
  });

  it('3: WHEN after line 2s steps build runs a second time on the same dir THEN before any await its data.notes.size is 2 and note1 has content edited', async () => {
    const first = build();

    await waitFor(() => first.store.getState().data.notes.size === 2);

    first.store.dispatch({
      type: 'EDIT_NOTE',
      noteId: 'note1' as never,
      changes: { content: 'edited' },
    });
    first.stopSaving();
    stopSaving = undefined;

    const second = build();
    stopSaving = undefined;

    expect(second.store.getState().data.notes.size).toBe(2);
    expect(second.store.getState().data.notes.get('note1' as never)?.content).toBe('edited');
  });

  it('4: WHEN build runs with the token bad-token THEN within 2.5 s onLogout was called and data.notes.size is still 0', async () => {
    const onLogout = vi.fn();
    const { store } = build('bad-token', onLogout);

    await waitFor(() => onLogout.mock.calls.length >= 1 && store.getState().data.notes.size === 0);

    expect(onLogout).toHaveBeenCalled();
    expect(store.getState().data.notes.size).toBe(0);
  });

  it('5: WHEN state.json in dir contains the text not json and build runs THEN it does not throw and within 2.5 s data.notes.size is 2', async () => {
    fs.writeFileSync(path.join(dir, 'state.json'), 'not json');

    let store;
    expect(() => {
      store = build().store;
    }).not.toThrow();

    await waitFor(() => store!.getState().data.notes.size === 2);

    expect(store!.getState().data.notes.size).toBe(2);
  });
});
