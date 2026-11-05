/**
 * #618: a NEW note (`n`) in the external editor: the first write (`:w`)
 * creates the note while the editor is open, later writes edit it (#97), and
 * the close adds no second note (`:wq` after `:w`, or `:q!` after `:w`).
 * A kill after the write and its save leaves one note and no draft folder.
 * A first write whose create throws after the
 * reducer applied it still edits that note afterwards (merge, no replace);
 * rev3: one that throws before the reducer leaves no note, the editor open,
 * and the next write creates the note once (the watcher skips a throw).
 * Rev2: a new note emptied before the close goes to the trash with
 * a notice (PM, option b); a close whose merge kept both versions shows the
 * same notice editSelectedNote shows.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { editInEditor } from '../../src/core/editor';
import { draftsDir, recoverDrafts, setDraftsDir } from '../../src/core/editor-drafts';
import { loadState, persistOnChange } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { createNote } from '../../src/tui/app-actions';
import { stepEditor, type StepEditor } from '../helpers/step-editor';
import type { State } from '../../src/core/store';

const quiet = { pause: () => undefined, resume: () => undefined };
let ed: StepEditor | undefined;
let raw = true;
let stopSave: (() => void) | undefined;
let account = '';
beforeEach(() => {
  account = mkdtempSync(join(tmpdir(), 'new-note-write-'));
  setDraftsDir(join(account, 'drafts'));
  raw = true;
});
afterEach(async () => {
  if (ed && !ed.exited()) ed.quit(0);
  await expect.poll(() => raw, { timeout: 2000 }).toBe(true);
  ed?.remove();
  ed = undefined;
  stopSave?.();
  stopSave = undefined;
  rmSync(account, { recursive: true, force: true });
  setDraftsDir(null);
});

const contents = (store: ReturnType<typeof makeStore>): string[] => [...store.getState().data.notes.values()].map((n) => n.content ?? '');

const errors: string[] = [];
function start() {
  errors.length = 0;
  ed = stepEditor('vi');
  const bin = ed.bin;
  const store = makeStore({ stubClient: {} });
  const dataDir = join(account, 'data');
  stopSave = persistOnChange(store, dataDir, 20);
  createNote({ store, setRawMode: (m) => (raw = m), setSelectedIndex: () => undefined, onEditorError: (m) => errors.push(m), runEditor: (initial) => editInEditor(initial, { editor: bin, stdin: quiet }) });
  return { store, dataDir, ed: ed! };
}

describe('#618 a new note saves on each write while the editor is open', () => {
  it('1: WHEN a new note gets the write `first` and the editor is still open THEN the store holds exactly one note, `first`; WHEN `second` is written THEN still one note, `second`', async () => {
    const s = start();
    s.ed.write('first');
    await expect.poll(() => contents(s.store), { timeout: 2000 }).toEqual(['first']);
    s.ed.write('second');
    await expect.poll(() => contents(s.store), { timeout: 2000 }).toEqual(['second']);
    expect(s.ed.exited()).toBe(false);
  });

  it('2: WHEN a new note gets the write `typed` and then the editor quits (as `:wq` and as `:q!` do, the file holding `typed`) THEN the store holds exactly one note, `typed`', async () => {
    const s = start();
    s.ed.write('typed');
    await expect.poll(() => contents(s.store), { timeout: 2000 }).toEqual(['typed']);
    s.ed.quit(0);
    await expect.poll(() => raw, { timeout: 2000 }).toBe(true);
    expect(contents(s.store)).toEqual(['typed']);
  });

  it('3: WHEN a new note gets `typed`, then the close brings `typed more` THEN the store holds exactly one note, `typed more`', async () => {
    const s = start();
    s.ed.write('typed');
    await expect.poll(() => contents(s.store), { timeout: 2000 }).toEqual(['typed']);
    s.ed.write('typed more');
    s.ed.quit(0);
    await expect.poll(() => ({ raw, notes: contents(s.store) }), { timeout: 2000 }).toEqual({ raw: true, notes: ['typed more'] });
  });

  it('4: WHEN snote is killed after a new note`s write `kept` was saved (state.json holds it) THEN the draft folder names the note (source.json) and the next start holds exactly one note, `kept`, and 0 draft folders', async () => {
    const s = start();
    const state = join(s.dataDir, 'state.json');
    s.ed.write('kept');
    await expect.poll(() => existsSync(state) && readFileSync(state, 'utf8').includes('kept'), { timeout: 2000 }).toBe(true);
    await expect.poll(() => readdirSync(join(draftsDir(), readdirSync(draftsDir())[0])).includes('source.json'), { timeout: 2000 }).toBe(true);
    const snap = mkdtempSync(join(account, 'kill-'));
    cpSync(s.dataDir, join(snap, 'data'), { recursive: true, preserveTimestamps: true });
    cpSync(draftsDir(), join(snap, 'drafts'), { recursive: true, preserveTimestamps: true });
    const next = makeStore({ stubClient: {}, preloadedState: loadState(join(snap, 'data')) as Partial<State> });
    recoverDrafts(next, join(snap, 'drafts'));
    expect(contents(next)).toEqual(['kept']);
    expect(readdirSync(join(snap, 'drafts')).filter((n) => n.startsWith('snote-'))).toEqual([]);
  });

  it('5: WHEN a new note`s first write `first` makes a store subscriber throw once after the reducer applied it, another change then sets the note to `first\nremote` and the editor writes `first\nlocal` THEN the store holds exactly one note and it contains both `remote` and `local`', async () => {
    const s = start();
    let thrown = false;
    const off = s.store.subscribe(() => {
      if (!thrown && s.store.getState().data.notes.size === 1) {
        thrown = true;
        throw new Error('subscriber failed once');
      }
    });
    s.ed.write('first');
    await expect.poll(() => ({ thrown, notes: contents(s.store) }), { timeout: 2000 }).toEqual({ thrown: true, notes: ['first'] });
    off();
    const id = [...s.store.getState().data.notes.keys()][0];
    s.store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: 'first\nremote' } } as never);
    s.ed.write('first\nlocal');
    await expect.poll(() => { const c = contents(s.store); return c.length === 1 && c[0].includes('remote') && c[0].includes('local'); }, { timeout: 2000 }).toBe(true);
  });

  it('6: (rev2; rev3 title) WHEN a new note gets the write `x`, then the empty write ``, and the editor quits with no further write (`:q!` after an emptying `:w`, and `:wq`, which writes the same empty file) THEN the store holds one note, trashed (deleted true), and the notice `Empty note moved to trash` is shown once', async () => {
    const s = start();
    s.ed.write('x');
    await expect.poll(() => contents(s.store), { timeout: 2000 }).toEqual(['x']);
    s.ed.write('');
    s.ed.quit(0);
    await expect.poll(() => ({ raw, deleted: [...s.store.getState().data.notes.values()].map((n) => n.deleted), errors: [...errors] }), { timeout: 2000 })
      .toEqual({ raw: true, deleted: [true], errors: ['Empty note moved to trash'] });
  });

  it('7: (rev2) WHEN a new note gets `title line\nmiddle line\nlast line`, another device sets `REMOTE middle` and the editor writes `LOCAL middle` on the same line, then quits THEN the store holds one note with both and the notice `A change from another device could not be merged automatically - both versions were kept.` is shown once', async () => {
    const s = start();
    s.ed.write('title line\nmiddle line\nlast line');
    await expect.poll(() => contents(s.store).length, { timeout: 2000 }).toBe(1);
    const id = [...s.store.getState().data.notes.keys()][0];
    s.store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: 'title line\nREMOTE middle\nlast line' } } as never);
    s.ed.write('title line\nLOCAL middle\nlast line');
    await expect.poll(() => { const c = contents(s.store); return c.length === 1 && c[0].includes('LOCAL middle') && c[0].includes('REMOTE middle'); }, { timeout: 2000 }).toBe(true);
    s.ed.quit(0);
    await expect.poll(() => ({ raw, errors: [...errors] }), { timeout: 2000 })
      .toEqual({ raw: true, errors: ['A change from another device could not be merged automatically - both versions were kept.'] });
  });

  it('8: (rev2) WHEN a new note gets the write `x`, then the empty write, then another device sets the note to `REMOTE text`, and the editor quits THEN the store holds one note, not trashed, holding `REMOTE text`, and the only notice is the both-versions-kept one (not `Empty note moved to trash`)', async () => {
    const s = start();
    s.ed.write('x');
    await expect.poll(() => contents(s.store), { timeout: 2000 }).toEqual(['x']);
    s.ed.write('');
    const id = [...s.store.getState().data.notes.keys()][0];
    s.store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: 'REMOTE text' } } as never);
    s.ed.quit(0);
    await expect.poll(() => ({ raw, notes: [...s.store.getState().data.notes.values()].map((n) => ({ deleted: n.deleted === true, remote: (n.content ?? '').includes('REMOTE text') })), errors: [...errors] }), { timeout: 2000 })
      .toEqual({ raw: true, notes: [{ deleted: false, remote: true }], errors: ['A change from another device could not be merged automatically - both versions were kept.'] });
  });

  it('9: (rev3) WHEN a new note`s first write `first` makes the store throw before the reducer runs THEN the editor stays open and the store holds no note; WHEN `second` is written THEN exactly one note, `second`; WHEN the editor quits THEN still one note, `second`, and no notice', async () => {
    const s = start();
    const real = s.store.dispatch;
    let thrown = false;
    s.store.dispatch = ((action: { type?: string }) => {
      if (!thrown && action?.type === 'CREATE_NOTE_WITH_ID') {
        thrown = true;
        throw new Error('dispatch failed before the reducer');
      }
      return real(action as never);
    }) as typeof s.store.dispatch;
    s.ed.write('first');
    await expect.poll(() => ({ thrown, done: s.ed.done(1), exited: s.ed.exited(), notes: contents(s.store) }), { timeout: 2000 }).toEqual({ thrown: true, done: true, exited: false, notes: [] });
    s.ed.write('second');
    await expect.poll(() => contents(s.store), { timeout: 2000 }).toEqual(['second']);
    s.ed.quit(0);
    await expect.poll(() => ({ raw, notes: contents(s.store), errors: [...errors] }), { timeout: 2000 }).toEqual({ raw: true, notes: ['second'], errors: [] });
  });
});
