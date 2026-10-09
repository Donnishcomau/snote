/**
 * T444: After a corrupt ghost file, an edit made while offline still reaches
 * the server and nothing else is re-sent (Closes: F040).
 *
 * `ghosts-note.json` holds the text `{not json`, so the ghost store starts
 * empty for every note. state.json carries the saved notes. The store is
 * opened with no bucket connected (stub client), so no re-index can answer
 * first; then the real store opens, runs a full re-index, and `requeueUnsynced`
 * must decide from the ghost as it is AFTER the catch-up.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { makeStore } from '../../src/core/store';
import { saveState } from '../../src/core/persistence';
import { makeNote } from '../tui/fixtures';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

// Poll helper (same idiom as test/integration/requeue.test.ts): every value
// asserted below lives inside the polled condition; after the poll we call
// `cond()` once more so a failure reports the final observed state.
const poll = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 40 && !cond(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  cond();
};

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const CORRUPT = '{not json';

// Change frames the client sent (`N:c:`), never the server's own replies.
const changeFrames = (srv: FakeSimperiumServer): string[] =>
  srv.received.filter((f) => /^\d+:c:/.test(f));

const NOW = 100000;

const serverNote = (content: string): Record<string, unknown> => ({
  content,
  creationDate: NOW,
  deleted: 0,
  modificationDate: NOW,
  systemTags: [],
  tags: [],
});

describe('T444 corrupt ghost file: offline edit reaches the server once', () => {
  let server: FakeSimperiumServer;
  let dir: string;
  let stopSaving: (() => void) | undefined;

  const serverData = (content: string): Note =>
    ({
      content,
      creationDate: NOW,
      modificationDate: NOW,
      deleted: false,
      systemTags: [],
      tags: [],
    }) as unknown as Note;

  // Seed the server with note1..note3, then write the data dir by hand: the
  // ghost file is the text `{not json` and state.json holds the given notes
  // (saved via a stub store — no bucket ever connected, so no ghost was ever
  // written by a sync).
  const prepare = async (localNotes: Array<{ id: string; note: Note }>): Promise<void> => {
    server.seedBucket('test-app', 'note', [
      { id: 'note1', data: serverNote('First'), version: 1 },
      { id: 'note2', data: serverNote('Second'), version: 2 },
      { id: 'note3', data: serverNote('Third'), version: 3 },
    ]);
    fs.writeFileSync(path.join(dir, 'ghosts-note.json'), CORRUPT);

    const stub = makeStore({ stubClient: {} });
    for (const { id, note } of localNotes) {
      stub.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: id as EntityId,
        note,
      } as A.ActionType);
    }
    saveState(stub.getState(), dir);
  };

  const threeLocalNotesNewerBy = (offsetSec: number): Array<{ id: string; note: Note }> => [
    { id: 'note1', note: serverNote('First') },
    { id: 'note2', note: serverNote('Second') },
    { id: 'note3', note: serverNote('Third') },
  ].map(
    ({ id, note }) =>
      ({ id, note: { ...note, modificationDate: NOW + offsetSec } } as { id: string; note: Note })
  );

  const open = () => {
    const built = buildStore(
      { dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      () => {}
    );
    stopSaving = built.stopSaving;
    return built.store;
  };

  const versionsUnchanged = (): boolean =>
    server.getObject('test-app', 'note', 'note1')?.version === 1 &&
    server.getObject('test-app', 'note', 'note2')?.version === 2 &&
    server.getObject('test-app', 'note', 'note3')?.version === 3;

  beforeEach(async () => {
    server = new FakeSimperiumServer();
    await server.start();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t444-'));
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    await wait(100);
    server?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('1: WHEN the ghost file is `{not json` and state.json holds note1..note3 equal to the server THEN after 1500 ms there are `0` change frames, the 3 server versions are unchanged and `data.notes.size` is `3`', async () => {
    await prepare(threeLocalNotesNewerBy(0));

    const store = open();

    await wait(1500);

    expect(changeFrames(server)).toHaveLength(0);
    expect(versionsUnchanged()).toBe(true);
    expect(store.getState().data.notes.size).toBe(3);
  });

  it('2: WHEN the ghost file is `{not json` and local note1 is 30 s newer than the server\'s THEN within 2 s the server\'s note1 is `First edited offline` at its version plus 1, and note2 and note3 keep their versions', async () => {
    const locals = threeLocalNotesNewerBy(0);
    locals[0] = {
      id: 'note1',
      note: {
        ...serverNote('First'),
        content: 'First edited offline',
        modificationDate: NOW + 30,
      } as unknown as Note,
    };
    await prepare(locals);

    open();

    let obj1: { version: number; data: Record<string, unknown> } | undefined;
    let obj2: { version: number } | undefined;
    let obj3: { version: number } | undefined;
    await poll(() => {
      obj1 = server.getObject('test-app', 'note', 'note1');
      obj2 = server.getObject('test-app', 'note', 'note2');
      obj3 = server.getObject('test-app', 'note', 'note3');
      return (
        obj1?.data.content === 'First edited offline' &&
        obj1?.version === 2 &&
        obj2?.version === 2 &&
        obj3?.version === 3
      );
    });

    expect(obj1?.data.content).toBe('First edited offline');
    expect(obj1?.version).toBe(2);
    expect(obj2?.version).toBe(2);
    expect(obj3?.version).toBe(3);
  });

  it('3: WHEN the ghost file is `{not json` and local note1 is `stale local`, 30 s older than the server\'s `First` THEN after 1500 ms the server\'s note1 is still `First` at its version and the store\'s note1 content is `First`', async () => {
    const locals = threeLocalNotesNewerBy(0);
    locals[0] = {
      id: 'note1',
      note: {
        ...serverNote('stale local'),
        modificationDate: NOW - 30,
      } as unknown as Note,
    };
    await prepare(locals);

    const store = open();

    await wait(1500);

    const obj1 = server.getObject('test-app', 'note', 'note1');
    expect(obj1?.data.content).toBe('First');
    expect(obj1?.version).toBe(1);
    expect(store.getState().data.notes.get('note1' as EntityId)?.content).toBe('First');
  });

  it('4: WHEN the ghost file is `{not json` and state.json also holds `new9` (content `made offline`), which the server lacks THEN within 2 s the server\'s new9 content is `made offline`', async () => {
    await prepare([
      ...threeLocalNotesNewerBy(0),
      { id: 'new9', note: makeNote('new9', 'made offline') },
    ]);

    open();

    let new9: { version: number; data: Record<string, unknown> } | undefined;
    await poll(() => {
      new9 = server.getObject('test-app', 'note', 'new9');
      return new9?.data.content === 'made offline';
    });

    expect(new9?.data.content).toBe('made offline');
  });
});
