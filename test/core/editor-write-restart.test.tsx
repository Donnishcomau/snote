/**
 * #97 (slice 97e): snote killed while the external editor is open, after a
 * write. The next start (state.json and the drafts folder as the kill left
 * them, then recoverDrafts) holds the written text in the same note and no
 * second note from the draft, also when a write merged another device's change
 * (97b probe P2). The kill is taken as a copy of both folders (file times kept).
 * Line 6 (#439): the writer's base moves only once the dispatch went through.
 * Line 7: a draft written after a failed sidecar rewrite is never removed.
 * Line 8 (SP97E3-01): a change made in snote and not yet saved is never removed with the draft opened on it.
 * Line 9 (, #456 verdict): the editor closes after a write that merged a remote change and snote stops at once: one note.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { editInEditor } from '../../src/core/editor';
import { draftsDir, recoverDrafts, setDraftsDir } from '../../src/core/editor-drafts';
import { noteWriter } from '../../src/core/held-lines';
import { afterSaveCount, loadState, persistOnChange, saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import { stepEditor, type StepEditor } from '../helpers/step-editor';
import type { State } from '../../src/core/store';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const quiet = { pause: () => undefined, resume: () => undefined };
let ed: StepEditor | undefined;
let handedBack: () => boolean = () => true;
let stopSave: (() => void) | undefined;
let account = '';
let lastStore: ReturnType<typeof makeStore> | undefined;
beforeEach(() => {
  account = mkdtempSync(join(tmpdir(), 'editor-write-restart-'));
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

/**
 * A saved store with note n1 (`old note`), opened in the step editor, that writes `text`. Resolves once
 * `text` is in state.json, or (`saveDelayMs` long, `onDisk` false) once the store holds it but before any save.
 */
async function writeAndSave(text: string, saveDelayMs = 20, onDisk = true, initial = 'old note', remote?: string, dataDir = join(account, 'data')): Promise<string> {
  ed = stepEditor('vi');
  const bin = ed.bin;
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: initial, systemTags: [], tags: [] } } as never);
  if (remote === undefined) {
    try {
      saveState(store.getState(), dataDir); // the start: state.json holds `old note`
    } catch {
      // test 5: the data folder is blocked on purpose, so every save fails
    }
  }
  stopSave = persistOnChange(store, dataDir, saveDelayMs);
  let raw = true;
  handedBack = () => raw;
  editSelectedNote({
    store,
    selectedEntry: { id: eid('n1'), note: store.getState().data.notes.get(eid('n1'))! },
    setRawMode: (m) => (raw = m),
    runEditor: (initial, o) => editInEditor(initial, { editor: bin, stdin: quiet, ...o }),
  });
  if (remote !== undefined) store.dispatch({ type: 'EDIT_NOTE', noteId: eid('n1'), changes: { content: remote } } as never); // another device's change
  ed.write(text);
  lastStore = store;
  const state = join(dataDir, 'state.json');
  const saved = (): boolean => existsSync(state) && readFileSync(state, 'utf8').includes(remote === undefined ? text : 'REMOTE LINE') && readFileSync(state, 'utf8').includes('LOCAL LINE') === text.includes('LOCAL LINE');
  if (onDisk) await expect.poll(saved, { timeout: 2000 }).toBe(true);
  else await expect.poll(() => ({ held: store.getState().data.notes.get(eid('n1'))?.content, saved: saved() }), { timeout: 1000 }).toEqual({ held: text, saved: false });
  return dataDir;
}

