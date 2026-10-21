/**
 * #89: a failed edit of an EXISTING note comes back as that note's text. The
 * editor session writes `source.json` (note id and the sha256 of the text the
 * edit began with) beside the draft; the next start applies the draft to that
 * note only while the note still holds that text. Anything else is today's
 * behaviour: the draft comes back as a new note, nothing is lost.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { editInEditor, expectNote } from '../../src/core/editor';
import { draftsDir, recoverDrafts, recoveryNotice, setDraftsDir } from '../../src/core/editor-drafts';
import { makeStore } from '../../src/core/store';
import { logout } from '../../src/core/token';
import { createNote, editSelectedNote } from '../../src/tui/app-actions';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const sha = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const cleanup: string[] = [];
beforeEach(() => {
  const account = mkdtempSync(join(tmpdir(), 'editor-drafts-source-'));
  cleanup.push(account);
  setDraftsDir(join(account, 'drafts'));
});
afterEach(() => {
  for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
  setDraftsDir(null);
});

const scratch = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(d);
  return d;
};

// A fake editor: writes <text> into the file it is given and exits with <code>.
function fakeEditor(text: string, code: number): string {
  const bin = scratch('editor-drafts-source-bin-');
  const editor = join(bin, 'fake');
  writeFileSync(editor, `#!/bin/sh\nfor f in "$@"; do last="$f"; done\nprintf '%s' '${text}' > "$last"\nexit ${code}\n`);
  chmodSync(editor, 0o755);
  return editor;
}

const addNote = (store: ReturnType<typeof makeStore>, id: string, content: string) =>
  store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid(id), note: { content, systemTags: [], tags: [] } } as never);

const contents = (store: ReturnType<typeof makeStore>): Record<string, string> =>
  Object.fromEntries([...store.getState().data.notes.entries()].map(([id, n]) => [id, n.content]));

// Edit note <id> through the app's own action with an editor that fails after writing <text>.
async function failedEdit(store: ReturnType<typeof makeStore>, id: string, text: string): Promise<string> {
  const editor = fakeEditor(text, 1);
  const note = store.getState().data.notes.get(eid(id))!;
  let failure = '';
  editSelectedNote({
    store,
    selectedEntry: { id: eid(id), note },
    setRawMode: () => {},
    runEditor: (initial) => editInEditor(initial, { editor }),
    onEditorError: (m) => (failure = m),
  });
  await waitFor(() => failure !== '');
  expect(failure).toContain('Your text is kept in');
  const folders = readdirSync(draftsDir()).filter((n) => n.startsWith('snote-'));
  return join(draftsDir(), folders[folders.length - 1]);
}

/** A hand-made draft folder: <draft> as `x.md` and, when given, <source> as `source.json`. */
function handmade(name: string, draft: string, source?: string): string {
  const folder = join(draftsDir(), name);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(join(folder, 'x.md'), draft, { mode: 0o600 });
  if (source !== undefined) writeFileSync(join(folder, 'source.json'), source, { mode: 0o600 });
  return folder;
}

