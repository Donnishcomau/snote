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
  dirOf.set(built, dataDir); // #677: settle() reads this client's unsynced.json
  return built;
}
// #677: each client's data dir, so every settle() waits for the start-up hand-off, whatever the family.
const dirOf = new WeakMap<Built, string>();

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
  const ctl = { hold: false, eachMs: 0, lateMs: 0, ignore: false, applyLateMs: 0 };
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
    // #677: the server applies (and answers) each client change this many ms late
    if (ctl.applyLateMs > 0) setTimeout(() => realHandle(...args), ctl.applyLateMs);
    else realHandle(...args);
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

/**
 * Wait until both sides agree with nothing pending (or `maxMs`), then 1500 ms more. #650, #677: for every client (its
 * data dir from openA), also wait until unsynced.json no longer lists n1 (the start-up hand-off was acknowledged),
 * polled every 10 ms: a re-index can show both sides agreeing on the server copy before the hand-off sends the edit.
 * The 1500 ms after agreement is kept (#650): it is where a late effect (a re-applied echo, a second merge, a conflict
 * copy) shows before the outcome is read. Nothing has to happen inside it, so host load cannot turn a correct run red.
 */
async function settle(server: FakeSimperiumServer, b: Built, maxMs = 10000): Promise<void> {
  const dir = dirOf.get(b);
  const handedOff = () => dir === undefined || !('n1' in readJson(dir, 'unsynced.json'));
  const agree = () =>
    pending(b) === 0 && JSON.stringify(view(serverNote(server))) === JSON.stringify(view(localNote(b))) && handedOff();
  const start = Date.now();
  while (!agree() && Date.now() - start < maxMs) await sleep(10);
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

/** rig: save MK, "kill" `killMs` later by copying the data dir; restart on the copy. */
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
  // ( sr8-crash-window): sent, server applied, no ack, killed before the state.json save.
  ...(['edit', 'trash'] as const).map((kind): Scenario => [
    `crash-before-save-${kind}`,
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
        await record(`crash-before-save-trash`, server, b, { content: BASE, deleted: true, pinned: true }, { phase1 });
      } else {
        const phase1 = await laterEdit(server, b);
        await record(`crash-before-save-edit`, server, b, { content: MK + '\nLATER' }, { phase1 });
      }
    },
  ]),

  // P8: server copy dated 30 s ahead, MK unacked, pin, crash before state.json holds the pin.
  [
    'P8-ahead-copy-pin-crash',
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
      await record('P8-ahead-copy-pin-crash', server, b, { content: MK + '\nLATER' }, { phase1, pinNote: 'pin made before the crash is not gated' });
    },
  ],
  // sync-8: an offline edit, then a session edit made at once with the catch-up
  // 1.5 s late (the note is held): the library rebases a note changed in this
  // session, so the session edit is kept.
  [
    'HOLD-session-edit',
    async () => {
      const server = await startServer();
      const dir = await offlineSession(server);
      const ctl = control(server);
      ctl.lateMs = 1500;
      const b = openA(dir, server.url);
      edit(b, OFF + '\nSESS');
      await settle(server, b);
      await record('HOLD-session-edit', server, b, { content: OFF + '\nSESS' });
    },
  ],
  // P6 with the catch-up 7 s late (after the rig's 5 s catch-up wait),
  // so the LATER edit is made before the catch-up lands (the order heavy load
  // produces; Mac mini run, 21 Oct).
  [
    'P6-ahead-copy-late',
    async () => {
      const server = await startServer(Date.now() / 1000 + 30);
      const ctl = control(server);
      const dir = newDir();
      const a = await sendMkUnacked(server, ctl, dir);
      await stop(a);
      rmSync(join(dir, 'unsynced.json'), { force: true });
      ctl.hold = false;
      ctl.lateMs = 7000;
      const b = openA(dir, server.url);
      await catchUp(b);
      const phase1 = await laterEdit(server, b);
      await record('P6-ahead-copy-late', server, b, { content: MK + '\nLATER' }, { phase1 });
    },
  ],
  // #130: P6 and P8 with a start that must re-index (both starts).
  [
    'P6-ahead-copy-clean-stop-reindex',
    async () => {
      const server = await startServer(Date.now() / 1000 + 30);
      const ctl = control(server);
      const dir = newDir();
      const a = await sendMkUnacked(server, ctl, dir);
      await stop(a);
      rmSync(join(dir, 'unsynced.json'), { force: true });
      expireCv(dir);
      ctl.hold = false;
      const b = openA(dir, server.url);
      await catchUp(b);
      const phase1 = await laterEdit(server, b);
      await record('P6-ahead-copy-clean-stop-reindex', server, b, { content: MK + '\nLATER' }, { phase1 });
    },
  ],
  [
    'P8-ahead-copy-pin-crash-reindex',
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
      expireCv(dir);
      ctl.hold = false;
      const b = openA(dir, server.url);
      await catchUp(b);
      const phase1 = await laterEdit(server, b);
      await record('P8-ahead-copy-pin-crash-reindex', server, b, { content: MK + '\nLATER' }, { phase1 });
    },
  ],
  // P6: server copy dated 30 s ahead, MK unacked, clean stop, unsynced.json removed.
  [
    'P6-ahead-copy-clean-stop',
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
      await record('P6-ahead-copy-clean-stop', server, b, { content: MK + '\nLATER' }, { phase1 });
    },
  ],

  // Q9 / Q8 (start-up-action-kept 1-10): offline edit OFF, then a pin/trash/tag before the catch-up.
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
    name,
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
      await record(name, server, b, e);
    },
  ]),
  // Q1 (start-up-action-kept 11): MK unacked at quit, catch-up 6 s late, pin at once.
  [
    'Q1-pin',
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
      await record('Q1-pin', server, b, { content: MK, pinned: true });
    },
  ],

  // O1-O4: the user undoes an offline-session action before the catch-up.
  ...(
    [
      ['O1-unpin', 'pin', 'unpin', 1200, 0, { pinned: false }],
      ['O2-unpin', 'pin', 'unpin', 0, 400, { pinned: false }],
      ['O3-restore', 'trash', 'restore', 1200, 0, { deleted: false }],
      ['O4-untag', 'tag', 'untag', 1200, 0, { tags: [] }],
    ] as const
  ).map(([name, offAct, undo, late, at, e]): Scenario => [
    name,
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
      await record(name, server, b, { content: OFF, ...e } as Expect);
    },
  ]),

  // A1, A4, O5: another device changes the same array field while snote is closed.
  ...(
    [
      ['A1-tags', [] as Act[], { tags: ['home'] }, 'tag', { tags: ['home', 'work'] }],
      ['A4-systemTags', [] as Act[], { systemTags: ['markdown'] }, 'pin', { pinned: true, markdown: true }],
      ['O5-offline-pin-tags', ['pin'] as Act[], { tags: ['home'] }, 'tag', { pinned: true, tags: ['home', 'work'] }],
    ] as const
  ).map(([name, offActs, other, a, e]): Scenario => [
    name,
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
      await record(name, server, b, { content: OFF, ...e } as Expect);
    },
  ]),

  // REVIEW- sweep (prompt catch-up after quit-before-ack).
  [
    'P1-revert',
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      const b = openA(dir, server.url);
      edit(b, BASE);
      await settle(server, b);
      await record('P1-revert', server, b, { content: BASE });
    },
  ],
  [
    'P2-delete-forever',
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
      await record('P2-delete-forever', server, b, { gone: true });
    },
  ],
  // (#125): the same delete forever just after a restart that must
  // re-index (change version unreadable), at once and with the index 1.5 s late;
  // and a tombstone left by an earlier session re-sent at a re-index start.
  ...(
    [
      ['forever-reindex', 0],
      ['forever-late-reindex', 1500],
    ] as const
  ).map(([name, late]): Scenario => [
    name,
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      expireCv(dir);
      ctl.hold = false;
      ctl.lateMs = late;
      const b = openA(dir, server.url);
      act(b, 'trash');
      act(b, 'forever');
      await sleep(3000);
      await settle(server, b);
      await record(name, server, b, { gone: true });
    },
  ]),
  [
    'tombstone-resend-reindex',
    async () => {
      const server = await startServer();
      const dir = newDir();
      const a = await synced(server, dir);
      await stop(a);
      writeFileSync(join(dir, 'tombstones.json'), JSON.stringify(['n1']));
      expireCv(dir);
      const b = openA(dir, server.url);
      await sleep(3000);
      await settle(server, b);
      await record('tombstone-resend-reindex', server, b, { gone: true });
    },
  ],
  // (#93): P2-delete-forever with the catch-up 1.5 s late, so the remove goes out
  // before the echo of the pre-quit edit arrives (the order load produces).
  [
    'forever-late-echo',
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
      await record('forever-late-echo', server, b, { gone: true });
    },
  ],
  [
    'P3-other-device-pin',
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
      await record('P3-other-device-pin', server, b, { content: MK + '\nOTHER', pinned: true });
    },
  ],
  [
    'P4-offline-pin',
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
      await record('P4-offline-pin', server, b, { content: MK, pinned: true });
    },
  ],
  [
    'P5-two-offline-then-pin',
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
      await record('P5-two-offline-then-pin', server, b, { content: MK, pinned: true });
    },
  ],
  // Doubling probe: quit-before-ack, no action ( P7, quit-before-ack 1).
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
  // Doubling probe (touch-before-echo 1-3): an action right after restart, prompt catch-up.
  ...(
    [
      ['pin', { content: MK, pinned: true }],
      ['edit', { content: MK + '\nX' }],
      ['trash', { content: MK, deleted: true }],
    ] as const
  ).map(([a, e]): Scenario => [
    `DBL-restart-${a}`,
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      const b = openA(dir, server.url);
      if (a === 'edit') edit(b, MK + '\nX');
      else act(b, a);
      await settle(server, b);
      await record(`DBL-restart-${a}`, server, b, e as Expect);
    },
  ]),
  // D1 (restart-echo-safety 3-6): catch-up 500 ms late; line 5 is the undone edit.
  ...(
    [
      ['late-catch-up-undo-edit', 'undo', { content: BASE }],
      ['late-catch-up-edit', 'edit', { content: MK + '\nX' }],
      ['late-catch-up-pin', 'pin', { content: MK, pinned: true }],
      ['late-catch-up-other-device-pin', 'other', { content: MK + '\nOTHER', pinned: true }],
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
  // (QA-, kill-after-save): killed N ms after a save.
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
    `kill-${mode}-${ms}`,
    async () => {
      const { server, b, serverHadIt } = await saveThenKill(mode, ms);
      await settle(server, b);
      await record(`kill-${mode}-${ms}`, server, b, { content: MK }, { serverHadIt });
    },
  ]),
  // R1 sync-1 tag rows: n1 synced with `baseTags`; while snote is closed it is
  // edited to OFF with tags `offTags`; another device sets tags `otherTags`;
  // restart with every reply 1200 ms late, no action.
  ...(
    [
      ['tags-removed-offline', ['old', 'gone'], ['gone'], ['old', 'home'], ['home']],
      ['tags-same-tag-hash', ['Work'], ['Home'], ['work', 'home'], ['home']],
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
  // #27 and #20: two saves before a quit, the second queued
  // behind the unacked first; restart with prompt replies, or a re-index.
  ...(
    [
      ['two-saves', false],
      ['two-saves-reindex', true],
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
  // (sync-5b): while snote was closed with an offline edit, another
  // device changed n1 without changing its line counts (a move; a blank line
  // the offline copy already has elsewhere). `serverHeld` may not read such a
  // change as already held on line counts alone — the other device's change
  // must survive the hand-off, with a prompt catch-up or after a re-index.
  ...(
    [
      ['count-neutral-move', OFF, 'line2\nline1', 'line2\nline1\nOFF', false],
      ['count-neutral-move-reindex', OFF, 'line2\nline1', 'line2\nline1\nOFF', true],
      ['count-neutral-blank', 'line1\nline2\n\nOFF', 'line1\n\nline2', 'line1\n\nline2\n\nOFF', false],
      ['count-neutral-blank-reindex', 'line1\nline2\n\nOFF', 'line1\n\nline2', 'line1\n\nline2\n\nOFF', true],
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
      // #677: this row's server applies the hand-off 2000 ms late (past the 1500 ms tail): the read must wait for it
      if (name === 'count-neutral-move-reindex') control(server).applyLateMs = 2000;
      const b = openA(dir, server.url);
      await settle(server, b);
      await record(name, server, b, { content: kept });
    },
  ]),
  // (#105),, standing rows: n1 synced as `baseContent`; while snote is
  // closed it is edited offline to `offline` and another device sets it to
  // `other` ('' = no change); restart, prompt or re-index. an offline
  // edit that only moves a line is kept. another device moved a line to
  // where the offline copy inserted the same line; it ends once. another
  // device moved the line the offline edit deleted; the untouched lines stay.
  // REPDEL: another device deleted one of two equal lines; it stays deleted.
  // the offline edit added a copy of a line and another device changed
  // the note elsewhere; the copy is sent (one server line counts once).
  // MOVEAPP (#115): an offline move plus another device's appended line keeps
  // both. CONFLICT-hostile-title: both sides changed the first line; both
  // versions are kept in the note (and the notice names it, sanitised).
  ...(
    [
      ['offline-move', BASE, 'line2\nline1', '', 'line2\nline1', false],
      ['offline-move-reindex', BASE, 'line2\nline1', '', 'line2\nline1', true],
      ['coincident-line', 'a\nb\nX\nc', 'a\nX\nb\nX\nc\nOFF', 'a\nX\nb\nc', 'a\nX\nb\nc\nOFF', false],
      ['coincident-line-reindex', 'a\nb\nX\nc', 'a\nX\nb\nX\nc\nOFF', 'a\nX\nb\nc', 'a\nX\nb\nc\nOFF', true],
      ['coincident-blank-reindex', 'a\nb\n\nc', 'a\n\nb\n\nc\nOFF', 'a\n\nb\nc', 'a\n\nb\nc\nOFF', true],
      ['delete-moved', 'a\nb\nc', 'a\nc\nOFF', 'b\na\nc', 'b\na\nc\nOFF', false],
      ['delete-moved-reindex', 'a\nb\nc', 'a\nc\nOFF', 'b\na\nc', 'b\na\nc\nOFF', true],
      ['delete-moved-down', 'a\nb\nc', 'a\nc\nOFF', 'a\nc\nb', 'a\nc\nb\nOFF', false],
      ['delete-moved-down-reindex', 'a\nb\nc', 'a\nc\nOFF', 'a\nc\nb', 'a\nc\nb\nOFF', true],
      ['dup-line-reindex', 'a\nb', 'a\nb\nb', 'Z\na\nb', 'Z\na\nb\nb', true],
      ['dup-blank-reindex', 'a\n\nb', 'a\n\n\nb', 'a\nZ\n\nb', 'a\nZ\n\n\nb', true],
      ['MOVEAPP', BASE, 'line2\nline1', 'line1\nline2\nX', 'line2\nline1\nX', false],
      ['MOVEAPP-reindex', BASE, 'line2\nline1', 'line1\nline2\nX', 'line2\nline1\nX', true],
      ['CONFLICT-hostile-title', 'T\nline2', '\u001b]52;c;eA==\u0007T-OFF\nline2', 'T-OTHER\nline2', '\u001b]52;c;eA==\u0007T-OFF\nline2\n\n--- conflicting change from another device ---\nT-OTHER\nline2', false],
      ['move-edit-append', 'a\nb\nc', 'c2\na\nb', 'a\nb\nc\nZ', 'c2\na\nb\n\n--- conflicting change from another device ---\na\nb\nc\nZ', false],
      ['space-move', 'a\nb\nc', 'a \nb\nc', 'b\na\nc', 'a \nb\nc\n\n--- conflicting change from another device ---\nb\na\nc', false],
      ['repdel-first', 'line1\nline2', 'line1\nline2\nline1\nOFF', 'line2', 'line2\nline1\nOFF', false],
      ['repdel-last', 'line1\nline2', 'line1\nline2\nline2\nOFF', 'line1', 'line1\nline2\nOFF', false],
      ['move-edit-append-reindex', 'a\nb\nc', 'c2\na\nb', 'a\nb\nc\nZ', 'c2\na\nb\n\n--- conflicting change from another device ---\na\nb\nc\nZ', true],
      ['space-move-reindex', 'a\nb\nc', 'a \nb\nc', 'b\na\nc', 'a \nb\nc\n\n--- conflicting change from another device ---\nb\na\nc', true],
      ['repdel-first-reindex', 'line1\nline2', 'line1\nline2\nline1\nOFF', 'line2', 'line2\nline1\nOFF', true],
      ['repdel-last-reindex', 'line1\nline2', 'line1\nline2\nline2\nOFF', 'line1', 'line1\nline2\nOFF', true],
      ['REPDEL-reindex', 'a\nX\nb\nX\nc', 'a\nX\nb\nX\nc\nOFF', 'a\nX\nb\nc', 'a\nX\nb\nc\nOFF', true],
    ] as const
  ).map(([name, baseContent, offline, other, kept, reindex]): Scenario => [
    name,
    async () => {
      const server = await startServer();
      const seeded = server.getObject(APP_ID, 'note', 'n1')!.data as Record<string, unknown>;
      if (baseContent !== BASE) server.serverChange('note', 'n1', { ...seeded, content: baseContent });
      const dir = newDir();
      const a = openA(dir, server.url);
      await waitFor(() => stateNote(dir)?.content === baseContent && pending(a) === 0, 8000, 'n1 synced and saved');
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
      if (other) server.serverChange('note', 'n1', { ...cur, content: other });
      if (reindex) expireCv(dir);
      const b = openA(dir, server.url);
      await settle(server, b, 10000);
      await record(name, server, b, { content: kept });
    },
  ]),
  // An edit made after a quit, then a start with a readable change version
  // (`prompt`) or an unreadable one, so it re-indexes (`reindex`). Snote is
  // closed with offline saves; `other`, if any, is another device's change.
  // never-sent: two saves made with no server, none of them ever sent.
  // same-line-reindex: both devices changed line2; both versions are kept as a conflict block.
  ...(
    [
      ['never-sent-prompt', ['line1\nline2\nMK', 'line1\nline2\nMK\nZZ'], undefined, 'line1\nline2\nMK\nZZ', false],
      ['never-sent-reindex', ['line1\nline2\nMK', 'line1\nline2\nMK\nZZ'], undefined, 'line1\nline2\nMK\nZZ', true],
      ['same-line-reindex', ['line1\nline2 MINE'], 'line1\nline2 THEIRS', 'line1\nline2 MINE\n\n--- conflicting change from another device ---\nline1\nline2 THEIRS', true],
    ] as const
  ).map(([name, saves, other, kept, reindex]): Scenario => [
    name,
    async () => {
      const server = await startServer();
      const dir = newDir();
      const a = await synced(server, dir);
      await stop(a);
      const o = openA(dir, OFFLINE);
      for (const text of saves) edit(o, text);
      await waitFor(
        () => stateNote(dir)?.content === saves[saves.length - 1] && 'n1' in readJson(dir, 'unsynced.json'),
        8000,
        'offline saves kept'
      );
      await stop(o);
      if (other) {
        const cur = server.getObject(APP_ID, 'note', 'n1')!.data as Record<string, unknown>;
        server.serverChange('note', 'n1', { ...cur, content: other });
      }
      if (reindex) expireCv(dir);
      const b = openA(dir, server.url);
      await settle(server, b);
      await record(name, server, b, { content: kept });
    },
  ]),
  // / #336: a pin, then the data dir copied N ms later (a kill), MK unacked: KEPT.
  ...([0, 200, 450] as const).map((ms): Scenario => [
    `pin-kill-${ms}`,
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = newDir();
      const killed = newDir();
      const a = await sendMkUnacked(server, ctl, dir);
      act(a, 'pin');
      await sleep(ms);
      cpSync(dir, killed, { recursive: true, filter: (src) => !src.endsWith('instance.lock') });
      await stop(a);
      ctl.hold = false;
      const b = openA(killed, server.url);
      await settle(server, b);
      await record(`pin-kill-${ms}`, server, b, { content: MK, pinned: true });
    },
  ]),
  // / #336: a catch-up reply late by lateMs after a quit before the ack: KEPT.
  ...(
    [
      [3900, 'none'], [4500, 'none'], [4500, 'edit'], [4500, 'pin'], [6000, 'pin'],
    ] as const
  ).map(([ms, a]): Scenario => [
    `late-${ms}-${a}`,
    async () => {
      const server = await startServer();
      const ctl = control(server);
      const dir = await quitBeforeAck(server, ctl);
      ctl.hold = false;
      ctl.eachMs = ms;
      const b = openA(dir, server.url);
      if (a === 'edit') edit(b, MK + '\nX');
      if (a === 'pin') act(b, 'pin');
      await sleep(ms);
      await settle(server, b, 10000);
      const e: Expect = a === 'edit' ? { content: MK + '\nX' } : a === 'pin' ? { content: MK, pinned: true } : { content: MK };
      await record(`late-${ms}-${a}`, server, b, e);
    },
  ]),
];

const byId = new Map(scenarios);

/** Every scenario id in table order; a repeated id stays visible (the Map above would hide it). */
export const scenarioIds = (): string[] => scenarios.map(([id]) => id);

/** Run one scenario by id and return what both sides hold at the end. */
export async function runScenario(id: string): Promise<Outcome> {
  const run = byId.get(id);
  if (!run) throw new Error(`rig: no scenario ${id}`);
  await run();
  const outcome = outcomes.get(id);
  if (!outcome) throw new Error(`rig: scenario ${id} recorded nothing`);
  return outcome;
}
