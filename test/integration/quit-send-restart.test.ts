/**
 * #401 — after each quit of quit-send.test.ts lines 1 to 4, the restart
 * holds n1 exactly once: an acknowledged or server-applied change is not
 * sent again, and an unsent one goes out at the next start.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { saveInlineEdit } from '../../src/tui/app-actions';
import { sendBeforeQuit } from '../../src/core/quit-send';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
const MK = 'line1\nline2\nMK';

type Built = ReturnType<typeof buildStore>;
type Case = 'line1' | 'line2' | 'line3' | 'line4';

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];

afterEach(() => {
  for (const b of open.splice(0)) end(b);
  for (const s of servers.splice(0)) stopServer(s);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function waitFor(cond: () => boolean, timeoutMs: number, label: () => string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out (${timeoutMs} ms): ${label()}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function stopServer(server: FakeSimperiumServer): void {
  server.stop();
  for (const socket of server.openSockets) socket.destroy();
}

function end(b: Built): void {
  b.stopSaving();
  (b.store.client as { end?: () => void } | undefined)?.end?.();
  b.store.stopSync?.();
}

function openStore(dir: string, url: string): Built {
  const built = buildStore({ dataDir: dir, appId: APP_ID, server: url }, { email: EMAIL, token: TOKEN }, () => {});
  open.push(built);
  return built;
}

const status = (b: Built) => b.store.getState().simperium.connectionStatus;
const pending = (b: Built) => pendingCount(b.store.getState().simperium);
const local = (b: Built) => b.store.getState().data.notes.get('n1' as never)?.content;
const noteCount = (b: Built) => b.store.getState().data.notes.size;
const remote = (s: FakeSimperiumServer) => String(s.getObject(APP_ID, 'note', 'n1')?.data.content ?? '');
const applied = (b: Built) => (b.store as unknown as Record<symbol, unknown>)[Symbol.for('snote.noteCatchUpApplied')] === true;
const frameNamingN1 = (s: FakeSimperiumServer, from: number) =>
  s.received.slice(from).some((m) => m.startsWith('0:c:') && m.includes('"n1"'));

function names(dir: string, file: string): boolean {
  try {
    return readFileSync(join(dir, file), 'utf8').includes('"n1"');
  } catch {
    return false;
  }
}

function filters(server: FakeSimperiumServer): { holdReplies: { on: boolean }; ignoreChanges: { on: boolean } } {
  const priv = server as unknown as Record<string, (...args: unknown[]) => void>;
  const realSend = priv.send.bind(server);
  const realHandleChange = priv.handleChange.bind(server);
  const holdReplies = { on: false };
  const ignoreChanges = { on: false };
  priv.send = (ws: unknown, message: string) => {
    if (holdReplies.on && /^\d+:c:\[/.test(message)) return;
    realSend(ws, message);
  };
  priv.handleChange = (...args: unknown[]) => {
    if (ignoreChanges.on) return;
    realHandleChange(...args);
  };
  return { holdReplies, ignoreChanges };
}

function storeMK(b: Built): void {
  const note = b.store.getState().data.notes.get('n1' as never)!;
  saveInlineEdit({ store: b.store, selectedEntry: { id: 'n1' as never, note }, base: note.content, local: MK });
}

/** One case: the stop of its line, stopSaving, the replies released, the restart. */
async function runCase(which: Case): Promise<string> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [
    { id: 'n1', data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] }, version: 1 },
  ]);
  const f = filters(server);
  const dir = mkdtempSync(join(tmpdir(), `snote-401-${which}-`));
  dirs.push(dir);
  const a = openStore(dir, server.url);
  await waitFor(() => local(a) === BASE && pending(a) === 0 && status(a) === 'green' && applied(a), 8000, () => `${which}: n1 synced`);

  let result: number;
  if (which === 'line1') {
    storeMK(a);
    await new Promise((r) => setTimeout(r, 60)); // line 1's 60 ms
    result = await sendBeforeQuit(a.store, 2900);
  } else if (which === 'line2') {
    stopServer(server);
    await waitFor(() => status(a) !== 'green', 3000, () => 'line2: not connected');
    storeMK(a);
    result = await sendBeforeQuit(a.store, 2000);
  } else if (which === 'line3') {
    f.holdReplies.on = true;
    storeMK(a);
    result = await sendBeforeQuit(a.store);
  } else {
    f.ignoreChanges.on = true;
    storeMK(a);
    const run = sendBeforeQuit(a.store, 3000);
    await new Promise((r) => setTimeout(r, 200)); // line 4's 200 ms
    stopServer(server);
    result = await run;
  }
  end(a);
  open.splice(open.indexOf(a), 1);
  // the withheld replies are released, and a stopped server runs again
  f.holdReplies.on = false;
  f.ignoreChanges.on = false;
  if (which === 'line2' || which === 'line4') await server.start();

  const from = server.received.length;
  const b = openStore(dir, server.url);
  const once = which === 'line1' || which === 'line3';
  const holds = () =>
    remote(server) === MK && local(b) === MK && pending(b) === 0 && noteCount(b) === 1 && applied(b) &&
    !names(dir, 'unsynced.json') && (!once || !frameNamingN1(server, from));
  await waitFor(holds, 8000, () =>
    `${which}: server ${JSON.stringify(remote(server))}, store ${JSON.stringify(local(b))}, pending ${pending(b)}, notes ${noteCount(b)}, frame after restart ${frameNamingN1(server, from)}`
  );
  // A round trip after it holds: once the note channel's `cv:` request is in,
  // any re-send queued before it is in too.
  const barrier = server.received.length;
  b.store.forceSync?.();
  await waitFor(() => server.received.slice(barrier).some((m) => m.startsWith('0:cv:')) && holds(), 3000, () => `${which}: cv round trip`);
  return `${which}:${result}:${remote(server)}:${local(b)}:${pending(b)}:${noteCount(b)}:${once ? frameNamingN1(server, from) : 'n/a'}`;
}

describe('#401 a quit that left a change unsent or unacknowledged restarts once', () => {
  it('6: WHEN the stops of lines 1, 2, 3 and 4 are each followed by stopSaving, the server\'s withheld replies are released, and snote restarts on the same data dir through the real buildStore THEN for each, within 8 s the server\'s and the store\'s n1 are exactly `line1\\nline2\\nMK`, pendingCount is `0`, the store holds `1` note, and for line 1\'s and line 3\'s cases no `0:c:` frame naming n1 is received after the restart', { timeout: 30000 }, async () => {
    const results = await Promise.all((['line1', 'line2', 'line3', 'line4'] as Case[]).map(runCase));
    expect(results).toEqual([
      `line1:0:${MK}:${MK}:0:1:false`,
      `line2:1:${MK}:${MK}:0:1:n/a`,
      `line3:1:${MK}:${MK}:0:1:false`,
      `line4:1:${MK}:${MK}:0:1:n/a`,
    ]);
  });
});
