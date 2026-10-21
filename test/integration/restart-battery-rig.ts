/**
 * R1 restart battery rig (0.2.8 sync redesign). Ported from the 0.2.6 loss
 * battery (research loss-battery-0.2.6/loss-battery.test.ts) with the same
 * scenarios, fixtures and timings; no test lives here. A test file calls
 * `runScenario(id)` and asserts on the outcome:
 *   KEPT    every expected change is on both sides exactly once;
 *   DOUBLED nothing is missing, but a change landed twice (duplicate lines);
 *   LOST    an expected change (text, pin, trash, tag, or the user's undo) is
 *           missing on at least one side;
 *   STUCK   the store holds the expected state but the server does not and
 *           a change is still pending at the end of the session.
 * Every scenario drives the real `buildStore` against the fake server.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { pendingCount } from '../../src/core/simperium-reducer';
import { whenCatchUpApplied } from '../../src/core/simperium-reconnect-fix';
import { saveInlineEdit, editSelectedNote } from '../../src/tui/app-actions';

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
const MK = 'line1\nline2\nMK';
const OFF = 'line1\nline2\nOFF';

type Built = ReturnType<typeof buildStore>;
type Note =
  | {
      content?: string;
      deleted?: boolean;
      systemTags?: string[];
      tags?: string[];
      modificationDate?: number;
    }
  | undefined;

const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];

/** Stop every client and server a scenario opened and remove its folders; call from afterEach. */
export async function cleanupBattery(): Promise<void> {
  for (const b of open.splice(0)) {
    try {
      b.stopSaving();
      (b.store.client as unknown as { end?: () => void })?.end?.();
      b.store.stopSync?.();
    } catch {
      /* already stopped */
    }
  }
  for (const s of servers.splice(0)) s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`rig: timed out (${timeoutMs} ms) waiting for: ${label}`);
    await sleep(25);
  }
}

function newDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'snote-battery-'));
  dirs.push(d);
  return d;
}

function noteData(content: string, modificationDate: number): Record<string, unknown> {
  return { content, creationDate: 1000, deleted: false, modificationDate, systemTags: [], tags: [] };
}

async function startServer(n1Date = 2000): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [
    { id: 'n1', data: noteData(BASE, n1Date), version: 3 },
    { id: 'n2', data: noteData('two', 2000), version: 1 },
  ]);
  return server;
}

/** `delay` null = the real default send delay (2000 ms). */
function openA(dataDir: string, url: string, delay: number | null = 10): Built {
  const noteEditDelayMs = delay === null ? undefined : delay;
  const built = buildStore({ dataDir, appId: APP_ID, server: url, noteEditDelayMs }, { email: EMAIL, token: TOKEN }, () => {});
  open.push(built);
  return built;
}

const OFFLINE = 'ws://127.0.0.1:9';
const serverNote = (s: FakeSimperiumServer): Note => s.getObject(APP_ID, 'note', 'n1')?.data as Note;
const localNote = (b: Built): Note => b.store.getState().data.notes.get('n1' as never) as Note;
const pending = (b: Built) => pendingCount(b.store.getState().simperium);

function edit(b: Built, content: string): void {
  b.store.dispatch({ type: 'EDIT_NOTE' as never, noteId: 'n1' as never, changes: { content } as never });
}

type Act = 'pin' | 'unpin' | 'trash' | 'restore' | 'tag' | 'untag' | 'forever';
function act(b: Built, a: Act): void {
  const noteId = 'n1' as never;
  const d = (x: unknown) => b.store.dispatch(x as never);
  if (a === 'pin') d({ type: 'PIN_NOTE', noteId, shouldPin: true });
  if (a === 'unpin') d({ type: 'PIN_NOTE', noteId, shouldPin: false });
  if (a === 'trash') d({ type: 'TRASH_NOTE', noteId });
  if (a === 'restore') d({ type: 'RESTORE_NOTE', noteId });
  if (a === 'tag') d({ type: 'ADD_NOTE_TAG', noteId, tagName: 'work' });
  if (a === 'untag') d({ type: 'REMOVE_NOTE_TAG', noteId, tagName: 'work' });
  if (a === 'forever') d({ type: 'DELETE_NOTE_FOREVER', noteId });
}

