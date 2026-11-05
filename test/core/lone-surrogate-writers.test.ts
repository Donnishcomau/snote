/**
 * #333 ( residual): every writer of note text goes through one seam in the store
 * (makeStore's middleware) that makes a lone surrogate half U+FFFD before the text is
 * stored, except a tail equal to the note's current text (the other device's text in a
 * conflict block). A lone half cannot go through the sync library's diff: bucket.touch
 * raises an unhandled URIError and the change stays pending. Server-origin actions are
 * not writers and are left as they are. Notes loaded from state.json are mended by
 * requeueUnsynced before anything can send them.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeSimperiumServer } from '../fake-simperium/server';
import { buildStore } from '../../src/cli/main';
import { requeueUnsynced, type GhostReader } from '../../src/core/requeue';
import { pendingCount } from '../../src/core/simperium-reducer';
import { makeStore } from '../../src/core/store';
import { createNote, insertCheckItem, saveInlineEdit } from '../../src/tui/app-actions';
import { handleHistoryKey } from '../../src/tui/app-keys';
import { handleNoteKey } from '../../src/tui/note-focus';
import { makeNote } from '../tui/fixtures';
import type { EntityId, Note } from '@vendor/types';

const FFFD = '\uFFFD';
const id = 'n1' as unknown as EntityId;
type S = ReturnType<typeof makeStore>;
const plain = (): S => makeStore({ stubClient: {} });
const contentOf = (store: S, noteId: EntityId = id): string | undefined => store.getState().data.notes.get(noteId)?.content;
/** Server-origin seeding: the seam does not touch it, so the note holds the text as given. */
const seed = (store: S, content: string, noteId: EntityId = id): void => {
  store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId, note: makeNote(String(noteId), content) } as never);
};

// ------------------------------------------------------------ sync rig (the 285 pattern)

const APP_ID = 'test-app';
const TOKEN = 'store1-token';
const EMAIL = 'store1@example.com';
const BASE = 'line1\nline2';
type Built = ReturnType<typeof buildStore>;
type WireNote = { content?: string } | undefined;
const servers: FakeSimperiumServer[] = [];
const dirs: string[] = [];
const open: Built[] = [];
const rejections: string[] = [];
const onRejection = (r: unknown): void => {
  rejections.push(String(r));
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Poll until `cond` holds or `ms` pass; the caller then asserts on the same values. */
async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!cond() && Date.now() - start < ms) await sleep(25);
}
function newDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'snote-333-'));
  dirs.push(d);
  return d;
}
const noteData = (content: string, modificationDate: number) => ({ content, creationDate: 1000, deleted: false, modificationDate, systemTags: [], tags: [] });
async function startServer(): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  servers.push(server);
  server.seedBucket(APP_ID, 'note', [{ id: 'n1', data: noteData(BASE, 2000), version: 3 }]);
  return server;
}
function openA(dataDir: string, url: string): Built {
  const built = buildStore({ dataDir, appId: APP_ID, server: url, noteEditDelayMs: 10 }, { email: EMAIL, token: TOKEN }, () => {});
  open.push(built);
  return built;
}
const serverNote = (s: FakeSimperiumServer, noteId = 'n1'): WireNote => s.getObject(APP_ID, 'note', noteId)?.data as WireNote;
const localNote = (b: Built, noteId = 'n1'): WireNote => b.store.getState().data.notes.get(noteId as never) as WireNote;
const pending = (b: Built): number => pendingCount(b.store.getState().simperium);
function stateNotes(dir: string): [string, Record<string, unknown>][] {
  try {
    const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as { data?: { notes?: { __map?: [string, Record<string, unknown>][] } } };
    return s.data?.notes?.__map ?? [];
  } catch {
    return [];
  }
}
async function stop(b: Built): Promise<void> {
  b.stopSaving();
  (b.store.client as unknown as { end?: () => void })?.end?.();
  b.store.stopSync?.();
  open.splice(open.indexOf(b), 1);
  await sleep(300);
}
/** n1 synced as BASE and saved, then the session stops. */
async function syncedDir(server: FakeSimperiumServer): Promise<string> {
  const dir = newDir();
  const a = openA(dir, server.url);
  await until(() => localNote(a)?.content === BASE && pending(a) === 0 && stateNotes(dir).some(([k, n]) => k === 'n1' && n.content === BASE));
  await stop(a);
  return dir;
}
/** Rewrite state.json as a quit would have left it: `notes` set or added by id (JSON keeps a lone half as `\\udXXX`). */
function writeState(dir: string, notes: Record<string, Record<string, unknown>>): void {
  const p = join(dir, 'state.json');
  const s = JSON.parse(readFileSync(p, 'utf8')) as { data: { notes: { __map: [string, Record<string, unknown>][] } } };
  for (const [k, n] of Object.entries(notes)) {
    const at = s.data.notes.__map.findIndex(([x]) => x === k);
    if (at >= 0) s.data.notes.__map[at] = [k, n];
    else s.data.notes.__map.push([k, n]);
  }
  writeFileSync(p, JSON.stringify(s));
}

