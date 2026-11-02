/**
 * #97 (slice 97h,): the external editor writes the same text again while it
 * is still open (an identical `:w` after a saved write), and snote stops (killed,
 * or quit) before the editor closes. The next start (state.json and the drafts
 * folder as the stop left them, then recoverDrafts) holds one note with that text,
 * also when the write merged another device's change, and a draft whose text the
 * note does not hold yet is never dropped. The stop is taken as a copy of both
 * folders (file times kept), as in 97e and 97g.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cpSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { editInEditor, expectNote } from '../../src/core/editor';
import { draftsDir, recoverDrafts, setDraftsDir } from '../../src/core/editor-drafts';
import { loadState, persistOnChange, saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import { stepEditor, type StepEditor } from '../helpers/step-editor';
import type { State } from '../../src/core/store';
import type { EntityId } from '@vendor/types';

// Counts the draft reads of the watcher: a read after the identical `:w` shows that its settle has run.
const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/core/editor-drafts', async (orig) => {
  const m = await orig<typeof import('../../src/core/editor-drafts')>();
  return { ...m, readDraft: (...a: Parameters<typeof m.readDraft>) => (reads.n++, m.readDraft(...a)) };
});

const eid = (id: string): EntityId => id as unknown as EntityId;
const quiet = { pause: () => undefined, resume: () => undefined };
const LOCAL = 'LOCAL LINE\ntitle line\nmiddle line\nlast line';
const BASE = 'title line\nmiddle line\nlast line';
let ed: StepEditor | undefined;
let handedBack: () => boolean = () => true;
let stopSave: (() => void) | undefined;
let account = '';
beforeEach(() => {
  account = mkdtempSync(join(tmpdir(), 'editor-write-rewrite-'));
  setDraftsDir(join(account, 'drafts'));
});
afterEach(async () => {
  if (ed && !ed.exited()) ed.quit(0);
  await expect.poll(handedBack, { timeout: 2000 }).toBe(true);
  ed?.remove();
  ed = undefined;
  stopSave?.();
  stopSave = undefined;
  rmSync(account, { recursive: true, force: true });
  setDraftsDir(null);
});

/** The one draft folder of the session and its .md file. */
function session(): { folder: string; md: string } {
  const folder = join(draftsDir(), readdirSync(draftsDir()).find((n) => n.startsWith('snote-'))!);
  return { folder, md: join(folder, readdirSync(folder).find((n) => n.endsWith('.md'))!) };
}
/** True while source.json still has the file time the last saved write gave it: the draft's less 1.5 s (97e). */
const stamped = (): boolean => {
  if (!existsSync(draftsDir()) || !readdirSync(draftsDir()).some((n) => n.startsWith('snote-'))) return false;
  const s = session();
  return Math.abs(lstatSync(s.md).mtimeMs - lstatSync(join(s.folder, 'source.json')).mtimeMs - 1500) < 2;
};

/**
 * Note n1 (`initial`) in a saved store, opened in the step editor, which writes `text` (step 1). Resolves once
 * state.json holds `text` (`onDisk`), or once the store holds it before any save (`onDisk` false, a save 1.5 s away).
 * With `remote`, another device's change `remote` reaches the note before the write.
 */
async function writeFirst(text: string, o: { initial?: string; remote?: string; onDisk?: boolean } = {}): Promise<string> {
  const { initial = 'old note', remote, onDisk = true } = o;
  const dataDir = join(account, 'data');
  ed = stepEditor('vi');
  const bin = ed.bin;
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: initial, systemTags: [], tags: [] } } as never);
  if (remote === undefined) saveState(store.getState(), dataDir);
  stopSave = persistOnChange(store, dataDir, onDisk ? 20 : 1500);
  let raw = true;
  handedBack = () => raw;
  editSelectedNote({
    store,
    selectedEntry: { id: eid('n1'), note: store.getState().data.notes.get(eid('n1'))! },
    setRawMode: (m) => (raw = m),
    runEditor: (initial, opts) => editInEditor(initial, { editor: bin, stdin: quiet, ...opts }),
  });
  if (remote !== undefined) store.dispatch({ type: 'EDIT_NOTE', noteId: eid('n1'), changes: { content: remote } } as never);
  ed.write(text);
  const state = join(dataDir, 'state.json');
  const saved = (): boolean => existsSync(state) && readFileSync(state, 'utf8').includes(remote === undefined ? text : 'REMOTE LINE') && readFileSync(state, 'utf8').includes('LOCAL LINE') === text.includes('LOCAL LINE');
  if (onDisk) await expect.poll(() => ({ saved: saved(), stamped: stamped() }), { timeout: 2000 }).toEqual({ saved: true, stamped: true });
  else await expect.poll(() => ({ held: store.getState().data.notes.get(eid('n1'))?.content, saved: saved() }), { timeout: 1000 }).toEqual({ held: text, saved: false });
  return dataDir;
}