async function stop(b: Built): Promise<void> {
  b.stopSaving();
  (b.store.client as unknown as { end?: () => void })?.end?.();
  b.store.stopSync?.();
  open.splice(open.indexOf(b), 1);
  await sleep(300);
}

/**
 * Server -> client `0:c:[` frames: dropped while `hold`; each sent `eachMs`
 * late while `eachMs` > 0; with `lateMs` > 0 the first one and all after it
 * wait until `lateMs` after the first was due. `ignore` drops incoming
 * change frames ("the server never got it").
 */
function control(server: FakeSimperiumServer) {
  const priv = server as unknown as Record<string, (...args: unknown[]) => void>;
  const realSend = priv.send.bind(server);
  const realHandle = priv.handleChange.bind(server);
  const ctl = { hold: false, eachMs: 0, lateMs: 0, ignore: false };
  let queue: Array<() => void> | undefined;
  let started = false;
  priv.send = (ws: unknown, message: string) => {
    if (/^\d+:c:\[/.test(message)) {
      if (ctl.hold) return;
      if (ctl.eachMs > 0) {
        setTimeout(() => realSend(ws, message), ctl.eachMs);
        return;
      }
      if (ctl.lateMs > 0 && !started) {
        started = true;
        queue = [];
        setTimeout(() => {
          for (const s of queue ?? []) s();
          queue = undefined;
        }, ctl.lateMs);
      }
      if (queue) {
        queue.push(() => realSend(ws, message));
        return;
      }
    }
    realSend(ws, message);
  };
  priv.handleChange = (...args: unknown[]) => {
    if (ctl.ignore) return;
    realHandle(...args);
  };
  return ctl;
}

function stateHolds(dir: string, content: string): boolean {
  try {
    const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as {
      data?: { notes?: { __map?: [string, { content?: string }][] } };
    };
    return s.data?.notes?.__map?.find(([id]) => id === 'n1')?.[1]?.content === content;
  } catch {
    return false;
  }
}

function stateNote(dir: string): Record<string, unknown> | undefined {
  try {
    const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as {
      data?: { notes?: { __map?: [string, Record<string, unknown>][] } };
    };
    return s.data?.notes?.__map?.find(([id]) => id === 'n1')?.[1];
  } catch {
    return undefined;
  }
}

function readJson(dir: string, file: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- outcome

interface Expect {
  content?: string; // exact text on both sides
  gone?: boolean; // deleted forever on both sides
  deleted?: boolean;
  pinned?: boolean;
  markdown?: boolean;
  tags?: string[];
}

function view(n: Note) {
  if (!n) return null;
  return {
    content: n.content,
    deleted: Boolean(n.deleted),
    systemTags: [...(n.systemTags ?? [])].sort(),
    tags: [...(n.tags ?? [])].sort(),
  };
}

function dedupeLines(s: string): string {
  const seen = new Set<string>();
  return s
    .split('\n')
    .filter((l) => (seen.has(l) ? false : (seen.add(l), true)))
    .join('\n');
}

type Verdict = 'KEPT' | 'DOUBLED' | 'LOST' | 'STUCK';

function sideVerdict(n: Note, e: Expect): Verdict {
  if (e.gone) return n && !n.deleted ? 'LOST' : n ? 'LOST' : 'KEPT';
  if (!n) return 'LOST';
  const sys = n.systemTags ?? [];
  if (e.deleted !== undefined && Boolean(n.deleted) !== e.deleted) return 'LOST';
  if (e.pinned !== undefined && sys.includes('pinned') !== e.pinned) return 'LOST';
  if (e.markdown !== undefined && sys.includes('markdown') !== e.markdown) return 'LOST';
  if (e.tags !== undefined && JSON.stringify([...(n.tags ?? [])].sort()) !== JSON.stringify([...e.tags].sort()))
    return 'LOST';
  if (e.content !== undefined && n.content !== e.content) {
    return dedupeLines(n.content ?? '') === e.content ? 'DOUBLED' : 'LOST';
  }
  return 'KEPT';
}

function classify(server: Note, local: Note, pend: number, e: Expect): Verdict {
  const s = sideVerdict(server, e);
  const l = sideVerdict(local, e);
  if (s === 'LOST' && l !== 'LOST' && pend > 0) return 'STUCK';
  if (s === 'LOST' || l === 'LOST') return 'LOST';
  if (s === 'DOUBLED' || l === 'DOUBLED') return 'DOUBLED';
  return 'KEPT';
}

/** Wait until both sides agree with nothing pending (or `maxMs`), then 1500 ms more. */
async function settle(server: FakeSimperiumServer, b: Built, maxMs = 10000): Promise<void> {
  const agree = () =>
    pending(b) === 0 && JSON.stringify(view(serverNote(server))) === JSON.stringify(view(localNote(b)));
  const start = Date.now();
  while (!agree() && Date.now() - start < maxMs) await sleep(50);
  await sleep(1500);
}

export interface Outcome {
  verdict: Verdict;
  server: ReturnType<typeof view>;
  store: ReturnType<typeof view>;
  pending: number;
}

const outcomes = new Map<string, Outcome>();

async function record(
  id: string,
  server: FakeSimperiumServer,
  b: Built,
  e: Expect,
  _extra: Record<string, unknown> = {}
): Promise<void> {
  const sv = serverNote(server);
  const lv = localNote(b);
  const pend = pending(b);
  outcomes.set(id, { verdict: classify(sv, lv, pend, e), server: view(sv), store: view(lv), pending: pend });
}

// ---------------------------------------------------------------- rigs

async function synced(server: FakeSimperiumServer, dir: string): Promise<Built> {
  const a = openA(dir, server.url);
  await waitFor(() => localNote(a)?.content === BASE && pending(a) === 0 && stateHolds(dir, BASE), 8000, 'n1 synced and saved');
  return a;
}

/** Edit n1 to MK with replies withheld; return once the server holds it unacked and state.json holds it. */
async function sendMkUnacked(server: FakeSimperiumServer, ctl: { hold: boolean }, dir: string): Promise<Built> {
  ctl.hold = true;
  const a = await synced(server, dir);
  edit(a, MK);
  await waitFor(
    () => serverNote(server)?.content === MK && pending(a) === 1 && stateHolds(dir, MK),
    8000,
    'server holds MK unacked, state.json holds MK'
  );
  return a;
}

/** quit-before-ack: MK applied by the server, reply withheld, clean stop. */
async function quitBeforeAck(server: FakeSimperiumServer, ctl: { hold: boolean }): Promise<string> {
  const dir = newDir();
  const a = await sendMkUnacked(server, ctl, dir);
  await stop(a);
  return dir;
}

/** #27 shape: MK applied by the server unacked, a second save Y queued behind it, clean stop. */
async function twoSavesBeforeAck(server: FakeSimperiumServer, ctl: { hold: boolean }): Promise<string> {
  const dir = newDir();
  const a = await sendMkUnacked(server, ctl, dir);
  edit(a, MK + '\nY');
  await waitFor(
    () => serverNote(server)?.content === MK && stateHolds(dir, MK + '\nY') && 'n1' in readJson(dir, 'unsynced.json'),
    8000,
    'second save Y saved locally, server still holds MK unacked'
  );
  await stop(a);
  return dir;
}

/** The ghost file's `cv` made unreadable, so the next start re-indexes (`cv:?`). */
function expireCv(dir: string): void {
  const p = join(dir, 'ghosts-note.json');
  const f = JSON.parse(readFileSync(p, 'utf8')) as { cv?: unknown };
  f.cv = 'not-a-number';
  writeFileSync(p, JSON.stringify(f));
}

/** Sync n1, then in a session with no server: edit to OFF and run `offline` actions. */
async function offlineSession(server: FakeSimperiumServer, acts: Act[] = []): Promise<string> {
  const dir = newDir();
  const a = await synced(server, dir);
  await stop(a);
  const o = openA(dir, OFFLINE);
  edit(o, OFF);
  for (const x of acts) act(o, x);
  await waitFor(
    () => {
      const n = stateNote(dir);
      const want = localNote(o);
      return (
        n?.content === OFF &&
        JSON.stringify(n?.systemTags ?? []) === JSON.stringify(want?.systemTags ?? []) &&
        JSON.stringify(n?.tags ?? []) === JSON.stringify(want?.tags ?? []) &&
        Boolean(n?.deleted) === Boolean(want?.deleted) &&
        'n1' in readJson(dir, 'unsynced.json')
      );
    },
    8000,
    'offline edit (and actions) saved'
  );
  await stop(o);
  return dir;
}

async function catchUp(b: Built, maxMs = 4500): Promise<void> {
  await Promise.race([whenCatchUpApplied(b.store.client, 'note'), sleep(maxMs)]);
  await sleep(500);
}

/** Phase 2: append LATER to whatever the store now holds, then settle. */
async function laterEdit(server: FakeSimperiumServer, b: Built): Promise<Note> {
  const phase1 = view(localNote(b));
  edit(b, (localNote(b)?.content ?? '') + '\nLATER');
  await settle(server, b);
  return phase1 as Note;
}

/** F198 rig: save MK, "kill" `killMs` later by copying the data dir; restart on the copy. */
async function saveThenKill(mode: 'inline' | 'external' | 'never-got-it' | 'hold', killMs: number) {
  const server = await startServer();
  const ctl = control(server);
  const dir = newDir();
  const killed = newDir();
  const fast = mode === 'never-got-it' || mode === 'hold';
  const a = openA(dir, server.url, fast ? 10 : null);
  await waitFor(() => localNote(a)?.content === BASE && pending(a) === 0 && stateHolds(dir, BASE), 8000, 'synced');
  if (mode === 'never-got-it') ctl.ignore = true;
  if (mode === 'hold') ctl.hold = true;
  const dead = new Promise<void>((resolve) => {
    const unsub = a.store.subscribe(() => {
      if (localNote(a)?.content !== MK) return;
      unsub();
      setTimeout(() => {
        ctl.ignore = true;
        cpSync(dir, killed, { recursive: true, filter: (src) => !src.endsWith('instance.lock') });
        resolve();
      }, killMs);
    });
  });
  const note = a.store.getState().data.notes.get('n1' as never)!;
  const selectedEntry = { id: 'n1' as never, note };
  if (mode === 'external') {
    editSelectedNote({ store: a.store, selectedEntry, setRawMode: () => {}, runEditor: async () => MK } as never);
  } else {
    saveInlineEdit({ store: a.store, selectedEntry, base: BASE, local: MK } as never);
  }
  await dead;
  a.stopSaving();
  (a.store.client as unknown as { end?: () => void })?.end?.();
  a.store.stopSync?.();
  open.splice(open.indexOf(a), 1);
  const serverHadIt = serverNote(server)?.content === MK;
  await sleep(300);
  ctl.ignore = false;
  ctl.hold = false;
  const b = openA(killed, server.url, 10);
  return { server, b, serverHadIt };
}

// ---------------------------------------------------------------- scenarios

type Scenario = [string, () => Promise<void>];

const scenarios: Scenario[] = [
  // S8-01 (SR8 sr8-crash-window): sent, server applied, no ack, killed before the state.json save.
  ...(['edit', 'trash'] as const).map((kind): Scenario => [
    `S8-01-${kind}`,
    async () => {
      const server = await startServer();
      const ctl = control(server);
      ctl.hold = true;
      const dir = newDir();
      const a = await synced(server, dir);
      const pre = readFileSync(join(dir, 'state.json'), 'utf8');
      if (kind === 'trash') {
        act(a, 'trash');
        await waitFor(() => serverNote(server)?.deleted === true && pending(a) === 1, 8000, 'server trashed');
      } else {
        edit(a, MK);
        await waitFor(() => serverNote(server)?.content === MK && pending(a) === 1, 8000, 'server MK');
      }
      await stop(a);
      writeFileSync(join(dir, 'state.json'), pre);
      ctl.hold = false;
      const b = openA(dir, server.url);
      await catchUp(b);
      if (kind === 'trash') {
        const phase1 = view(localNote(b));
        act(b, 'pin');
        await settle(server, b);
        await record(`S8-01-trash`, server, b, { content: BASE, deleted: true, pinned: true }, { phase1 });
      } else {
        const phase1 = await laterEdit(server, b);
        await record(`S8-01-edit`, server, b, { content: MK + '\nLATER' }, { phase1 });
      }
    },
  ]),

  // S10-01 P8: server copy dated 30 s ahead, MK unacked, pin, crash before state.json holds the pin.
  [
    'S10-01-P8',
    async () => {
      const server = await startServer(Date.now() / 1000 + 30);
      const ctl = control(server);
      const dir = newDir();
      const a = await sendMkUnacked(server, ctl, dir);
      const saved = readFileSync(join(dir, 'state.json'), 'utf8');
      const mkDate = localNote(a)?.modificationDate;
      act(a, 'pin');
      await waitFor(
        () => {
          const d = localNote(a)?.modificationDate;
          return d !== mkDate && Number(readJson(dir, 'unsynced.json').n1) === Number(d);
        },
        8000,
        'pin recorded in unsynced.json'
      );
      await stop(a);
      writeFileSync(join(dir, 'state.json'), saved);
      ctl.hold = false;
      const b = openA(dir, server.url);
      await catchUp(b);
      const phase1 = await laterEdit(server, b);
      await record('S10-01-P8', server, b, { content: MK + '\nLATER' }, { phase1, pinNote: 'pin made before the crash is not gated' });
    },
  ],
  // S10-01 P6: server copy dated 30 s ahead, MK unacked, clean stop, unsynced.json removed.
  [
    'S10-01-P6',
    async () => {
      const server = await startServer(Date.now() / 1000 + 30);
      const ctl = control(server);
      const dir = newDir();
      const a = await sendMkUnacked(server, ctl, dir);
      await stop(a);
      rmSync(join(dir, 'unsynced.json'), { force: true });
      ctl.hold = false;
      const b = openA(dir, server.url);
      await catchUp(b);
      const phase1 = await laterEdit(server, b);
      await record('S10-01-P6', server, b, { content: MK + '\nLATER' }, { phase1 });
    },
  ],

  // S11-01 Q9 / Q8 (start-up-action-kept 1-10): offline edit OFF, then a pin/trash/tag before the catch-up.
  ...(
    [
      ['Q9-pin-400', 'pin', 0, 400],
      ['Q9-pin-1500', 'pin', 0, 1500],
      ['Q9-trash-400', 'trash', 0, 400],
      ['Q9-tag-400', 'tag', 0, 400],
      ['Q8-pin-0', 'pin', 1200, 0],
      ['Q8-trash-0', 'trash', 1200, 0],
      ['Q8-tag-0', 'tag', 1200, 0],
      ['Q8-pin-400', 'pin', 1200, 400],
      ['Q8-trash-400', 'trash', 1200, 400],
      ['Q8-tag-400', 'tag', 1200, 400],
    ] as const
  ).map(([name, a, late, at]): Scenario => [
    `S11-01-${name}`,
    async () => {
      const server = await startServer();
      const dir = await offlineSession(server);
      const ctl = control(server);
      if (late === 0) server.dropEmptyCatchUpReply = true;
      ctl.eachMs = late;
      const b = openA(dir, server.url);
      if (at > 0) await sleep(at);
      act(b, a);
      await settle(server, b, 12000);
      const e: Expect = { content: OFF };
      if (a === 'pin') e.pinned = true;
      if (a === 'trash') e.deleted = true;
      if (a === 'tag') e.tags = ['work'];
      await record(`S11-01-${name}`, server, b, e);
    },
  ]),
  // S11-01 Q1 (start-up-action-kept 11): MK unacked at quit, catch-up 6 s late, pin at once.
  [
    'S11-01-Q1-pin',
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      ctl.lateMs = 6000;
      const b = openA(dir, server.url);
      act(b, 'pin');
      await sleep(6000);
      await settle(server, b, 10000);
      await record('S11-01-Q1-pin', server, b, { content: MK, pinned: true });
    },
  ],

  // S12-01 O1-O4: the user undoes an offline-session action before the catch-up.
  ...(
    [
      ['O1-unpin', 'pin', 'unpin', 1200, 0, { pinned: false }],
      ['O2-unpin', 'pin', 'unpin', 0, 400, { pinned: false }],
      ['O3-restore', 'trash', 'restore', 1200, 0, { deleted: false }],
      ['O4-untag', 'tag', 'untag', 1200, 0, { tags: [] }],
    ] as const
  ).map(([name, offAct, undo, late, at, e]): Scenario => [
    `S12-01-${name}`,
    async () => {
      const server = await startServer();
      const dir = await offlineSession(server, [offAct]);
      const ctl = control(server);
      if (late === 0) server.dropEmptyCatchUpReply = true;
      ctl.eachMs = late;
      const b = openA(dir, server.url);
      if (at > 0) await sleep(at);
      act(b, undo);
      await settle(server, b, 12000);
      await record(`S12-01-${name}`, server, b, { content: OFF, ...e } as Expect);
    },
  ]),

  // S12-02 A1, A4, O5: another device changes the same array field while snote is closed.
  ...(
    [
      ['A1-tags', [] as Act[], { tags: ['home'] }, 'tag', { tags: ['home', 'work'] }],
      ['A4-systemTags', [] as Act[], { systemTags: ['markdown'] }, 'pin', { pinned: true, markdown: true }],
      ['O5-offline-pin-tags', ['pin'] as Act[], { tags: ['home'] }, 'tag', { pinned: true, tags: ['home', 'work'] }],
    ] as const
  ).map(([name, offActs, other, a, e]): Scenario => [
    `S12-02-${name}`,
    async () => {
      const server = await startServer();
      const dir = await offlineSession(server, [...offActs]);
      const cur = server.getObject(APP_ID, 'note', 'n1')!.data as Record<string, unknown>;
      server.serverChange('note', 'n1', { ...cur, ...other });
      const ctl = control(server);
      ctl.eachMs = 1200;
      const b = openA(dir, server.url);
      act(b, a);
      await settle(server, b, 12000);
      await record(`S12-02-${name}`, server, b, { content: OFF, ...e } as Expect);
    },
  ]),

  // REVIEW-T531 sweep (prompt catch-up after quit-before-ack).
  [
    'T531-P1-revert',
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      const b = openA(dir, server.url);
      edit(b, BASE);
      await settle(server, b);
      await record('T531-P1-revert', server, b, { content: BASE });
    },
  ],
  [
    'T531-P2-delete-forever',
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      const b = openA(dir, server.url);
      act(b, 'trash');
      act(b, 'forever');
      await sleep(3000);
      await settle(server, b);
      await record('T531-P2-delete-forever', server, b, { gone: true });
    },
  ],
  // F226 (#93): T531-P2 with the catch-up 1.5 s late, so the remove goes out
  // before the echo of the pre-quit edit arrives (the order load produces).
  [
    'S226-forever-late-echo',
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      ctl.lateMs = 1500;
      const b = openA(dir, server.url);
      act(b, 'trash');
      act(b, 'forever');
      await sleep(3000);
      await settle(server, b);
      await record('S226-forever-late-echo', server, b, { gone: true });
    },
  ],
  [
    'T531-P3-other-device-pin',
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      const cur = server.getObject(APP_ID, 'note', 'n1')!.data as Record<string, unknown>;
      server.serverChange('note', 'n1', { ...cur, content: MK + '\nOTHER' });
      const b = openA(dir, server.url);
      act(b, 'pin');
      await settle(server, b);
      await record('T531-P3-other-device-pin', server, b, { content: MK + '\nOTHER', pinned: true });
    },
  ],
  [
    'T531-P4-offline-pin',
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      const o = openA(dir, OFFLINE);
      act(o, 'pin');
      await waitFor(() => JSON.stringify(stateNote(dir)?.systemTags ?? []).includes('pinned'), 8000, 'offline pin saved');
      await stop(o);
      const b = openA(dir, server.url);
      await settle(server, b);
      await record('T531-P4-offline-pin', server, b, { content: MK, pinned: true });
    },
  ],
  [
    'T531-P5-two-offline-then-pin',
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      for (let i = 0; i < 2; i++) {
        const o = openA(dir, OFFLINE);
        await sleep(300);
        await stop(o);
      }
      const b = openA(dir, server.url);
      act(b, 'pin');
      await settle(server, b);
      await record('T531-P5-two-offline-then-pin', server, b, { content: MK, pinned: true });
    },
  ],
  // Doubling probe: quit-before-ack, no action (T531 P7, quit-before-ack 1).
  [
    'DBL-quit-before-ack',
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      const b = openA(dir, server.url);
      await settle(server, b);
      await record('DBL-quit-before-ack', server, b, { content: MK });
    },
  ],
  // Doubling probe S9-01 (touch-before-echo 1-3): an action right after restart, prompt catch-up.
  ...(
    [
      ['pin', { content: MK, pinned: true }],
      ['edit', { content: MK + '\nX' }],
      ['trash', { content: MK, deleted: true }],
    ] as const
  ).map(([a, e]): Scenario => [
    `DBL-S9-01-${a}`,
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      const b = openA(dir, server.url);
      if (a === 'edit') edit(b, MK + '\nX');
      else act(b, a);
      await settle(server, b);
      await record(`DBL-S9-01-${a}`, server, b, e as Expect);
    },
  ]),
  // D1 (restart-echo-safety 3-6): catch-up 500 ms late; line 5 is the undone edit.
  ...(
    [
      ['D1-5-undo-edit', 'undo', { content: BASE }],
      ['D1-3-edit', 'edit', { content: MK + '\nX' }],
      ['D1-4-pin', 'pin', { content: MK, pinned: true }],
      ['D1-6-other-device-pin', 'other', { content: MK + '\nOTHER', pinned: true }],
    ] as const
  ).map(([name, a, e]): Scenario => [
    name,
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      if (a === 'other') {
        const cur = server.getObject(APP_ID, 'note', 'n1')!.data as Record<string, unknown>;
        server.serverChange('note', 'n1', { ...cur, content: MK + '\nOTHER' });
      }
      ctl.eachMs = 500;
      const b = openA(dir, server.url);
      if (a === 'undo') edit(b, BASE);
      if (a === 'edit') edit(b, MK + '\nX');
      if (a === 'pin' || a === 'other') act(b, 'pin');
      await settle(server, b);
      await record(name, server, b, e as Expect);
    },
  ]),
  // F198 (QA-F198, kill-after-save): killed N ms after a save.
  ...(
    [
      ['inline', 50],
      ['inline', 300],
      ['external', 300],
      ['never-got-it', 300],
      ['hold', 300],
      ['inline', 900],
    ] as const
  ).map(([mode, ms]): Scenario => [
    `F198-${mode}-${ms}`,
    async () => {
      const { server, b, serverHadIt } = await saveThenKill(mode, ms);
      await settle(server, b);
      await record(`F198-${mode}-${ms}`, server, b, { content: MK }, { serverHadIt });
    },
  ]),
  // R1 sync-1 tag rows: n1 synced with `baseTags`; while snote is closed it is
  // edited to OFF with tags `offTags`; another device sets tags `otherTags`;
  // restart with every reply 1200 ms late, no action.
  ...(
    [
      ['TAG-1-removed-offline', ['old', 'gone'], ['gone'], ['old', 'home'], ['home']],
      ['TAG-2-same-tag-hash', ['Work'], ['Home'], ['work', 'home'], ['home']],
    ] as const
  ).map(([name, baseTags, offTags, otherTags, tags]): Scenario => [
    name,
    async () => {
      const server = await startServer();
      const seeded = server.getObject(APP_ID, 'note', 'n1')!.data as Record<string, unknown>;
      server.serverChange('note', 'n1', { ...seeded, tags: [...baseTags] });
      const dir = newDir();
      const a = openA(dir, server.url);
      await waitFor(
        () => JSON.stringify(stateNote(dir)?.tags ?? []) === JSON.stringify(baseTags) && pending(a) === 0,
        8000,
        'n1 synced with its tags and saved'
      );
      await stop(a);
      const o = openA(dir, OFFLINE);
      o.store.dispatch({ type: 'EDIT_NOTE' as never, noteId: 'n1' as never, changes: { content: OFF, tags: [...offTags] } as never });
      await waitFor(
        () =>
          stateNote(dir)?.content === OFF &&
          JSON.stringify(stateNote(dir)?.tags ?? []) === JSON.stringify(offTags) &&
          'n1' in readJson(dir, 'unsynced.json'),
        8000,
        'offline edit and tags saved'
      );
      await stop(o);
      const cur = server.getObject(APP_ID, 'note', 'n1')!.data as Record<string, unknown>;
      server.serverChange('note', 'n1', { ...cur, tags: [...otherTags] });
      const ctl = control(server);
      ctl.eachMs = 1200;
      const b = openA(dir, server.url);
      await settle(server, b, 12000);
      await record(name, server, b, { content: OFF, tags: [...tags] });
    },
  ]),
  // #27 (F187) and #20 (F181): two saves before a quit, the second queued
  // behind the unacked first; restart with prompt replies, or a re-index.
  ...(
    [
      ['S27-two-saves', false],
      ['S20-reindex-two-saves', true],
    ] as const
  ).map(([name, reindex]): Scenario => [
    name,
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await twoSavesBeforeAck(server, ctl);
      if (reindex) expireCv(dir);
      ctl.hold = false;
      const b = openA(dir, server.url);
      await settle(server, b);
      await record(name, server, b, { content: MK + '\nY' });
    },
  ]),
  // F236 (sync-5b): while snote was closed with an offline edit, another
  // device changed n1 without changing its line counts (a move; a blank line
  // the offline copy already has elsewhere). `serverHeld` may not read such a
  // change as already held on line counts alone — the other device's change
  // must survive the hand-off, with a prompt catch-up or after a re-index.
  ...(
    [
      ['F236-move', OFF, 'line2\nline1', 'line2\nline1\nOFF', false],
      ['F236-move-reindex', OFF, 'line2\nline1', 'line2\nline1\nOFF', true],
      ['F236-blank', 'line1\nline2\n\nOFF', 'line1\n\nline2', 'line1\n\nline2\n\nOFF', false],
      ['F236-blank-reindex', 'line1\nline2\n\nOFF', 'line1\n\nline2', 'line1\n\nline2\n\nOFF', true],
    ] as const
  ).map(([name, offline, other, kept, reindex]): Scenario => [
    name,
    async () => {
      const server = await startServer();
      const dir = newDir();
      const a = await synced(server, dir);
      await stop(a);
      const o = openA(dir, OFFLINE);
      edit(o, offline);
      await waitFor(
        () => stateNote(dir)?.content === offline && 'n1' in readJson(dir, 'unsynced.json'),
        8000,
        'offline edit saved'
      );
      await stop(o);
      const cur = server.getObject(APP_ID, 'note', 'n1')!.data as Record<string, unknown>;
      server.serverChange('note', 'n1', { ...cur, content: other });
      if (reindex) expireCv(dir);
      const b = openA(dir, server.url);
      await settle(server, b);
      await record(name, server, b, { content: kept });
    },
  ]),
];

const byId = new Map(scenarios);

/** Run one scenario by id and return what both sides hold at the end. */
export async function runScenario(id: string): Promise<Outcome> {
  const run = byId.get(id);
  if (!run) throw new Error(`rig: no scenario ${id}`);
  await run();
  const outcome = outcomes.get(id);
  if (!outcome) throw new Error(`rig: scenario ${id} recorded nothing`);
  return outcome;
}
