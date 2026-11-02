/**
 * #97 (slice 97g,): the external editor closes on an identical rewrite of
 * the text a write already handed to the note (vim `:wq` after `:w`) and snote
 * stops at once. The next start (state.json and the drafts folder as the stop
 * left them, then recoverDrafts) holds one note with that text, also when the
 * write merged another device's change, and a draft whose text the note does
 * not hold yet is never dropped. The stop is taken as a copy of both folders
 * (file times kept), as in 97e.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
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

describe('#97 97g an identical rewrite when the editor closes', () => {
  it('1: WHEN a remote change added `REMOTE LINE` to the note while the editor was open, the editor wrote `LOCAL LINE` above the original text, state.json held both, the editor then rewrote the same text and closed at once and snote stopped THEN the next start holds only note `n1`, with both `REMOTE LINE` and `LOCAL LINE`, and `0` draft folders', async () => {
    const dataDir = await writeFirst(LOCAL, { initial: BASE, remote: BASE + '\nREMOTE LINE' });
    ed!.write(LOCAL); // the same text again
    await expect.poll(() => ed!.done(2), { timeout: 2000 }).toBe(true);
    expect(stamped()).toBe(false); // the rewrite moved the draft's file time away from the one source.json took
    ed!.quit(0);
    await expect.poll(handedBack, { timeout: 2000 }).toBe(true);
    const next = stopAndRestart(dataDir);
    expect({ ids: Object.keys(next.notes), local: next.notes.n1?.includes('LOCAL LINE'), remote: next.notes.n1?.includes('REMOTE LINE'), folders: next.folders })
      .toEqual({ ids: ['n1'], local: true, remote: true, folders: 0 });
  });

  it('2: (pass-on-old) WHEN no remote change came, the editor wrote `plain write`, state.json held it, the editor then rewrote the same text and closed at once and snote stopped THEN the next start holds only note `n1` with `plain write` and `0` draft folders', async () => {
    const dataDir = await writeFirst('plain write');
    await writeAndClose('plain write');
    expect(stopAndRestart(dataDir)).toEqual({ notes: { n1: 'plain write' }, folders: 0 });
  });

  it('3: (pass-on-old) WHEN `before save` was handed to the note but state.json still holds `old note`, the editor rewrote the same text and closed at once and snote stopped THEN the next start holds only note `n1`, with `before save` (the draft is not dropped)', async () => {
    const dataDir = await writeFirst('before save', { onDisk: false });
    await writeAndClose('before save');
    expect(stopAndRestart(dataDir).notes).toEqual({ n1: 'before save' });
  });

  it('4: (pass-on-old) WHEN `first write` was saved, no save follows, the editor then wrote `second write` that was never handed on, closed at once and snote stopped THEN the next start holds only note `n1`, with `second write`', async () => {
    const dataDir = await writeFirst('first write');
    stopSave?.(); // nothing is saved after the first write: the stop comes before the close is saved
    stopSave = undefined;
    await writeAndClose('second write');
    expect(stopAndRestart(dataDir).notes).toEqual({ n1: 'second write' });
  });

  it('5: (pass-on-old) WHEN the hand-on of `unsaved write` threw (the text reached the draft but no note), the editor rewrote the same text and closed at once and snote stopped THEN the next start holds a note with `unsaved write` (the draft is not dropped)', async () => {
    ed = stepEditor('vi');
    const seen: string[] = [];
    expectNote('n1');
    const closed = editInEditor('old note', { editor: ed.bin, stdin: quiet, onWrite: (t) => { seen.push(t); throw new Error('dispatch failed'); } });
    ed.write('unsaved write');
    await expect.poll(() => seen.includes('unsaved write'), { timeout: 2000 }).toBe(true);
    ed.write('unsaved write'); // the same text again, as :wq does
    await expect.poll(() => ed!.done(2), { timeout: 2000 }).toBe(true);
    ed.quit(0);
    expect(await closed).toBe('unsaved write');
    const snap = mkdtempSync(join(account, 'stop-'));
    cpSync(draftsDir(), join(snap, 'drafts'), { recursive: true, preserveTimestamps: true });
    const next = makeStore({ stubClient: {} });
    next.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: 'old note', systemTags: [], tags: [] } } as never);
    recoverDrafts(next, join(snap, 'drafts'));
    const all = [...next.getState().data.notes.values()].map((n) => n.content ?? '');
    expect(all.some((c) => c.includes('unsaved write'))).toBe(true);
  });
});