/** The editor writes `text` (step 2), then closes at once (step 3), as vim `:wq` does; resolves once it has handed the terminal back. */
async function writeAndClose(text: string): Promise<void> {
  ed!.write(text);
  await expect.poll(() => ed!.done(2), { timeout: 2000 }).toBe(true);
  ed!.quit(0);
  await expect.poll(handedBack, { timeout: 2000 }).toBe(true);
}

/** The stop: copy the data and drafts folders as they are now, then start from the copy and recover. */
function stopAndRestart(dataDir: string): { notes: Record<string, string>; folders: number } {
  const snap = mkdtempSync(join(account, 'stop-'));
  cpSync(dataDir, join(snap, 'data'), { recursive: true, preserveTimestamps: true });
  cpSync(draftsDir(), join(snap, 'drafts'), { recursive: true, preserveTimestamps: true });
  const next = makeStore({ stubClient: {}, preloadedState: loadState(join(snap, 'data')) as Partial<State> });
  recoverDrafts(next, join(snap, 'drafts'));
  const notes = Object.fromEntries([...next.getState().data.notes.entries()].map(([id, n]) => [id, n.content ?? '']));
  return { notes, folders: readdirSync(join(snap, 'drafts')).filter((n) => n.startsWith('snote-')).length };
}

/** A store whose dispatch throws once on demand: `pre` before the reducer, `post` after it (the note then holds the text). */
function faultyStore(dataDir: string): { real: ReturnType<typeof makeStore>; wrapped: ReturnType<typeof makeStore>; ctl: { fail: null | 'pre' | 'post'; threw: number } } {
  const real = makeStore({ stubClient: {} });
  real.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: 'old note', systemTags: [], tags: [] } } as never);
  saveState(real.getState(), dataDir);
  const ctl = { fail: null as null | 'pre' | 'post', threw: 0 };
  const wrapped = Object.create(real) as typeof real;
  (wrapped as { dispatch: unknown }).dispatch = (a: never) => {
    const f = ctl.fail;
    if (f === 'pre') {
      ctl.fail = null;
      ctl.threw++;
      throw new Error('pre');
    }
    const r = real.dispatch(a);
    if (f === 'post') {
      ctl.fail = null;
      ctl.threw++;
      throw new Error('post');
    }
    return r;
  };
  return { real, wrapped, ctl };
}

/** The editor writes `text` again (step 2) while it stays open; resolves once the watcher has settled on that write. */
async function rewriteOpen(text: string): Promise<void> {
  const before = reads.n;
  ed!.write(text);
  await expect.poll(() => ed!.done(2) && reads.n > before, { timeout: 2000 }).toBe(true);
}

