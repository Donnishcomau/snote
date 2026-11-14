/**
 * #30 L5d (invariant I2, Q-DATA-05): answering y to the update question loses nothing and doubles nothing. The quit is
 * wired as main() wires it after a confirmed y (src/cli/main.tsx: settleDraftWrites, sendBeforeQuit, stopSaving, then
 * handOffRequested and startHandOff with the save result), on the REAL buildStore against the fake server, with the
 * server's replies held so the edit stays sent but not acknowledged, and with an editor draft left on disk by an earlier
 * session (#65). The launcher is a spawn stand-in that records what is on disk when it starts; the restart is a second
 * buildStore on the same folder. update-handoff test 6 pins main's order; this file proves what that order keeps.
 */
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { settleDraftWrites } from '../../src/core/editor-write-watch';
import { sendBeforeQuit } from '../../src/core/quit-send';
import { pendingCount } from '../../src/core/simperium-reducer';
import { publishBanner, resetBanner } from '../../src/core/update-banner';
import { startHandOff } from '../../src/core/update-handoff';
import { allowUpdateOffer, handOffRequested, requestHandOff, resetUpdateOffer } from '../../src/core/update-offer';
import { saveInlineEdit } from '../../src/tui/app-actions';

const APP_ID = 'test-app';
const AUTH = { email: 'test@example.com', token: 'test-token' };
const BASE = 'line1\nline2';
const MK = 'line1\nline2\nMK';
const DRAFT = 'DRAFT-LEFT-BY-THE-EDITOR';
const NOT_SAVED = 'snote did not update: your notes could not be saved';

type Built = ReturnType<typeof buildStore>;
const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];

afterEach(() => {
  for (const b of open.splice(0)) { b.stopSaving(); end(b); }
  for (const s of servers.splice(0)) {
    s.stop();
    for (const socket of s.openSockets) socket.destroy();
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  resetUpdateOffer();
  resetBanner();
});

async function waitFor(cond: () => boolean, timeoutMs: number, label: () => string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out (${timeoutMs} ms): ${label()}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** A fake server holding n1; `hold` drops its change replies (`0:c:[`), so a sent edit stays unacknowledged. */
async function startServer(): Promise<{ server: FakeSimperiumServer; ctl: { hold: boolean } }> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [{ id: 'n1', data: { content: BASE, creationDate: 1000, deleted: false, modificationDate: 2000, systemTags: [], tags: [] }, version: 3 }]);
  const priv = server as unknown as Record<string, (ws: unknown, message: string) => void>;
  const realSend = priv.send.bind(server);
  const ctl = { hold: false };
  priv.send = (ws, message) => {
    if (!(ctl.hold && /^\d+:c:\[/.test(message))) realSend(ws, message);
  };
  return { server, ctl };
}

function newDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'snote-l5d-'));
  dirs.push(d);
  return d;
}

function openStore(dir: string, url: string): Built {
  const b = buildStore({ dataDir: dir, appId: APP_ID, server: url, noteEditDelayMs: 10 }, AUTH, () => {});
  open.push(b);
  return b;
}

/** What stop() of the rig does after the save: end the client and the sync. */
function end(b: Built): void {
  (b.store.client as unknown as { end?: () => void })?.end?.();
  b.store.stopSync?.();
  open.splice(open.indexOf(b), 1);
}

const notes = (b: Built) => [...b.store.getState().data.notes.values()] as Array<{ content?: string }>;
const storeCount = (b: Built, text: string): number => notes(b).filter((n) => n.content === text).length;
function serverNotes(s: FakeSimperiumServer): Array<{ content?: string }> {
  const bucket = (s as unknown as { storage: Map<string, Map<string, { entries: Map<string, { data: { content?: string } }> }>> }).storage.get(APP_ID)?.get('note');
  return [...(bucket?.entries.values() ?? [])].map((e) => e.data);
}
const serverCount = (s: FakeSimperiumServer, text: string): number => serverNotes(s).filter((n) => n.content === text).length;
const pending = (b: Built): number => pendingCount(b.store.getState().simperium);
function stateHolds(dir: string, text: string): boolean {
  try {
    return readFileSync(join(dir, 'state.json'), 'utf8').includes(JSON.stringify(text));
  } catch {
    return false;
  }
}

function edit(b: Built, content: string): void {
  const note = b.store.getState().data.notes.get('n1' as never) as { content: string };
  saveInlineEdit({ store: b.store, selectedEntry: { id: 'n1' as never, note: note as never }, base: note.content, local: content });
}

/** A plugin home with a regular bar-update, so startHandOff gets as far as the launcher. */
function pluginHome(): string {
  const home = newDir();
  const bar = join(home, '.config', 'omarchy', 'plugins', 'io.github.donnishcomau.snote-simplenote', 'packaging', 'omarchy', 'bar-update');
  mkdirSync(join(bar, '..'), { recursive: true });
  writeFileSync(bar, '#!/bin/sh\n', { mode: 0o700 });
  return home;
}

