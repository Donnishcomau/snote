/**
 * #65: a note written in the editor is never lost.
 *
 * The editor's file is a draft in a private folder under the open account's
 * `<dataDir>/drafts` (buildStore sets it; each test here sets a scratch
 * one). It is kept when the editor fails to start or exits with a
 * status other than 0, and when snote dies before the note is saved; it is
 * removed only once state.json holds the text. The next start restores a
 * kept draft as a new note and never changes an existing one.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import {
  chmodSync,
  existsSync,
  lstatSync,
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

import { editInEditor } from '../../src/core/editor';
import { draftsDir, recoverDrafts, setDraftsDir } from '../../src/core/editor-drafts';
import { persistOnChange, saveState } from '../../src/core/persistence';
import { makeStore } from '../../src/core/store';
import { buildStore } from '../../src/cli/main';
import { onProblem } from '../../src/core/problem-signal';
import { createNote, editSelectedNote } from '../../src/tui/app-actions';
import { App } from '../../src/tui/App';
import { logout } from '../../src/core/token';
import { crashReport } from '../../src/core/crash-report';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import { FakeSimperiumServer } from '../fake-simperium/server';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

// Poll with a 10 ms step; EVERY asserted value sits inside the condition.
const waitFor = async (cond: () => boolean, timeoutMs = 2500) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const cleanup: string[] = [];
const stops: Array<() => void> = [];
beforeEach(() => {
  const account = mkdtempSync(join(tmpdir(), 'editor-drafts-account-'));
  cleanup.push(account);
  setDraftsDir(join(account, 'drafts'));
});
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
  setDraftsDir(null);
});

// A fake Simperium server holding <notes>; stopped after the test.
async function fakeServer(notes: Array<{ id: string; content: string }>): Promise<FakeSimperiumServer> {
  const server = new FakeSimperiumServer();
  await server.start();
  stops.push(() => setTimeout(() => server.stop(), 100));
  const now = Date.now();
  server.seedBucket(
    'test-app',
    'note',
    notes.map(({ id, content }) => ({
      id,
      data: { content, creationDate: now, deleted: 0, modificationDate: now, systemTags: [], tags: [] },
    })),
  );
  return server;
}

function scratch(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(d);
  return d;
}

// A fake editor: records the file it was given in <log>, writes <text> into
// it (when text is not null) and exits with <code>.
function fakeEditor(text: string | null, code: number): { editor: string; log: string } {
  const bin = scratch('editor-drafts-bin-');
  const log = join(bin, 'path.log');
  const editor = join(bin, 'fake');
  const write = text === null ? '' : `printf '%s' '${text}' > "$last"\n`;
  writeFileSync(
    editor,
    `#!/bin/sh\nfor f in "$@"; do last="$f"; done\nprintf '%s' "$last" > '${log}'\n${write}exit ${code}\n`,
  );
  chmodSync(editor, 0o755);
  return { editor, log };
}

const noteContents = (store: ReturnType<typeof makeStore>): string[] =>
  [...store.getState().data.notes.values()].map((n) => n.content);

const addNote = (store: ReturnType<typeof makeStore>, id: string, content: string) =>
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid(id),
    note: { content, systemTags: [], tags: [] },
  } as never);

describe('#65 editor drafts', () => {
  it('1: WHEN the editor writes `kept after exit 1` and exits with status 1 THEN editInEditor rejects with a message containing `editor failed: exit 1` and `Your text is kept in <file>`, and that file holds `kept after exit 1` with mode `0600` inside a folder with mode `0700` under the account drafts folder', async () => {
    const { editor, log } = fakeEditor('kept after exit 1', 1);
    let message = '';
    await editInEditor('', { editor }).catch((e: Error) => {
      message = e.message;
    });
    const file = readFileSync(log, 'utf-8');
    expect(message).toContain('editor failed: exit 1');
    expect(message).toContain('Your text is kept in ' + file);
    expect(file.startsWith(draftsDir() + '/')).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('kept after exit 1');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(file)).mode & 0o777).toBe(0o700);
  });

  it('2: WHEN the editor command does not exist THEN editInEditor rejects with a message containing `editor failed: ENOENT` and `Your text is kept in`, and the named file still holds the text it was opened with, `draft before spawn`', async () => {
    let message = '';
    await editInEditor('draft before spawn', { editor: 'snote-no-such-editor-xyz' }).catch((e: Error) => {
      message = e.message;
    });
    const file = message.split('Your text is kept in ')[1] ?? '';
    expect(message).toContain('editor failed: ENOENT');
    expect(message).toContain('Your text is kept in');
    expect(file.startsWith(draftsDir() + '/')).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('draft before spawn');
  });

  it('3: WHEN the editor writes text and exits 0, for a new note (`stored words`) and for an edit of note `old note` (`edited words`), into a store that persistOnChange saves THEN just after each dispatch the draft file still exists and state.json does not hold the text, and the draft folder is removed only once state.json holds it', async () => {
    const dataDir = scratch('editor-drafts-data-');
    const stateFile = join(dataDir, 'state.json');
    const store = makeStore({ stubClient: {} });
    addNote(store, 'n1', 'old note');
    stops.push(persistOnChange(store, dataDir, 300));
    const saved = (text: string) => existsSync(stateFile) && readFileSync(stateFile, 'utf-8').includes(text);

    // Runs one editor session through <start> and returns what was seen one
    // timer turn after the dispatch (everything the dispatch started at once
    // has run, the 300 ms save has not) and at the end.
    const session = async (text: string, start: (runEditor: (i: string) => Promise<string | null>) => void) => {
      const { editor, log } = fakeEditor(text, 0);
      let seen = false;
      let atDispatch: { draft: boolean; saved: boolean } | null = null;
      const off = store.subscribe(() => {
        if (!seen && noteContents(store).includes(text)) {
          seen = true;
          setTimeout(() => {
            atDispatch = { draft: existsSync(readFileSync(log, 'utf-8')), saved: saved(text) };
          }, 0);
        }
      });
      stops.push(off);
      start((initial) => editInEditor(initial, { editor }));
      const folder = () => dirname(readFileSync(log, 'utf-8'));
      await waitFor(() => atDispatch !== null && saved(text) && !existsSync(folder()));
      return { atDispatch, saved: saved(text), folderLeft: existsSync(folder()) };
    };

    const created = await session('stored words', (runEditor) =>
      createNote({ store, setRawMode: () => {}, runEditor, setSelectedIndex: (() => {}) as never }),
    );
    const note = store.getState().data.notes.get(eid('n1'))!;
    const edited = await session('edited words', (runEditor) =>
      editSelectedNote({ store, selectedEntry: { id: eid('n1'), note }, setRawMode: () => {}, runEditor }),
    );
    expect(created).toEqual({ atDispatch: { draft: true, saved: false }, saved: true, folderLeft: false });
    expect(edited).toEqual({ atDispatch: { draft: true, saved: false }, saved: true, folderLeft: false });
  });

  it('4: WHEN snote dies after the editor returned `lost words` (nothing dispatched) and the next start runs buildStore on a state.json holding note `old note` THEN the store gains a new note `lost words`, note `old note` is unchanged, the notice says `Restored 1 note from an unfinished editor session`, and the draft folder is removed once state.json holds `lost words`', async () => {
    const { editor, log } = fakeEditor('lost words', 0);
    await expect(editInEditor('', { editor })).resolves.toBe('lost words');
    const folder = dirname(readFileSync(log, 'utf-8'));

    const server = await fakeServer([{ id: 'n1', content: 'old note' }]);
    // the account folder whose drafts folder holds the draft
    const dataDir = dirname(draftsDir());
    const seed = makeStore({ stubClient: {} });
    addNote(seed, 'n1', 'old note');
    saveState(seed.getState(), dataDir);
    const stateFile = join(dataDir, 'state.json');

    const notices: string[] = [];
    stops.push(onProblem((m) => notices.push(m)));
    const built = buildStore(
      { dataDir, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
      { email: 'test@example.com', token: 'test-token' },
      vi.fn(),
    );
    stops.unshift(built.stopSaving);
    const store = built.store;
    const done = () =>
      noteContents(store).includes('lost words') &&
      store.getState().data.notes.get(eid('n1'))?.content === 'old note' &&
      notices.includes('Restored 1 note from an unfinished editor session') &&
      readFileSync(stateFile, 'utf-8').includes('lost words') &&
      !existsSync(folder);
    await waitFor(done);
    expect(noteContents(store).filter((c) => c === 'lost words')).toHaveLength(1);
    expect(store.getState().data.notes.get(eid('n1'))?.content).toBe('old note');
    expect(notices).toContain('Restored 1 note from an unfinished editor session');
    expect(existsSync(folder)).toBe(false);
  });

  it('5: WHEN the drafts folder holds a draft equal to note `old note`, an empty draft, a folder whose only entry is a symlink to a file holding `secret text`, and a symlinked folder `snote-dirlink` to a folder holding `secret folder text` THEN recoverDrafts returns `0`, adds no note, removes the first two folders, and leaves both symlinks and their targets in place', () => {
    const store = makeStore({ stubClient: {} });
    addNote(store, 'n1', 'old note');
    const dir = draftsDir();
    const same = join(dir, 'snote-same');
    const empty = join(dir, 'snote-empty');
    const link = join(dir, 'snote-link');
    for (const d of [same, empty, link]) mkdirSync(d, { recursive: true });
    writeFileSync(join(same, 'old note.md'), 'old note');
    writeFileSync(join(empty, 'untitled.md'), '');
    const outside = join(scratch('editor-drafts-secret-'), 'secret.md');
    writeFileSync(outside, 'secret text');
    symlinkSync(outside, join(link, 'link.md'));
    const outsideDir = scratch('editor-drafts-secret-dir-');
    writeFileSync(join(outsideDir, 'note.md'), 'secret folder text');
    symlinkSync(outsideDir, join(dir, 'snote-dirlink'));

    expect(recoverDrafts(store, dir)).toBe(0);
    expect(noteContents(store)).toEqual(['old note']);
    expect(noteContents(store)).not.toContain('secret text');
    expect(noteContents(store)).not.toContain('secret folder text');
    expect(existsSync(same)).toBe(false);
    expect(existsSync(empty)).toBe(false);
    expect(existsSync(link)).toBe(true);
    expect(readFileSync(join(outsideDir, 'note.md'), 'utf-8')).toBe('secret folder text');
  });

  it('6: WHEN the editor exits 0 without changing the text `same text` THEN editInEditor returns `null`, the editor was given a file under the account drafts folder, and that draft folder is removed at once', async () => {
    const { editor, log } = fakeEditor(null, 0);
    await expect(editInEditor('same text', { editor })).resolves.toBeNull();
    const file = readFileSync(log, 'utf-8');
    expect(file.startsWith(draftsDir() + '/')).toBe(true);
    expect(existsSync(dirname(file))).toBe(false);
    expect(readdirSync(draftsDir()).filter((n) => n.startsWith('snote-'))).toEqual([]);
  });

  it('7: WHEN account A holds a draft `account a words` and account B a draft `account b words`, and buildStore opens B THEN B gains `account b words` but never `account a words`, A\'s draft file is untouched, and after logout of the data root A\'s drafts folder is gone while a symlinked `drafts` in account C and its target stay', async () => {
    const root = scratch('editor-drafts-root-');
    const [a, b, c] = ['a@example.com', 'b@example.com', 'c@example.com'].map((n) => join(root, n));
    for (const d of [a, b, c]) mkdirSync(d, { recursive: true });
    setDraftsDir(join(a, 'drafts'));
    const fa = fakeEditor('account a words', 0);
    await expect(editInEditor('', { editor: fa.editor })).resolves.toBe('account a words');
    const draftA = readFileSync(fa.log, 'utf-8');
    setDraftsDir(join(b, 'drafts'));
    const fb = fakeEditor('account b words', 0);
    await expect(editInEditor('', { editor: fb.editor })).resolves.toBe('account b words');
    const outside = scratch('editor-drafts-c-target-');
    writeFileSync(join(outside, 'keep.md'), 'c target');
    mkdirSync(join(outside, 'snote-abc123'));
    symlinkSync(outside, join(c, 'drafts'));

    // account A was the open account before B is opened
    setDraftsDir(join(a, 'drafts'));
    const server = await fakeServer([]);
    const built = buildStore(
      { dataDir: b, appId: 'test-app', server: server.url, noteEditDelayMs: 10 },
      { email: 'b@example.com', token: 'test-token' },
      vi.fn(),
    );
    stops.unshift(built.stopSaving);
    await waitFor(() => noteContents(built.store).includes('account b words'));
    expect(noteContents(built.store)).not.toContain('account a words');
    expect(readFileSync(draftA, 'utf-8')).toBe('account a words');

    built.stopSaving();
    await logout(root);
    expect(existsSync(join(a, 'drafts'))).toBe(false);
    expect(lstatSync(join(c, 'drafts')).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(outside, 'keep.md'), 'utf-8')).toBe('c target');
    expect(existsSync(join(outside, 'snote-abc123'))).toBe(true);
  });

  it('8: WHEN the drafts folder path holds the hostile sequence `\\x1b]0;pwn\\x07` and the editor exits 1 from the app\'s n key THEN the notice line shows `Your text is kept in` with no ESC byte and no `pwn`, and crashReport of that error holds neither the home folder nor `kept in`', async () => {
    const evil = join(scratch('editor-drafts-evil-'), 'x\x1b]0;pwn\x07y');
    mkdirSync(evil);
    setDraftsDir(join(evil, 'drafts'));
    const { editor } = fakeEditor('typed then failed', 1);
    let failure: unknown = null;
    const runEditor = (initial: string) =>
      editInEditor(initial, { editor }).catch((e: unknown) => {
        failure = e;
        throw e;
      });
    const store = makeStore({ stubClient: {} });
    const { stdin, lastFrame } = render(React.createElement(App, { store, width: 80, height: 24, runEditor }));
    await waitForInput(stdin);
    stdin.write('n');
    const frame = await waitForFrame(lastFrame, (f) => f.includes('Your text is kept in') && failure !== null);
    expect(frame).toContain('Your text is kept in');
    expect(frame).not.toContain('\x1b]');
    expect(frame).not.toContain('pwn');
    const home = process.env.HOME as string;
    const record = JSON.stringify(
      crashReport(failure, { version: '0.0.1', when: new Date(), columns: 80, rows: 24, home }).record,
    );
    expect(record).not.toContain(home);
    expect(record).not.toContain('kept in');
  });

  it('9: WHEN logout runs on a data root where account A holds an editor draft and a foreign folder `myproject` holds `drafts/thesis.md` (`my thesis`) and `drafts/snote-my-ideas/keep.md` (`my ideas`) THEN A\'s drafts folder is gone, and `thesis.md` and `snote-my-ideas/keep.md` still hold `my thesis` and `my ideas`', async () => {
    const root = scratch('editor-drafts-root9-');
    const a = join(root, 'a@example.com');
    mkdirSync(a, { recursive: true });
    setDraftsDir(join(a, 'drafts'));
    const fa = fakeEditor('account a words', 1);
    await expect(editInEditor('', { editor: fa.editor })).rejects.toThrow('Your text is kept in');
    const foreign = join(root, 'myproject', 'drafts');
    mkdirSync(join(foreign, 'snote-my-ideas'), { recursive: true });
    writeFileSync(join(foreign, 'thesis.md'), 'my thesis');
    writeFileSync(join(foreign, 'snote-my-ideas', 'keep.md'), 'my ideas');

    await logout(root);
    expect(existsSync(join(a, 'drafts'))).toBe(false);
    expect(readFileSync(join(foreign, 'thesis.md'), 'utf-8')).toBe('my thesis');
    expect(readFileSync(join(foreign, 'snote-my-ideas', 'keep.md'), 'utf-8')).toBe('my ideas');
  });

  it('10: WHEN the drafts folder is a symlink to a real folder holding a draft `behind link` THEN editInEditor rejects with `drafts folder is not a folder` and adds no folder there, and recoverDrafts on that symlink returns `0`, adds no note, and leaves the draft in place', async () => {
    const target = scratch('editor-drafts-link-target-');
    mkdirSync(join(target, 'snote-behind'));
    writeFileSync(join(target, 'snote-behind', 'note.md'), 'behind link');
    const link = join(scratch('editor-drafts-link-'), 'drafts');
    symlinkSync(target, link);
    setDraftsDir(link);
    const { editor } = fakeEditor('never written', 0);
    await expect(editInEditor('', { editor })).rejects.toThrow('drafts folder is not a folder');
    expect(readdirSync(target)).toEqual(['snote-behind']);

    const store = makeStore({ stubClient: {} });
    expect(recoverDrafts(store, link)).toBe(0);
    expect(noteContents(store)).toEqual([]);
    expect(readFileSync(join(target, 'snote-behind', 'note.md'), 'utf-8')).toBe('behind link');
  });

  it('11: WHEN a draft folder holds `note.md` (`real words`) and the editor swap file `.note.md.swp` (`swap junk`) THEN recoverDrafts returns `1` and the store holds `real words` and never `swap junk`', () => {
    const folder = join(draftsDir(), 'snote-swap01');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'note.md'), 'real words');
    writeFileSync(join(folder, '.note.md.swp'), 'swap junk');
    const store = makeStore({ stubClient: {} });
    expect(recoverDrafts(store)).toBe(1);
    expect(noteContents(store)).toEqual(['real words']);
    expect(noteContents(store)).not.toContain('swap junk');
  });
});