describe('#89 a failed edit of an existing note', () => {
  it('1: WHEN an existing note `old note` is edited and the editor fails THEN its draft folder (mode `0700`) holds `source.json` (mode `0600`) with `v` 1, the note id and the sha256 of `old note`, and a new note (empty text) leaves no `source.json`', async () => {
    const store = makeStore({ stubClient: {} });
    addNote(store, 'n1', 'old note');
    const folder = await failedEdit(store, 'n1', 'old note, edited');
    const file = join(folder, 'source.json');
    expect(existsSync(file)).toBe(true);
    expect(statSync(folder).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ v: 1, noteId: 'n1', sha256: sha('old note') });
    // a new note, even when an earlier edit left a note named: the editor is opened on '' with no note named
    expectNote('n1');
    const bin = fakeEditor('typed', 1);
    let failure = '';
    createNote({
      store,
      setRawMode: () => {},
      runEditor: (initial) => editInEditor(initial, { editor: bin }),
      setSelectedIndex: (() => {}) as never,
      onEditorError: (m) => (failure = m),
    });
    await waitFor(() => failure !== '');
    expect(failure).toContain('Your text is kept in');
    const folders = readdirSync(draftsDir()).filter((n) => join(draftsDir(), n) !== folder);
    expect(folders).toHaveLength(1);
    expect(existsSync(join(draftsDir(), folders[0], 'source.json'))).toBe(false);
  });

  it('2: WHEN the editor failed after writing `old note, edited` and note `n1` still holds `old note` at the next start THEN recoverDrafts returns `1`, the store holds one note `n1` with `old note, edited`, and the notice is `Restored 1 note from an unfinished editor session`', async () => {
    const store = makeStore({ stubClient: {} });
    addNote(store, 'n1', 'old note');
    await failedEdit(store, 'n1', 'old note, edited');
    const report = { changed: 0 };
    expect(recoverDrafts(store, draftsDir(), [], report)).toBe(1);
    expect(contents(store)).toEqual({ n1: 'old note, edited' });
    expect(report.changed).toBe(0);
    expect(recoveryNotice(1, [], report.changed)).toBe('Restored 1 note from an unfinished editor session');
  });

  it('3: WHEN note `n1` changed to `synced elsewhere` after the failed edit, and note `n2` was deleted THEN each draft comes back as a second note, both notes keep their text, nothing is lost, and the notice is `Restored 1 note as a new note: the original changed meanwhile`', async () => {
    const store = makeStore({ stubClient: {} });
    addNote(store, 'n1', 'old note');
    addNote(store, 'n2', 'second note');
    await failedEdit(store, 'n1', 'old note, edited');
    await failedEdit(store, 'n2', 'second note, edited');
    store.dispatch({ type: 'EDIT_NOTE', noteId: eid('n1'), changes: { content: 'synced elsewhere' } } as never);
    store.dispatch({ type: 'TRASH_NOTE', noteId: eid('n2') } as never);
    const report = { changed: 0 };
    expect(recoverDrafts(store, draftsDir(), [], report)).toBe(2);
    const texts = Object.values(contents(store)).sort();
    expect(texts).toEqual(['old note, edited', 'second note', 'second note, edited', 'synced elsewhere']);
    expect(contents(store).n1).toBe('synced elsewhere');
    expect(report.changed).toBe(2);
    expect(recoveryNotice(1, [], 1)).toBe('Restored 1 note as a new note: the original changed meanwhile');
  });

  it('4: WHEN a sidecar is forged (the id `n 3` of an existing note with the right hash but the wrong id shape, the id of note `n2` with the hash of another text, a symlinked `source.json`, a 5 KiB file, `v` 2, invalid JSON) THEN no note is overwritten: `n1`, `n2` and `n 3` keep their text and every draft comes back as a new note', () => {
    const store = makeStore({ stubClient: {} });
    addNote(store, 'n1', 'old note');
    addNote(store, 'n2', 'second note');
    addNote(store, 'n 3', 'third note');
    const good = (extra: object = {}) => JSON.stringify({ v: 1, noteId: 'n1', sha256: sha('old note'), ...extra });
    handmade('snote-aaaaa1', 'forged one', JSON.stringify({ v: 1, noteId: 'n 3', sha256: sha('third note') }));
    handmade('snote-aaaaa2', 'forged two', JSON.stringify({ v: 1, noteId: 'n2', sha256: sha('another text') }));
    const link = handmade('snote-aaaaa3', 'forged three');
    const outside = join(scratch('editor-drafts-source-out-'), 'source.json');
    writeFileSync(outside, good());
    symlinkSync(outside, join(link, 'source.json'));
    handmade('snote-aaaaa4', 'forged four', good({ pad: 'p'.repeat(5 * 1024) }));
    handmade('snote-aaaaa5', 'forged five', good({ v: 2 }));
    handmade('snote-aaaaa6', 'forged six', '{not json');
    const report = { changed: 0 };
    expect(recoverDrafts(store, draftsDir(), [], report)).toBe(6);
    const all = contents(store);
    expect(all.n1).toBe('old note');
    expect(all.n2).toBe('second note');
    expect(all['n 3']).toBe('third note');
    const added = Object.entries(all).filter(([id]) => id !== 'n1' && id !== 'n2' && id !== 'n 3').map(([, t]) => t).sort();
    expect(added).toEqual(['forged five', 'forged four', 'forged one', 'forged six', 'forged three', 'forged two']);
    expect(report.changed).toBe(1);
  });

  it('5: WHEN a draft folder has only the `.md` draft `old note, edited` and no `source.json` (the 0.2.7 format) beside note `n1` = `old note` THEN recoverDrafts returns `1`, adds one new note, `n1` keeps `old note`, and the notice is `Restored 1 note from an unfinished editor session`', () => {
    const store = makeStore({ stubClient: {} });
    addNote(store, 'n1', 'old note');
    const folder = handmade('snote-bbbbb1', 'old note, edited');
    const report = { changed: 0 };
    expect(recoverDrafts(store, draftsDir(), [], report)).toBe(1);
    expect(contents(store).n1).toBe('old note');
    expect(Object.values(contents(store)).sort()).toEqual(['old note', 'old note, edited']);
    expect(report.changed).toBe(0);
    expect(recoveryNotice(1, [], report.changed)).toBe('Restored 1 note from an unfinished editor session');
    expect(existsSync(join(folder, 'x.md'))).toBe(true); // removed only after a save
  });

  it('6: WHEN logout runs on a data root whose account holds a draft folder with a `source.json` THEN that drafts folder, the sidecar included, is gone', async () => {
    const root = scratch('editor-drafts-source-root-');
    const account = join(root, 'a@example.com');
    mkdirSync(account, { recursive: true });
    setDraftsDir(join(account, 'drafts'));
    const store = makeStore({ stubClient: {} });
    addNote(store, 'n1', 'old note');
    const folder = await failedEdit(store, 'n1', 'old note, edited');
    expect(existsSync(join(folder, 'source.json'))).toBe(true);
    expect(dirname(folder)).toBe(join(account, 'drafts'));
    await logout(root);
    expect(existsSync(join(account, 'drafts'))).toBe(false);
  });
});