/** A spawn stand-in: records, when the launcher would start, what the data folder holds. */
function recordingSpawn(dir: string, seen: Array<{ change: boolean; draft: boolean; lockReleased: boolean }>) {
  return (() => {
    seen.push({ change: stateHolds(dir, MK), draft: stateHolds(dir, DRAFT), lockReleased: !existsSync(join(dir, 'instance.lock')) });
    const child = Object.assign(new EventEmitter(), { unref: () => {} });
    setImmediate(() => child.emit('spawn'));
    return child;
  }) as never;
}

/** The y answer, then main's quit after it (src/cli/main.tsx, from the quit send to the hand-off). */
async function answerYAndQuit(b: Built, kind: 'plugin' | 'direct', home: string, run: never): Promise<{ code: number; line: string }> {
  allowUpdateOffer(kind);
  publishBanner('0.2.11', '0.2.12');
  expect(requestHandOff()).toBe(true);
  settleDraftWrites();
  await sendBeforeQuit(b.store, 1500);
  settleDraftWrites();
  const saved = b.stopSaving();
  const handOff = handOffRequested();
  expect(handOff).toBe(kind);
  return startHandOff({ kind: handOff as typeof kind, saved, home, env: {}, run });
}

describe('#30 L5d answering y to the update question loses nothing', () => {
  it('1: WHEN one change is sent but not acknowledged, an editor draft left on disk came back as a note, and the user answers y THEN the launcher starts once, after state.json holds both and the instance lock is released, and after the restart the change is on the store and the fake server exactly once with `0` pending and the draft text is `1` note on each side', { timeout: 30000 }, async () => {
    const { server, ctl } = await startServer();
    const dir = newDir();
    mkdirSync(join(dir, 'drafts', 'snote-AAAAAA'), { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, 'drafts', 'snote-AAAAAA', 'note.md'), DRAFT, { mode: 0o600 });
    ctl.hold = true;
    const a = openStore(dir, server.url);
    await waitFor(() => storeCount(a, BASE) === 1 && storeCount(a, DRAFT) === 1 && stateHolds(dir, BASE), 8000, () => 'synced, draft back as a note');
    edit(a, MK);
    await waitFor(() => serverCount(server, MK) === 1 && pending(a) >= 1 && stateHolds(dir, MK), 8000, () => `server holds MK unacked (pending ${pending(a)})`);
    const seen: Array<{ change: boolean; draft: boolean; lockReleased: boolean }> = [];
    expect(await answerYAndQuit(a, 'plugin', pluginHome(), recordingSpawn(dir, seen))).toEqual({ code: 0, line: '' });
    expect(seen).toEqual([{ change: true, draft: true, lockReleased: true }]);
    end(a);
    ctl.hold = false;
    const b = openStore(dir, server.url);
    // bounded wait for the restart to settle; the counts are asserted below, so a loss or a doubling fails there by assertion
    await waitFor(
      () => pending(b) === 0 && storeCount(b, MK) === 1 && serverCount(server, MK) === 1 && storeCount(b, DRAFT) === 1 && serverCount(server, DRAFT) === 1,
      15000,
      () => 'restart settled'
    ).catch(() => undefined);
    expect([storeCount(b, MK), serverCount(server, MK), storeCount(b, DRAFT), serverCount(server, DRAFT), pending(b)]).toEqual([1, 1, 1, 1, 0]);
  });

  it('2: WHEN the quit save fails (`state.json.tmp` is a folder when an edit is saved) THEN for the plugin and the direct kind startHandOff returns code 1 with `snote did not update: your notes could not be saved` and nothing is started', { timeout: 30000 }, async () => {
    for (const kind of ['plugin', 'direct'] as const) {
      const { server } = await startServer();
      const dir = newDir();
      const a = openStore(dir, server.url);
      await waitFor(() => storeCount(a, BASE) === 1 && stateHolds(dir, BASE), 8000, () => `synced and saved (notes ${JSON.stringify(notes(a).map((n) => n.content))}, state ${existsSync(join(dir, 'state.json'))}, status ${a.store.getState().simperium.connectionStatus})`);
      mkdirSync(join(dir, 'state.json.tmp')); // the next save fails with EISDIR (test/core/persist-write-failure.test.ts 1)
      edit(a, MK);
      const seen: Array<{ change: boolean; draft: boolean; lockReleased: boolean }> = [];
      expect([kind, await answerYAndQuit(a, kind, pluginHome(), recordingSpawn(dir, seen))]).toEqual([kind, { code: 1, line: NOT_SAVED }]);
      expect(seen).toEqual([]);
      end(a);
      resetUpdateOffer();
    }
  });
});