describe('#97 an identical :w while the editor stays open, then a stop', () => {
  it('1: WHEN a remote change added `REMOTE LINE` to the note while the editor was open, the editor wrote `LOCAL LINE` above the original text, state.json held both, the editor then wrote the same text again and stayed open and snote stopped THEN the next start holds only note `n1`, with both `REMOTE LINE` and `LOCAL LINE`, and `0` draft folders', async () => {
    const dataDir = await writeFirst(LOCAL, { initial: BASE, remote: BASE + '\nREMOTE LINE' });
    await rewriteOpen(LOCAL);
    const next = stopAndRestart(dataDir);
    expect({ ids: Object.keys(next.notes), local: next.notes.n1?.includes('LOCAL LINE'), remote: next.notes.n1?.includes('REMOTE LINE'), folders: next.folders })
      .toEqual({ ids: ['n1'], local: true, remote: true, folders: 0 });
  });

  it('2: (pass-on-old) WHEN no remote change came, the editor wrote `plain write`, state.json held it, the editor then wrote the same text again and stayed open and snote stopped THEN the next start holds only note `n1` with `plain write` and `0` draft folders', async () => {
    const dataDir = await writeFirst('plain write');
    await rewriteOpen('plain write');
    expect(stopAndRestart(dataDir)).toEqual({ notes: { n1: 'plain write' }, folders: 0 });
  });

  it('3: (pass-on-old) WHEN the hand-on of `unsaved write` threw (the text reached the draft but no note), the editor wrote the same text again and stayed open and snote stopped THEN the next start holds a note with `unsaved write` (the draft is not dropped)', async () => {
    ed = stepEditor('vi');
    expectNote('n1');
    const seen: string[] = [];
    const closed = editInEditor('old note', { editor: ed.bin, stdin: quiet, onWrite: (t) => { seen.push(t); throw new Error('dispatch failed'); } });
    ed.write('unsaved write');
    await expect.poll(() => seen.includes('unsaved write'), { timeout: 2000 }).toBe(true);
    await rewriteOpen('unsaved write');
    const snap = mkdtempSync(join(account, 'stop-'));
    cpSync(draftsDir(), join(snap, 'drafts'), { recursive: true, preserveTimestamps: true });
    ed.quit(0);
    await closed;
    const next = makeStore({ stubClient: {} });
    next.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: 'old note', systemTags: [], tags: [] } } as never);
    recoverDrafts(next, join(snap, 'drafts'));
    const all = [...next.getState().data.notes.values()].map((n) => n.content ?? '');
    expect(all.some((c) => c.includes('unsaved write'))).toBe(true);
  });

  it('4: (pass-on-old) WHEN `before save` was handed to the note but state.json still holds `old note`, the editor wrote the same text again and stayed open and snote stopped THEN the next start holds only note `n1`, with `before save` (the draft is not dropped)', async () => {
    const dataDir = await writeFirst('before save', { onDisk: false });
    await rewriteOpen('before save');
    expect(stopAndRestart(dataDir).notes).toEqual({ n1: 'before save' });
  });

  it('5: (pass-on-old) WHEN `first write` was saved and the editor wrote the same text again, then wrote `second write` that no save followed, and snote stopped THEN the next start holds only note `n1`, with `second write`', async () => {
    const dataDir = await writeFirst('first write');
    await rewriteOpen('first write');
    stopSave?.(); // nothing is saved after the second write
    stopSave = undefined;
    ed!.write('second write', 'inplace');
    await expect.poll(() => ed!.done(3), { timeout: 2000 }).toBe(true);
    expect(stopAndRestart(dataDir).notes).toEqual({ n1: 'second write' });
  });

  it('6: WHEN `AAA text` was saved and stamped, then `BEE text` was written and its dispatch threw after the reducer (the note and state.json hold `BEE text`), then `AAA text` was written and its hand-on threw before the reducer, then `AAA text` was written again and the editor stayed open and snote stopped THEN the next start holds a note with `BEE text` and a note with `AAA text` (no write is lost;)', async () => {
    const dataDir = join(account, 'data');
    const { real, wrapped, ctl } = faultyStore(dataDir);
    stopSave = persistOnChange(real, dataDir, 20);
    ed = stepEditor('vi');
    const bin = ed.bin;
    let raw = true;
    handedBack = () => raw;
    editSelectedNote({
      store: wrapped,
      selectedEntry: { id: eid('n1'), note: real.getState().data.notes.get(eid('n1'))! },
      setRawMode: (m) => (raw = m),
      runEditor: (initial, opts) => editInEditor(initial, { editor: bin, stdin: quiet, ...opts }),
    });
    const state = join(dataDir, 'state.json');
    const onDisk = (s: string): boolean => readFileSync(state, 'utf8').includes(s);
    ed.write('AAA text');
    await expect.poll(() => stamped() && onDisk('AAA text'), { timeout: 2000 }).toBe(true);
    ctl.fail = 'post';
    let before = reads.n;
    ed.write('BEE text');
    await expect.poll(() => ed!.done(2) && reads.n > before && ctl.threw === 1, { timeout: 2000 }).toBe(true);
    await expect.poll(() => onDisk('BEE text'), { timeout: 2000 }).toBe(true);
    ctl.fail = 'pre';
    before = reads.n;
    ed.write('AAA text');
    await expect.poll(() => ed!.done(3) && reads.n > before && ctl.threw === 2, { timeout: 2000 }).toBe(true);
    before = reads.n;
    ed.write('AAA text');
    await expect.poll(() => ed!.done(4) && reads.n > before, { timeout: 2000 }).toBe(true);
    const all = Object.values(stopAndRestart(dataDir).notes);
    expect({ bee: all.some((c) => c.includes('BEE text')), aaa: all.some((c) => c.includes('AAA text')) }).toEqual({ bee: true, aaa: true });
  });
});
