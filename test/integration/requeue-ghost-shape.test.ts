/**
 * #562: the start-up re-send compares each saved note with the server's copy (the ghost). A ghost whose tags or
 * systemTags is not a list ({} the shape a remote edit of a null field leaves, a number, a string, null, absent)
 * is read as the empty list, as the store reads it, so one such note neither abandons the re-send of the
 * notes after it nor is sent again for nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { FileGhostStore } from '../../src/core/ghost-store';
import { saveState } from '../../src/core/persistence';
import { onProblem } from '../../src/core/problem-signal';
import { makeStore } from '../../src/core/store';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

type Raw = Record<string, unknown>;
const mk = (content: string, modificationDate: number, extra: Raw = {}): Raw => ({
  content,
  creationDate: 1000,
  modificationDate,
  deleted: 0,
  systemTags: [],
  tags: [],
  ...extra,
});
// a ghost field that is not a list; undefined removes the field
const shapes: Array<[string, unknown]> = [['{}', {}], ['a number', 5], ['a string', 'pinned'], ['null', null], ['absent', undefined]];

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) c();
});

// Seeds the server and the ghosts with `serverNotes`, saves `localNotes` as the saved state, records `unsynced`
// as unconfirmed, starts snote; returns the server and the problems published during the start.
async function start(serverNotes: Record<string, Raw>, localNotes: Record<string, Raw>, unsynced: Record<string, number>) {
  const server = new FakeSimperiumServer();
  await server.start();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-562-'));
  const problems: string[] = [];
  const off = onProblem((m) => problems.push(m));
  cleanups.push(() => {
    off();
    server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  server.seedBucket('test-app', 'note', Object.entries(serverNotes).map(([id, data]) => ({ id, data: data as unknown as Note, version: 1 })));
  const ghosts = new FileGhostStore(dir, 'note');
  for (const [id, data] of Object.entries(serverNotes)) await ghosts.put(id, 1, data as unknown as Note);
  await ghosts.setChangeVersion('1');
  const stub = makeStore({ stubClient: {} });
  for (const [id, note] of Object.entries(localNotes)) stub.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: id as EntityId, note } as unknown as A.ActionType);
  saveState(stub.getState(), dir);
  fs.writeFileSync(path.join(dir, 'unsynced.json'), JSON.stringify(unsynced));
  const built = buildStore({ dataDir: dir, appId: 'test-app', server: server.url, noteEditDelayMs: 10 }, { email: 'test@example.com', token: 'test-token' }, () => {});
  cleanups.push(built.stopSaving);
  return { server, problems };
}
const version = (server: FakeSimperiumServer, id: string) => server.getObject('test-app', 'note', id)?.version;
// every asserted value sits inside the wait (3 s per test: the wait ends at 2.5 s)
const until = (cond: () => boolean) => vi.waitFor(() => expect(cond()).toBe(true), { timeout: 2500, interval: 10 });

describe('#562 a server copy whose tags or systemTags is not a list', () => {
  it('1: WHEN every server copy has lists THEN the edited note b is sent (version 2) and the unchanged note a is not (control)', async () => {
    const { server, problems } = await start({ a: mk('Original', 1000), b: mk('Second', 1000) }, { a: mk('Original', 1000), b: mk('edited b', 2000) }, { a: 1000, b: 2000 });
    await until(() => version(server, 'b') === 2 && version(server, 'a') === 1);
    expect(problems).toEqual([]);
  });

  let n = 2;
  for (const field of ['tags', 'systemTags']) {
    for (const [name, value] of shapes) {
      it(`${n++}: WHEN the server copy of note a has ${field} as ${name} and the saved copy is the same note THEN the edited note b after it is sent (version 2), a is not sent again, and no re-send problem is published`, async () => {
        const server_a = mk('Original', 1000);
        if (value === undefined) delete server_a[field];
        else server_a[field] = value;
        const { server, problems } = await start({ a: server_a, b: mk('Second', 1000) }, { a: mk('Original', 1000), b: mk('edited b', 2000) }, { a: 1000, b: 2000 });
        await until(() => version(server, 'b') === 2);
        expect(version(server, 'b')).toBe(2);
        expect(version(server, 'a')).toBe(1);
        expect(problems).toEqual([]);
      });
    }
  }

  it('12: WHEN the server copy of note a has tags {} and the saved copy has the tag work (newer, unconfirmed) THEN the server gets a at version 2 with the tag work', async () => {
    const { server, problems } = await start({ a: mk('Original', 1000, { tags: {} }) }, { a: mk('Original', 2000, { tags: ['work'] }) }, { a: 2000 });
    await until(() => version(server, 'a') === 2 && JSON.stringify(server.getObject('test-app', 'note', 'a')?.data.tags) === '["work"]');
    expect(problems).toEqual([]);
  });
});
