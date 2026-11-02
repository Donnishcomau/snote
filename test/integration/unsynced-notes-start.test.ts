/**
 * #336a (): buildStore wires the pending-notes file in. A saved copy
 * is laid over an older state.json copy at start-up (A2), and a state.json
 * that is present but not loadable gets a full save on the first change (A3).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { logout } from '../../src/core/token';
import { pendingCount } from '../../src/core/simperium-reducer';

const APP_ID = 'test-app';
const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Array<ReturnType<typeof buildStore>> = [];

afterEach(() => {
  for (const b of open.splice(0)) {
    b.stopSaving();
    (b.store.client as unknown as { end?: () => void })?.end?.();
    b.store.stopSync?.();
  }
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean, label: string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > 2500) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function start() {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [
    {
      id: 'n1',
      data: { content: 'base', creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] },
      version: 1,
    },
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'snote-336a-start-'));
  dirs.push(dir);
  return { server, dir };
}

const openIn = (dir: string, url: string) => {
  const built = buildStore({ dataDir: dir, appId: APP_ID, server: url }, { email: 'store1@example.com', token: 'store1-token' }, () => {});
  open.push(built);
  return built;
};

const stateJson = (dir: string) => join(dir, 'state.json');
const n1In = (b: ReturnType<typeof buildStore>) => b.store.getState().data.notes.get('n1' as never) as { content?: string } | undefined;

describe('#336a buildStore uses the pending-notes file', () => {
  it('1: WHEN unsynced-notes.json holds n1 as `edited` at 5000 and state.json holds n1 at 2000 THEN the store holds n1 as `edited` as soon as buildStore returns', async () => {
    const { server, dir } = await start();
    const a = openIn(dir, server.url);
    await waitFor(() => n1In(a)?.content === 'base' && existsSync(stateJson(dir)) && readFileSync(stateJson(dir), 'utf8').includes('base'), 'A synced and saved');
    a.stopSaving();
    (a.store.client as unknown as { end?: () => void })?.end?.();
    a.store.stopSync?.();
    open.splice(0);
    const saved = { ...(n1In(a) as object), content: 'edited', modificationDate: 5000 };
    writeFileSync(join(dir, 'unsynced-notes.json'), JSON.stringify({ n1: saved }));
    const b = openIn(dir, server.url);
    expect(n1In(b)?.content).toBe('edited');
  });

  it('2: WHEN state.json is `{not json` at start and a note is created THEN state.json is a loadable file holding it as soon as unsynced.json exists', async () => {
    const { server, dir } = await start();
    writeFileSync(stateJson(dir), '{not json');
    const a = openIn(dir, server.url);
    await waitFor(() => n1In(a)?.content === 'base', 'n1 synced');
    a.store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n9' as never, note: { content: 'fresh', systemTags: [], tags: [] } } as never);
    await waitFor(() => existsSync(join(dir, 'unsynced.json')), 'record written');
    expect(() => JSON.parse(readFileSync(stateJson(dir), 'utf8'))).not.toThrow();
    expect(readFileSync(stateJson(dir), 'utf8')).toContain('fresh');
  });

  it('3: WHEN state.json is `{not json` and unsynced-notes.json and unsynced.json hold an offline-created n9 THEN the store holds n9 as `offline note` as soon as buildStore returns, tags and preferences are defined, and the server receives n9 (#545)', async () => {
    const { server, dir } = await start();
    writeFileSync(stateJson(dir), '{not json');
    const n9 = { content: 'offline note', creationDate: 1, deleted: false, modificationDate: 5000, systemTags: [], tags: [] };
    writeFileSync(join(dir, 'unsynced-notes.json'), JSON.stringify({ n9 }));
    writeFileSync(join(dir, 'unsynced.json'), JSON.stringify({ n9: 5000 }));
    const a = openIn(dir, server.url);
    const data = a.store.getState().data as unknown as { notes: Map<string, { content?: string }>; tags: Map<string, unknown>; preferences: unknown };
    expect(data.notes.get('n9')?.content).toBe('offline note');
    expect(data.tags).toBeInstanceOf(Map);
    expect(data.preferences).toBeDefined();
    await waitFor(() => String(server.getObject(APP_ID, 'note', 'n9')?.data.content) === 'offline note', 'server has n9');
  });

  it('4: WHEN there is no state.json and no unsynced-notes.json THEN the store starts empty as before and n1 syncs in', async () => {
    const { server, dir } = await start();
    const a = openIn(dir, server.url);
    expect((a.store.getState().data as unknown as { notes: Map<string, unknown> }).notes.size).toBe(0);
    await waitFor(() => n1In(a)?.content === 'base', 'n1 synced');
  });

  async function syncedThenClosed() {
    const { server, dir } = await start();
    const a = openIn(dir, server.url);
    await waitFor(() => n1In(a)?.content === 'base' && existsSync(stateJson(dir)) && readFileSync(stateJson(dir), 'utf8').includes('base') && existsSync(join(dir, 'ghosts-note.json')), 'A synced and saved');
    a.stopSaving();
    (a.store.client as unknown as { end?: () => void })?.end?.();
    a.store.stopSync?.();
    open.splice(0);
    return { server, dir };
  }
  const n9 = { content: 'offline note', creationDate: 1, deleted: false, modificationDate: 5000, systemTags: [], tags: [] };

  it('5: WHEN a synced account restarts with state.json `{not json` and n9 pending THEN n1 is in the store as `base` as soon as buildStore returns, the server receives n9 and still holds n1 as `base`, not deleted', async () => {
    const { server, dir } = await syncedThenClosed();
    writeFileSync(stateJson(dir), '{not json');
    writeFileSync(join(dir, 'unsynced-notes.json'), JSON.stringify({ n9 }));
    writeFileSync(join(dir, 'unsynced.json'), JSON.stringify({ n9: 5000 }));
    const b = openIn(dir, server.url);
    expect(n1In(b)?.content).toBe('base');
    // n9 is on the server and acknowledged: every frame this client queued before it has been processed
    await waitFor(() => String(server.getObject(APP_ID, 'note', 'n9')?.data.content) === 'offline note' && pendingCount(b.store.getState().simperium) === 0, 'n9 on the server and acknowledged');
    expect(String(server.getObject(APP_ID, 'note', 'n1')?.data.content)).toBe('base');
    expect(Boolean(server.getObject(APP_ID, 'note', 'n1')?.data.deleted)).toBe(false);
    expect(n1In(b)?.content).toBe('base');
  });

  it('6: WHEN state.json is `{not json` at start THEN state.json.corrupt holds exactly `{not json` and logout removes it', async () => {
    const { server, dir } = await start();
    writeFileSync(stateJson(dir), '{not json');
    openIn(dir, server.url);
    expect(readFileSync(join(dir, 'state.json.corrupt'), 'utf8')).toBe('{not json');
    await logout(dir);
    expect(existsSync(join(dir, 'state.json.corrupt'))).toBe(false);
  });
});
