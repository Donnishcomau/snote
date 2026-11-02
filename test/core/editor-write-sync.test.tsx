/**
 * #97 (slice 97c): a write in the open external editor is sent to the server
 * as an ordinary edit of that note, while the editor stays open; several
 * writes leave the latest text on the server and never a second note.
 * Test-only on top of 97b: the edit goes out through the existing sync path.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { editInEditor } from '../../src/core/editor';
import { setDraftsDir } from '../../src/core/editor-drafts';
import { makeStore, waitForNotes } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import { stepEditor, type StepEditor } from '../helpers/step-editor';
import type { EntityId } from '@vendor/types';

const appId = 'test-app';
const eid = (id: string): EntityId => id as unknown as EntityId;
const quiet = { pause: () => undefined, resume: () => undefined };
const now = Math.floor(Date.now() / 1000);
type SyncStore = ReturnType<typeof makeStore> & { stopSync?: () => void };

let server: FakeSimperiumServer | undefined;
let store: SyncStore | undefined;
let ed: StepEditor | undefined;
let handedBack: () => boolean = () => true;
const cleanup: string[] = [];
beforeEach(() => {
  const account = mkdtempSync(join(tmpdir(), 'editor-write-sync-'));
  cleanup.push(account);
  setDraftsDir(join(account, 'drafts'));
});
afterEach(async () => {
  if (ed && !ed.exited()) ed.quit(0);
  await expect.poll(handedBack, { timeout: 2000 }).toBe(true);
  ed?.remove();
  ed = undefined;
  store?.stopSync?.();
  store = undefined;
  server?.stop();
  server = undefined;
  for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
  setDraftsDir(null);
});

/** A synced store holding note `alpha`, opened in the step editor. */
async function openSynced(): Promise<void> {
  server = new FakeSimperiumServer();
  await server.start();
  server.seedBucket(appId, 'note', [
    { id: 'alpha', data: { content: 'Alpha note', creationDate: now, deleted: 0, modificationDate: now, systemTags: [], tags: [] }, version: 1 },
  ]);
  store = makeStore({
    sync: { appId, token: 'test-token', username: 'test@example.com', clientOptions: { url: server.url } as { url: string }, noteEditDelayMs: 10 },
  }) as SyncStore;
  await waitForNotes(store, 2500);
  ed = stepEditor('vi');
  const bin = ed.bin;
  let raw = true;
  handedBack = () => raw;
  editSelectedNote({
    store,
    selectedEntry: { id: eid('alpha'), note: store.getState().data.notes.get(eid('alpha'))! },
    setRawMode: (m) => (raw = m),
    runEditor: (initial, o) => editInEditor(initial, { editor: bin, stdin: quiet, ...o }),
  });
}
const onServer = (): unknown => server!.getObject(appId, 'note', 'alpha')?.data.content;
/** The note ids named by every change frame the server received. */
const changedIds = (): string[] => server!.received.filter((m) => /^\d+:c:/.test(m)).flatMap((m) => [...m.matchAll(/"id":"([^"]+)"/g)].map((x) => x[1]));

describe('#97 97c a write in the open editor is synced', () => {
  it('1: (pass-on-old) WHEN the editor writes `alpha first write` and stays open THEN within 2 s the server holds `alpha first write` for note `alpha` and the editor has not exited', async () => {
    await openSynced();
    ed!.write('alpha first write');
    await expect.poll(() => ({ server: onServer(), exited: ed!.exited() }), { timeout: 2000 }).toEqual({ server: 'alpha first write', exited: false });
  });

  it('2: (pass-on-old) WHEN the editor writes `w1`, then `w2`, then `w3` while open THEN the server holds `w3`, every change frame names only `alpha`, and the store holds `1` note', async () => {
    await openSynced();
    ed!.write('w1');
    await expect.poll(onServer, { timeout: 2000 }).toBe('w1');
    ed!.write('w2');
    ed!.write('w3');
    await expect.poll(() => ({ server: onServer(), ids: [...new Set(changedIds())], notes: store!.getState().data.notes.size }), { timeout: 2000 })
      .toEqual({ server: 'w3', ids: ['alpha'], notes: 1 });
  });

  it('3: (pass-on-old) WHEN another client adds `REMOTE LINE` to `alpha` on the server while the editor is open and the editor then writes `LOCAL LINE` above `Alpha note` THEN the server holds both `LOCAL LINE` and `REMOTE LINE`', async () => {
    await openSynced();
    const data = server!.getObject(appId, 'note', 'alpha')!.data;
    server!.serverChange('note', 'alpha', { ...data, content: 'Alpha note\nREMOTE LINE' });
    await expect.poll(() => store!.getState().data.notes.get(eid('alpha'))?.content, { timeout: 2000 }).toBe('Alpha note\nREMOTE LINE');
    ed!.write('LOCAL LINE\nAlpha note');
    await expect.poll(() => {
      const text = String(onServer() ?? '');
      return { local: text.includes('LOCAL LINE'), remote: text.includes('REMOTE LINE'), exited: ed!.exited() };
    }, { timeout: 2000 }).toEqual({ local: true, remote: true, exited: false });
  });
});