/** The kill: copy the data and drafts folders as they are now; `draft` (when given) is what the editor wrote after the last save. */
function killAndRestart(dataDir: string, draft?: string): { notes: Record<string, string>; folders: number } {
  const snap = mkdtempSync(join(account, 'kill-'));
  cpSync(dataDir, join(snap, 'data'), { recursive: true, preserveTimestamps: true });
  cpSync(draftsDir(), join(snap, 'drafts'), { recursive: true, preserveTimestamps: true });
  const folder = readdirSync(join(snap, 'drafts')).find((n) => n.startsWith('snote-'))!;
  const md = readdirSync(join(snap, 'drafts', folder)).find((n) => n.endsWith('.md'))!;
  if (draft !== undefined) writeFileSync(join(snap, 'drafts', folder, md), draft);
  const next = makeStore({ stubClient: {}, preloadedState: loadState(join(snap, 'data')) as Partial<State> });
  recoverDrafts(next, join(snap, 'drafts'));
  const notes = Object.fromEntries([...next.getState().data.notes.entries()].map(([id, n]) => [id, n.content ?? '']));
  return { notes, folders: readdirSync(join(snap, 'drafts')).filter((n) => n.startsWith('snote-')).length };
}

describe('#97 97e snote killed while the editor is open after a write', () => {
  it('1: (pass-on-old) WHEN snote is killed after `written once` was written and saved THEN the next start holds only note `n1` with `written once` and `0` draft folders', async () => {
    const dataDir = await writeAndSave('written once');
    expect(killAndRestart(dataDir)).toEqual({ notes: { n1: 'written once' }, folders: 0 });
  });

  it('2: WHEN snote is killed after `first write` was saved and the draft then holds `second write` that was never handed on THEN the next start holds only note `n1`, with `second write`', async () => {
    const dataDir = await writeAndSave('first write');
    expect(killAndRestart(dataDir, 'second write').notes).toEqual({ n1: 'second write' });
  });

  it('3: (pass-on-old) WHEN snote is killed after `before save` was handed to the note but before any save (state.json still holds `old note`) THEN the next start holds only note `n1`, with `before save`', async () => {
    const dataDir = await writeAndSave('before save', 1500, false);
    expect(killAndRestart(dataDir).notes).toEqual({ n1: 'before save' });
  });

  it('4: WHEN a remote change added `REMOTE LINE` to the note while the editor was open, the editor then wrote `LOCAL LINE` above the original text, state.json held both and snote was killed THEN the next start holds only note `n1`, with both `REMOTE LINE` and `LOCAL LINE`, and `0` draft folders', async () => {
    const dataDir = await writeAndSave('LOCAL LINE\ntitle line\nmiddle line\nlast line', 20, true, 'title line\nmiddle line\nlast line', 'title line\nmiddle line\nlast line\nREMOTE LINE');
    const next = killAndRestart(dataDir);
    expect({ ids: Object.keys(next.notes), local: next.notes.n1?.includes('LOCAL LINE'), remote: next.notes.n1?.includes('REMOTE LINE'), folders: next.folders })
      .toEqual({ ids: ['n1'], local: true, remote: true, folders: 0 });
  });

  it('5: WHEN every save fails and the editor writes `w1`, `w2` and `w3` THEN the note holds `w3` and `1` save callback waits (one per editor session)', async () => {
    const blocked = join(account, 'not-a-folder');
    writeFileSync(blocked, 'a file where the data folder should be');
    const before = afterSaveCount(); // earlier sessions of this file may have left callbacks waiting
    await writeAndSave('w1', 20, false, 'old note', undefined, blocked);
    const store = lastStore!;
    ed!.write('w2');
    await expect.poll(() => store.getState().data.notes.get(eid('n1'))?.content, { timeout: 2000 }).toBe('w2');
    ed!.write('w3');
    await expect.poll(() => ({ text: store.getState().data.notes.get(eid('n1'))?.content, waiting: afterSaveCount() - before }), { timeout: 2000 })
      .toEqual({ text: 'w3', waiting: 1 });
  });

  it('6: WHEN the store\'s dispatch throws on the write of `lost write` THEN base() still holds `old note`, and once the write of `next write` goes through base() holds `next write`', () => {
    let fail = true;
    const notes = new Map([[eid('n1'), { content: 'old note' }]]);
    const store = {
      getState: () => ({ data: { notes } }),
      dispatch: (): unknown => {
        if (fail) throw new Error('dispatch failed');
        return undefined;
      },
    };
    const w = noteWriter(store, eid('n1'), 'old note');
    expect(() => w.write('lost write')).toThrow('dispatch failed');
    const afterThrow = w.base();
    fail = false;
    w.write('next write');
    expect({ afterThrow, after: w.base() }).toEqual({ afterThrow: 'old note', after: 'next write' });
  });

  it('7: (pass-on-old) WHEN the sidecar rewrite after the saved write `changed` fails and the draft is then written back to `old note` THEN the next start holds a note with `old note` and note `n1` with `changed` (no draft text is lost)', async () => {
    const saved = writeAndSave('changed');
    // the rewrite fails: a folder where secureWriteFileSync puts its tmp file (a security review probe)
    await expect.poll(() => existsSync(draftsDir()) && readdirSync(draftsDir()).some((n) => n.startsWith('snote-')), { timeout: 2000 }).toBe(true);
    mkdirSync(join(draftsDir(), readdirSync(draftsDir()).find((n) => n.startsWith('snote-'))!, 'source.json.tmp'));
    const next = killAndRestart(await saved, 'old note');
    expect({ n1: next.notes.n1, others: Object.entries(next.notes).filter(([id]) => id !== 'n1').map(([, t]) => t) })
      .toEqual({ n1: 'changed', others: ['old note'] });
  });

  it('8: (pass-on-old) WHEN a change to `toggled` made in snote is not yet saved, the editor is opened on it and snote is killed before any save or write THEN the next start holds note `n1` with `old note` and a note with `toggled` (the change is not lost)', async () => {
    ed = stepEditor('vi');
    const bin = ed.bin;
    const dataDir = join(account, 'data');
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: 'old note', systemTags: [], tags: [] } } as never);
    saveState(store.getState(), dataDir);
    stopSave = persistOnChange(store, dataDir, 2500); // the save of the change is still waiting at the kill
    store.dispatch({ type: 'EDIT_NOTE', noteId: eid('n1'), changes: { content: 'toggled' } } as never); // a change made in snote (the `c` checklist toggle)
    let raw = true;
    handedBack = () => raw;
    editSelectedNote({
      store,
      selectedEntry: { id: eid('n1'), note: store.getState().data.notes.get(eid('n1'))! },
      setRawMode: (m) => (raw = m),
      runEditor: (initial, o) => editInEditor(initial, { editor: bin, stdin: quiet, ...o }),
    });
    await expect.poll(() => existsSync(draftsDir()) && readdirSync(draftsDir()).some((n) => existsSync(join(draftsDir(), n, 'source.json'))), { timeout: 2000 }).toBe(true);
    const next = killAndRestart(dataDir);
    expect({ n1: next.notes.n1, others: Object.entries(next.notes).filter(([id]) => id !== 'n1').map(([, t]) => t) })
      .toEqual({ n1: 'old note', others: ['toggled'] });
  });

  it('9: WHEN a remote change added `REMOTE LINE` to the note while the editor was open, the editor wrote `LOCAL LINE` above the original text, state.json held both, the editor then closed and snote stopped at once THEN the next start holds only note `n1`, with both `REMOTE LINE` and `LOCAL LINE`, and `0` draft folders', async () => {
    const dataDir = await writeAndSave('LOCAL LINE\ntitle line\nmiddle line\nlast line', 20, true, 'title line\nmiddle line\nlast line', 'title line\nmiddle line\nlast line\nREMOTE LINE');
    ed!.quit(0); // the editor closes after the write; the close path of 97d skips its second EDIT_NOTE, so the draft is not released
    await expect.poll(() => handedBack() && existsSync(draftsDir()) && readdirSync(draftsDir()).filter((n) => n.startsWith('snote-')).length === 1, { timeout: 2000 }).toBe(true);
    const next = killAndRestart(dataDir);
    expect({ ids: Object.keys(next.notes), local: next.notes.n1?.includes('LOCAL LINE'), remote: next.notes.n1?.includes('REMOTE LINE'), folders: next.folders })
      .toEqual({ ids: ['n1'], local: true, remote: true, folders: 0 });
  });
});
