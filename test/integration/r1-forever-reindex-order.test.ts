/**
 * #576 ( guard). A note deleted forever while the re-index page that names
 * it is still on its way stays deleted. The order is set by the test, not by
 * load: the fake server withholds the index page until the delete forever has
 * been done, then releases it. The page carries n1 at a NEWER version than the
 * local ghost, so the library fetches it and, without the tombstone filter that
 * `installTombstoneIndexFix` puts on the note channel (src/cli/main.tsx), saves
 * it as another device's change: n1 is back in the store and its queued remove
 * is dropped. With the filter, n1 stays out until the server has its remove.
 */
import { afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { whenCatchUpApplied } from '../../src/core/simperium-reconnect-fix';

const APP_ID = 'test-app';
type Built = ReturnType<typeof buildStore>;
const note = (content: string, modificationDate: number) => ({ content, creationDate: 1000, deleted: false, modificationDate, systemTags: [], tags: [] });

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];
afterEach(() => {
  for (const b of open.splice(0)) {
    b.stopSaving();
    (b.store.client as unknown as { end?: () => void }).end?.();
    b.store.stopSync?.();
  }
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const openStore = (dir: string, url: string): Built => {
  const b = buildStore({ dataDir: dir, appId: APP_ID, server: url, noteEditDelayMs: 10 }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
  open.push(b);
  return b;
};
const hasNote = (b: Built, id: string): boolean => b.store.getState().data.notes.get(id as never) !== undefined;

/** The server withholds every index page (`<channel>:i:`) until `release()`; `held()` counts the withheld ones. */
function withholdIndex(server: FakeSimperiumServer) {
  const priv = server as unknown as { send: (ws: unknown, m: string) => void };
  const realSend = priv.send.bind(server);
  const queue: Array<() => void> = [];
  let releasing = false;
  priv.send = (ws, m) => {
    if (!releasing && /^\d+:i:/.test(m)) queue.push(() => realSend(ws, m));
    else realSend(ws, m);
  };
  return {
    held: () => queue.length,
    release: () => {
      releasing = true;
      for (const f of queue.splice(0)) f();
    },
  };
}

describe('R1 sync-6b guard (#576,): the re-index page cannot bring back a note deleted forever', () => {
  it('1: WHEN n1 is deleted forever while the re-index page naming n1 (newer than the ghost) is withheld, and the page is then released THEN n1 is not back in the store before the server has its remove, the remove is sent, and n1, n2 and n3 end as they should (no n1; n2 and n3 present)', async () => {
    const server = new FakeSimperiumServer();
    await server.start();
    servers.push(server);
    server.seedBucket(APP_ID, 'note', [
      { id: 'n1', data: note('one', 2000), version: 3 },
      { id: 'n2', data: note('two', 2000), version: 1 },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'snote-576-'));
    dirs.push(dir);

    // Session 1: sync n1 and n2, save the ghost and the state, close.
    const first = openStore(dir, server.url);
    await vi.waitFor(() => {
      const state = existsSync(join(dir, 'state.json')) ? readFileSync(join(dir, 'state.json'), 'utf8') : '';
      expect(hasNote(first, 'n1') && hasNote(first, 'n2') && state.includes('"n2"') && existsSync(join(dir, 'ghosts-note.json'))).toBe(true);
    });
    first.stopSaving();
    (first.store.client as unknown as { end?: () => void }).end?.();
    first.store.stopSync?.();
    open.splice(open.indexOf(first), 1);

    // Another device changed n1 and added n3 meanwhile; the change version is lost, so the next start re-indexes.
    server.seedBucket(APP_ID, 'note', [
      { id: 'n1', data: note('one, edited elsewhere', 3000), version: 4 },
      { id: 'n3', data: note('three', 3000), version: 1 },
    ]);
    const ghostPath = join(dir, 'ghosts-note.json');
    const ghost = JSON.parse(readFileSync(ghostPath, 'utf8')) as { cv?: unknown };
    ghost.cv = 'not-a-number';
    writeFileSync(ghostPath, JSON.stringify(ghost));

    // Session 2: the index page is on the server but withheld; delete n1 forever first.
    const gate = withholdIndex(server);
    const second = openStore(dir, server.url);
    await vi.waitFor(() => expect(gate.held()).toBeGreaterThan(0));
    second.store.dispatch({ type: 'TRASH_NOTE', noteId: 'n1' } as never);
    second.store.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId: 'n1' } as never);
    expect(hasNote(second, 'n1')).toBe(false);

    // Release the page. From now on, note every store update that shows n1 while the server has not yet been sent the remove for n1.
    const removeSent = () => server.received.some((m) => /:c:/.test(m) && /"o":"-"/.test(m) && m.includes('"n1"'));
    let backBeforeRemove = false;
    const unsubscribe = second.store.subscribe(() => {
      if (hasNote(second, 'n1') && !removeSent()) backBeforeRemove = true;
    });
    const applied = whenCatchUpApplied(second.store.client, 'note', false); // the note channel's `ready`: the page is fully applied
    gate.release();
    await applied;
    await vi.waitFor(() => expect(hasNote(second, 'n3')).toBe(true));
    unsubscribe();

    expect(backBeforeRemove).toBe(false); // the index page did not re-create n1 (and so did not drop its queued remove)
    await vi.waitFor(() => expect(removeSent()).toBe(true));
    await vi.waitFor(() => expect(hasNote(second, 'n1')).toBe(false)); // the server's newer copy of n1 may show for a moment after the remove; it is dropped
    expect(hasNote(second, 'n2')).toBe(true);
  });
});
