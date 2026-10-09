/**
 * T479: After a corrupt ghost file, a note whose content is unchanged is not
 * re-sent just because its date is newer (Closes: F125, corrects T444).
 *
 * Same rig as test/integration/corrupt-ghost.test.ts: `ghosts-note.json` holds
 * the text `{not json`, state.json carries the saved notes, the store opens
 * with no bucket connected so no re-index answers first, then the real store
 * runs a full re-index and `requeueUnsynced` decides from the ghost as it is
 * AFTER the catch-up. The fake server records every raw frame in `received`;
 * change frames the client sent are the `N:c:` lines.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { makeStore } from '../../src/core/store';
import { saveState } from '../../src/core/persistence';

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

// Change frames the client sent for one note (`:c:` frames carrying that
// note's id — the id sits in the frame's JSON payload), never the server's
// own replies or the frames of other notes.
const changeFramesFor = (srv: FakeSimperiumServer, id: string): string[] =>
  srv.received.filter((f) => f.includes(':c:') && f.includes(`"id":"${id}"`));

const NOW = 100000;

const serverNote = (content: string): Record<string, unknown> => ({
  content,
  creationDate: NOW,
  deleted: 0,
  modificationDate: NOW,
  systemTags: [],
  tags: [],
});

describe('T479 corrupt ghost file: same content with a newer date is not re-sent', () => {
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

  // note1 same content and same date; note2 same content but 30 s newer;
  // note3 unchanged copy.
  const prepareSameContentNewerDate = async (): Promise<void> => {
    await prepare([
      { id: 'note1', note: serverData('First') },
      {
        id: 'note2',
        note: { ...serverData('Second'), modificationDate: NOW + 30 } as unknown as Note,
      },
      { id: 'note3', note: serverData('Third') },
    ]);
  };

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
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-t479-'));
  });

  afterEach(async () => {
    stopSaving?.();
    stopSaving = undefined;
    await wait(100);
    server?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("1: WHEN the ghost file is corrupt and a held local note has the same content, tags and deleted flag as the server copy but a newer `modificationDate` THEN the fake server receives `0` change frames for that note", async () => {
    await prepareSameContentNewerDate();

    open();

    // No change frame ever arrives for note2 while the catch-up completes and
    // the versions stay put; every asserted value is inside the poll.
    let frames = 0;
    let versionsKept = false;
    await poll(() => {
      frames = changeFramesFor(server, 'note2').length;
      versionsKept = versionsUnchanged();
      return frames === 0 && versionsKept;
    });

    expect(frames).toBe(0);
    expect(versionsKept).toBe(true);

    // Nothing shows up later either.
    await wait(1500);
    expect(changeFramesFor(server, 'note2')).toHaveLength(0);
    expect(versionsUnchanged()).toBe(true);
  });

  it("2: WHEN the ghost file is corrupt and a held local note's content differs and its date is newer THEN the fake server receives exactly `1` change frame for that note", async () => {
    await prepare([
      {
        id: 'note1',
        note: {
          ...serverData('First edited offline'),
          modificationDate: NOW + 30,
        } as unknown as Note,
      },
      { id: 'note2', note: serverData('Second') },
      { id: 'note3', note: serverData('Third') },
    ]);

    open();

    // Wait until the edit landed on the server; every asserted value lives in
    // the polled condition.
    let frames1 = 0;
    let landed = false;
    await poll(() => {
      frames1 = changeFramesFor(server, 'note1').length;
      const obj1 = server.getObject('test-app', 'note', 'note1');
      landed = obj1?.data.content === 'First edited offline' && obj1?.version === 2;
      return frames1 === 1 && landed;
    });

    expect(frames1).toBe(1);
    expect(landed).toBe(true);

    // Exactly one: no second frame follows.
    await wait(1500);
    expect(changeFramesFor(server, 'note1')).toHaveLength(1);
  });
});
