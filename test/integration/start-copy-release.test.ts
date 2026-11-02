/**
 * #335 (): the notes Map read from state.json at start-up is not kept for the whole session.
 * A WeakRef to it is cleared by a forced gc once the start-up catch-up has settled and the session has
 * replaced the notes; polled, no fixed sleep (the gc is exposed in-process, no vitest option needed).
 */
import { afterEach, describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { buildStore } from '../../src/cli/main';
import { FakeSimperiumServer } from '../fake-simperium/server';

const APP = 'test-app';
type Built = ReturnType<typeof buildStore>;
const open: Built[] = [];
const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const b of open.splice(0)) { b.stopSaving(); b.store.stopSync?.(); }
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms: number): Promise<boolean> {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) return false; await sleep(20); }
  return true;
}
const stateHasN1 = (d: string): boolean => { try { return readFileSync(join(d, 'state.json'), 'utf8').includes('"n1"'); } catch { return false; } };

describe('#335 the start-up notes Map is released', () => {
  it('1: WHEN a second session has started from state.json, caught up and edited a note THEN the notes Map it loaded at start-up is garbage-collected', async () => {
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    const server = new FakeSimperiumServer();
    servers.push(server);
    await server.start();
    server.seedBucket(APP, 'note', [{ id: 'n1', version: 1, data: { content: 'a', creationDate: 1, deleted: false, modificationDate: 2, systemTags: [], tags: [] } }]);
    const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'snote-335-'));
    dirs.push(dir);
    const mk = (): Built => {
      const b = buildStore({ dataDir: dir, appId: APP, server: server.url, noteEditDelayMs: 10 }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
      open.push(b);
      return b;
    };
    const a = mk();
    expect(await until(() => stateHasN1(dir), 2000)).toBe(true);
    a.stopSaving(); a.store.stopSync?.();
    open.splice(open.indexOf(a), 1);
    const b = mk();
    // the Map in the store right after start-up is the one read from state.json; hold only a WeakRef (made in a helper so no local keeps it)
    const probe = (): WeakRef<object> => new WeakRef(b.store.getState().data.notes as unknown as object);
    const ref = probe();
    expect(await until(() => (b.store as unknown as Record<symbol, boolean>)[Symbol.for('snote.noteCatchUpApplied')] === true, 2000)).toBe(true);
    for (let i = 0; i < 2; i++) b.store.dispatch({ type: 'EDIT_NOTE', noteId: 'n1', changes: { content: 'edit' + i } } as never);
    expect(await until(() => { gc(); return ref.deref() === undefined; }, 2500), 'the start-up notes Map is still referenced').toBe(true);
  }, 20000);
});