afterEach(async () => {
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
  process.off('unhandledRejection', onRejection);
  rejections.length = 0;
});

// ------------------------------------------------------------ guards (10, 11)

const SRC = join(__dirname, '..', '..', 'src');
function srcFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'vendor' ? [] : srcFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}
const rel = (p: string): string => 'src/' + p.slice(SRC.length + 1).split('\\').join('/');
const WRITER_SITE = /'EDIT_NOTE'|'CREATE_NOTE_WITH_ID'|'IMPORT_NOTE_WITH_ID'|'RESTORE_NOTE_REVISION'|editNote\(|createNote\(/g;
/** Every dispatch site of a note-text writer in src on the base (#333), by occurrence count. */
const PINNED_SITES: Record<string, number> = {
  'src/core/editor-drafts.ts': 2,
  'src/core/held-lines.ts': 1, // #97 noteWriter (snote-97b)
  'src/core/history.ts': 1,
  'src/core/requeue.ts': 2, // #657b: the hand-off's three IMPORT sites are one (handOff)
  'src/core/simperium-reducer.ts': 4,
  'src/tui/App.tsx': 1,
  'src/tui/app-actions.ts': 5,
  'src/tui/inline-new-note.ts': 1, // #618 4c: the first store of an inline new note (mended at the store like every writer)
  'src/tui/note-focus.ts': 1,
};
/** The vendored notes reducer's cases whose body writes a note's content or assigns the action's note. */
function noteAssigningCases(): string[] {
  const src = readFileSync(join(__dirname, '..', '..', 'vendor', 'simplenote', 'state', 'data', 'reducer.ts'), 'utf8');
  const start = src.indexOf('export const notes');
  const end = src.indexOf('\nexport const', start + 1);
  const lines = src.slice(start, end < 0 ? undefined : end).split('\n');
  const groups: { labels: string[]; body: string }[] = [];
  let inLabels = false;
  for (const line of lines) {
    const m = /^\s*case\s+'(\w+)'/.exec(line);
    if (m) {
      if (!inLabels) groups.push({ labels: [], body: '' });
      groups[groups.length - 1].labels.push(m[1]);
      inLabels = true;
      const rest = line.slice(line.indexOf(':', m.index + m[0].length) + 1);
      groups[groups.length - 1].body += rest + '\n';
      if (rest.trim() !== '' && rest.trim() !== '{') inLabels = false;
      continue;
    }
    if (/^\s*default\s*:/.test(line)) {
      groups.push({ labels: [], body: '' });
      inLabels = false;
      continue;
    }
    if (line.trim() !== '') inLabels = false;
    if (groups.length > 0) groups[groups.length - 1].body += line + '\n';
  }
  const writes = /\bcontent\s*:|\.\.\.\s*action\.(?:note|changes)\b|[(,]\s*action\.note\s*\)/;
  return groups.filter((g) => writes.test(g.body)).flatMap((g) => g.labels).sort();
}

describe('#333 every note-text writer mends a lone surrogate at the store', () => {
  it('1: WHEN each of EDIT_NOTE, CREATE_NOTE_WITH_ID, IMPORT_NOTE_WITH_ID and RESTORE_NOTE_REVISION is dispatched with content `x\\uDE00y\\uD800z` THEN nothing throws and the stored content is `x\\uFFFDy\\uFFFDz` for each, and a content with no half, `x😀y`, is stored unchanged', () => {
    const actions = (content: string) => [
      { type: 'EDIT_NOTE', noteId: id, changes: { content } },
      { type: 'CREATE_NOTE_WITH_ID', noteId: id, note: { content, systemTags: [], tags: [] } },
      { type: 'IMPORT_NOTE_WITH_ID', noteId: id, note: makeNote('n1', content) },
      { type: 'RESTORE_NOTE_REVISION', noteId: id, note: makeNote('n1', content) },
    ];
    const got: Record<string, unknown> = {};
    for (const content of ['x\uDE00y\uD800z', 'x😀y']) {
      for (const a of actions(content)) {
        const store = plain();
        try {
          store.dispatch(a as never);
          got[`${a.type} ${JSON.stringify(content)}`] = contentOf(store);
        } catch (e) {
          got[`${a.type} ${JSON.stringify(content)}`] = String(e);
        }
      }
    }
    const want: Record<string, unknown> = {};
    for (const t of ['EDIT_NOTE', 'CREATE_NOTE_WITH_ID', 'IMPORT_NOTE_WITH_ID', 'RESTORE_NOTE_REVISION']) {
      want[`${t} ${JSON.stringify('x\uDE00y\uD800z')}`] = `x${FFFD}y${FFFD}z`;
      want[`${t} ${JSON.stringify('x😀y')}`] = 'x😀y';
    }
    expect(got).toEqual(want);
  });

  it('2: WHEN the note holds `a\\uDE00b` (written by REMOTE_NOTE_UPDATE) and EDIT_NOTE writes `new\\uD800\\n\\n---\\na\\uDE00b` (a head with a half, a tail equal to the note) THEN the head becomes `new\\uFFFD` and the tail keeps `\\uDE00`, and WHEN EDIT_NOTE writes `a\\uDE00bc` (no longer ends with the note) THEN every half is `\\uFFFD`', () => {
    const kept = plain();
    seed(kept, 'a\uDE00b');
    kept.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: 'new\uD800\n\n---\na\uDE00b' } } as never);
    const moved = plain();
    seed(moved, 'a\uDE00b');
    moved.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: 'a\uDE00bc' } } as never);
    expect({ kept: contentOf(kept), moved: contentOf(moved) }).toEqual({ kept: `new${FFFD}\n\n---\na\uDE00b`, moved: `a${FFFD}bc` });
  });

  it('3: (pass-on-old) WHEN REMOTE_NOTE_UPDATE and NOTE_BUCKET_UPDATE carry content `s\\uDE00t` THEN the store holds `s\\uDE00t` as it is (server text is not ours to change) (pass-on-old)', () => {
    const got: string[] = [];
    for (const type of ['REMOTE_NOTE_UPDATE', 'NOTE_BUCKET_UPDATE']) {
      const store = plain();
      store.dispatch({ type, noteId: id, note: makeNote('n1', 's\uDE00t') } as never);
      got.push(String(contentOf(store)));
    }
    expect(got).toEqual(['s\uDE00t', 's\uDE00t']);
  });

  it('4: WHEN a store with sync (fake server on localhost) gets EDIT_NOTE of `x\\uDE00y` and of `x\\uD800y` THEN no unhandled rejection occurs, `pendingCount` is `0` once the server confirms, and the server holds `x\\uFFFDy` for each', async () => {
    process.on('unhandledRejection', onRejection);
    const got: unknown[] = [];
    for (const text of ['x\uDE00y', 'x\uD800y']) {
      const server = await startServer();
      const a = openA(newDir(), server.url);
      await until(() => localNote(a)?.content === BASE && pending(a) === 0);
      a.store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: text } } as never);
      await until(() => rejections.length === 0 && pending(a) === 0 && serverNote(server)?.content === `x${FFFD}y`);
      got.push({ rejections: [...rejections], pending: pending(a), server: serverNote(server)?.content });
    }
    const want = { rejections: [], pending: 0, server: `x${FFFD}y` };
    expect(got).toEqual([want, want]);
  }, 30000);

  it('5: WHEN createNote (src/tui/app-actions.ts) gets `n\\uD800m` from the editor stub THEN the new note holds `n\\uFFFDm`', async () => {
    const store = plain();
    createNote({ store, setRawMode: () => {}, runEditor: async () => 'n\uD800m', setSelectedIndex: (() => {}) as never });
    const texts = () => [...store.getState().data.notes.values()].map((n) => n.content);
    await vi.waitFor(() => expect(texts()).toEqual([`n${FFFD}m`]), { timeout: 2000, interval: 5 });
  });

  it('6: (keep-green, pass-on-old) WHEN saveInlineEdit saves the pasted buffer `p\\uDE00q` and nothing came from the other device THEN the note holds `p\\uFFFDq` (already true on the base: saveInlineEdit calls mergeEditorKeepingText and held-lines.ts:207 runs mendOwn, #332; this line pins that the seam did not break it) (pass-on-old)', () => {
    const store = plain();
    seed(store, 'pq');
    saveInlineEdit({ store, selectedEntry: { id, note: store.getState().data.notes.get(id)! }, base: 'pq', local: 'p\uDE00q' });
    expect(contentOf(store)).toBe(`p${FFFD}q`);
  });

  it('7: WHEN the checklist key `c` toggles `- [ ] a\\uDE00` and the add-item path (insertCheckItem) adds `i\\uDE00` THEN the notes hold `- [x] a\\uFFFD` and a line `- [ ] i\\uFFFD`', () => {
    const store = plain();
    const n2 = 'n2' as unknown as EntityId;
    seed(store, '- [ ] a\uDE00');
    seed(store, '- [ ] b', n2);
    handleNoteKey('c', null, { store, selectedEntry: { id, note: store.getState().data.notes.get(id)! }, itemIndex: 0, setItemIndex: () => {} });
    insertCheckItem({ store, selectedEntry: { id: n2, note: store.getState().data.notes.get(n2)! }, itemIndex: 0, value: 'i\uDE00' });
    const added = String(contentOf(store, n2)).split('\n');
    expect({ toggled: contentOf(store), added: added.includes(`- [ ] i${FFFD}`), raw: added.some((l) => l.includes('\uDE00')) }).toEqual({
      toggled: `- [x] a${FFFD}`,
      added: true,
      raw: false,
    });
  });

  it('8: WHEN makeStore gets preloadedState holding the offline-created note `o\\uD800p` (state.json is loaded this way; no dispatch seeds it) and requeueUnsynced runs with no whenCaughtUp and a ghost with no data THEN the store and the dispatched IMPORT_NOTE_WITH_ID hold `o\\uFFFDp`', async () => {
    const store = makeStore({ stubClient: {}, preloadedState: { data: { notes: new Map([[id, makeNote('n1', 'o\uD800p')]]) } } as never });
    const sent: string[] = [];
    const spy = { ...store, dispatch: (a: { type: string; note?: Note }) => { if (a.type === 'IMPORT_NOTE_WITH_ID') sent.push(String(a.note?.content)); return store.dispatch(a as never); } } as unknown as S;
    const ghosts: GhostReader = { get: () => Promise.resolve({ data: undefined }) };
    await requeueUnsynced(spy, ghosts);
    expect({ store: contentOf(store), sent }).toEqual({ store: `o${FFFD}p`, sent: [`o${FFFD}p`] });
  });

  it('9: WHEN the history key Enter restores a revision whose content is `r\\uDE00` THEN the note holds `r\\uFFFD`', () => {
    const store = plain();
    seed(store, 'now');
    store.dispatch({ type: 'LOAD_REVISIONS', noteId: id, revisions: [[1, makeNote('n1', 'r\uDE00')]] } as never);
    handleHistoryKey('', 'Enter', {
      store,
      noteEntries: [{ id, note: store.getState().data.notes.get(id)! }],
      selectedIndex: 0,
      historyIndex: 0,
      setHistoryIndex: () => {},
      setHistoryOpen: () => {},
    });
    expect(contentOf(store)).toBe(`r${FFFD}`);
  });

  it("10: (pass-on-old) WHEN every non-vendor file under src is searched for `'EDIT_NOTE'`, `'CREATE_NOTE_WITH_ID'`, `'IMPORT_NOTE_WITH_ID'`, `'RESTORE_NOTE_REVISION'`, `editNote(` and `createNote(` THEN the files and counts (all six patterns added together per file) equal a pinned table: as read on origin/main a07619f4: src/core/editor-drafts.ts 2, src/core/history.ts 1, src/core/requeue.ts 2 (#657b), src/core/simperium-reducer.ts 4, src/tui/App.tsx 1 (a createNote( call; read-only), src/tui/app-actions.ts 5, src/tui/note-focus.ts 1; src/core/store.ts has 0 (its middleware tests a regular expression, not the quoted strings), and a table that lacks a found site, or lists one that is gone, fails naming the file (pass-on-old)", () => {
    const found: Record<string, number> = {};
    for (const f of srcFiles()) {
      const n = (readFileSync(f, 'utf8').match(WRITER_SITE) ?? []).length;
      if (n > 0) found[rel(f)] = n;
    }
    const unlisted = Object.keys(found).filter((f) => PINNED_SITES[f] !== found[f]).map((f) => `${f}: ${found[f]}`);
    const gone = Object.keys(PINNED_SITES).filter((f) => found[f] === undefined);
    expect({ unlisted, gone }).toEqual({ unlisted: [], gone: [] });
  });

  it('11: WHEN `createStore(` is searched in src THEN it occurs in `1` file (src/core/store.ts), the file holds `applyMiddleware(mendMiddleware)` and `applyMiddleware(mendMiddleware, syncMiddleware)`, and the vendored data reducer\'s cases that assign a note (CREATE_NOTE_WITH_ID, EDIT_NOTE, IMPORT_NOTE_WITH_ID, RESTORE_NOTE_REVISION, NOTE_BUCKET_UPDATE, REMOTE_NOTE_UPDATE) equal that pinned list, so a new note-writing action type fails the guard until it is routed or listed as server-origin', () => {
    const withCreate = srcFiles().filter((f) => readFileSync(f, 'utf8').includes('createStore(')).map(rel);
    const store = readFileSync(join(SRC, 'core', 'store.ts'), 'utf8');
    expect({
      files: withCreate.length,
      which: withCreate,
      plain: store.includes('applyMiddleware(mendMiddleware)'),
      synced: store.includes('applyMiddleware(mendMiddleware, syncMiddleware)'),
      cases: noteAssigningCases(),
    }).toEqual({
      files: 1,
      which: ['src/core/store.ts'],
      plain: true,
      synced: true,
      cases: ['CREATE_NOTE_WITH_ID', 'EDIT_NOTE', 'IMPORT_NOTE_WITH_ID', 'NOTE_BUCKET_UPDATE', 'REMOTE_NOTE_UPDATE', 'RESTORE_NOTE_REVISION'],
    });
  });

  it('12: WHEN makeStore gets preloadedState holding note `o\uD800p` (no dispatch seeds it) and requeueUnsynced runs with no whenCaughtUp and a ghost with no data THEN the store and the dispatched IMPORT_NOTE_WITH_ID both hold `o�p` (acceptance 8 MUST use this seeding; seeding 8 or 12 through EDIT_NOTE, CREATE_NOTE_WITH_ID or IMPORT_NOTE_WITH_ID is not allowed)', async () => {
    const store = makeStore({ stubClient: {}, preloadedState: { data: { notes: new Map([[id, makeNote('n1', 'o\uD800p')]]) } } as never });
    const before = contentOf(store);
    const sent: string[] = [];
    const spy = { ...store, dispatch: (a: { type: string; note?: Note }) => { if (a.type === 'IMPORT_NOTE_WITH_ID') sent.push(String(a.note?.content)); return store.dispatch(a as never); } } as unknown as S;
    await requeueUnsynced(spy, { get: () => Promise.resolve({}) });
    expect({ before, store: contentOf(store), sent }).toEqual({ before: 'o\uD800p', store: 'o�p', sent: ['o�p'] });
  });

  it('13: WHEN a synced store restarts (buildStore, fake server on localhost, the 285 rig) on a state.json holding a note created offline with content `o\uD800p` and no ghost THEN no unhandled rejection occurs, pendingCount is `0`, and the server holds `o�p` (on the design as written the server holds `o\uD800p`)', async () => {
    process.on('unhandledRejection', onRejection);
    const server = await startServer();
    const dir = await syncedDir(server);
    const date = Date.now() / 1000;
    writeState(dir, { n9: { ...noteData('o\uD800p', date), creationDate: date, publishURL: '', shareURL: '' } });
    const b = openA(dir, server.url);
    await until(() => rejections.length === 0 && pending(b) === 0 && serverNote(server, 'n9')?.content === 'o�p', 12000);
    expect({ rejections: [...rejections], pending: pending(b), server: serverNote(server, 'n9')?.content }).toEqual({ rejections: [], pending: 0, server: 'o�p' });
  }, 30000);

  it('14: WHEN a synced store restarts (the 285 rig) on a state.json holding an unconfirmed edit `x\uDE00y` of a note whose ghost holds the server\'s earlier text, and PIN_NOTE is dispatched on that note at once, before the catch-up THEN no unhandled rejection occurs, pendingCount is `0`, and the server holds `x�y` (v2: one unhandled URIError)', async () => {
    process.on('unhandledRejection', onRejection);
    const server = await startServer();
    const dir = await syncedDir(server);
    const date = Date.now() / 1000;
    writeState(dir, { n1: { ...noteData('x\uDE00y', date), publishURL: '', shareURL: '' } });
    writeFileSync(join(dir, 'unsynced.json'), JSON.stringify({ n1: date }));
    const b = openA(dir, server.url);
    b.store.dispatch({ type: 'PIN_NOTE', noteId: id, shouldPin: true } as never);
    await until(() => rejections.length === 0 && pending(b) === 0 && serverNote(server)?.content === 'x�y', 12000);
    expect({ rejections: [...rejections], pending: pending(b), server: serverNote(server)?.content }).toEqual({ rejections: [], pending: 0, server: 'x�y' });
  }, 30000);

  it('15: WHEN the same restart gets EDIT_NOTE writing `z\nx\uDE00y` at once, before the catch-up THEN no unhandled rejection occurs and the store and the server hold `z\nx�y` (v2: one unhandled URIError)', async () => {
    process.on('unhandledRejection', onRejection);
    const server = await startServer();
    const dir = await syncedDir(server);
    const date = Date.now() / 1000;
    writeState(dir, { n1: { ...noteData('x\uDE00y', date), publishURL: '', shareURL: '' } });
    writeFileSync(join(dir, 'unsynced.json'), JSON.stringify({ n1: date }));
    const b = openA(dir, server.url);
    b.store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: 'z\nx\uDE00y' } } as never);
    await until(() => rejections.length === 0 && pending(b) === 0 && localNote(b)?.content === 'z\nx�y' && serverNote(server)?.content === 'z\nx�y', 12000);
    expect({ rejections: [...rejections], store: localNote(b)?.content, server: serverNote(server)?.content }).toEqual({ rejections: [], store: 'z\nx�y', server: 'z\nx�y' });
  }, 30000);

  it('16: WHEN a synced store restarts on a state.json holding an edit `x\uDE00y` dated after the server\'s copy and a ghosts-note.json that cannot be read THEN no unhandled rejection occurs, pendingCount is `0`, and the server holds `x�y` (this pins the first held re-send; RED on the base, GREEN with the seam alone, re-proved on a07619f4; GREEN on v2)', async () => {
    process.on('unhandledRejection', onRejection);
    const server = await startServer();
    const dir = await syncedDir(server);
    writeState(dir, { n1: { ...noteData('x\uDE00y', Date.now() / 1000), publishURL: '', shareURL: '' } });
    writeFileSync(join(dir, 'ghosts-note.json'), '{ not json');
    const b = openA(dir, server.url);
    await until(() => rejections.length === 0 && pending(b) === 0 && serverNote(server)?.content === 'x�y', 12000);
    expect({ rejections: [...rejections], pending: pending(b), server: serverNote(server)?.content }).toEqual({ rejections: [], pending: 0, server: 'x�y' });
  }, 30000);

  it('17: WHEN n1 is held at `line1\\nline2\\nOFF` for the start-up hand-off and the catch-up brings the server copy `line0\\uDE00\\nline1\\nline2` (a lone low half) THEN (pass-on-old: the text the seam gives that IMPORT on main) the state.json copy the network-change hook writes, the store after requeueUnsynced, and the IMPORT_NOTE_WITH_ID it dispatches all hold exactly the conflict block `line1\\nline2\\nOFF\\n\\n--- conflicting change from another device ---\\nline0\\uDE00\\nline1\\nline2` (the text of the other device kept as it is, no lone half in our part)', async () => {
    const store = makeStore({ stubClient: {} });
    let hook: ((noteId: string, data: object, base: object) => unknown) | null = null;
    (store as unknown as { client: unknown }).client = { buckets: [{ name: 'note', beforeNetworkChange: (fn: typeof hook) => (hook = fn) }] };
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: id, note: makeNote('n1', 'line1\nline2\nOFF', { modificationDate: 3000 }) } as never);
    const base = makeNote('n1', 'line1\nline2', { modificationDate: 2000 });
    const server = makeNote('n1', 'line0\uDE00\nline1\nline2', { modificationDate: 2500 });
    let caughtUp = false;
    const imported: string[] = [];
    const dispatch = store.dispatch;
    (store as unknown as { dispatch: typeof dispatch }).dispatch = ((a: { type: string; note?: { content?: string } }) => {
      if (a.type === 'IMPORT_NOTE_WITH_ID') imported.push(String(a.note?.content));
      return dispatch(a as never);
    }) as typeof dispatch;
    const saved: string[] = [];
    const whenCaughtUp = async (): Promise<void> => {
      hook?.('n1', server, base);
      store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: id, note: server } as never);
      caughtUp = true;
    };
    const ghosts: GhostReader = { get: () => Promise.resolve({ data: caughtUp ? server : base }) };
    await requeueUnsynced(store as never, ghosts, whenCaughtUp, {}, undefined, (s) => saved.push(String(s.data.notes.get(id)?.content)));
    const block = 'line1\nline2\nOFF\n\n--- conflicting change from another device ---\nline0\uDE00\nline1\nline2';
    expect({ saved, store: contentOf(store), imported }).toEqual({ saved: [block], store: block, imported: [block] });
  });

  it("18: WHEN src/core/requeue.ts is searched for `type: 'REMOTE_NOTE_UPDATE'` THEN it is found `2` times (the #333 mend of a held copy and the #657b hand-off hook), and each site has `mendOwn(` or `mendWrite(` in the 3 lines before it", () => {
    const lines = readFileSync(join(SRC, 'core', 'requeue.ts'), 'utf8').split('\n');
    const sites = lines.map((line, i) => (line.includes("type: 'REMOTE_NOTE_UPDATE'") ? i : -1)).filter((i) => i >= 0);
    const mended = sites.map((i) => lines.slice(Math.max(0, i - 3), i).some((l) => /mendOwn\(|mendWrite\(/.test(l)));
    expect({ sites: sites.length, mended }).toEqual({ sites: 2, mended: [true, true] });
  });
});
