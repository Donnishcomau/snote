/**
 * #386: an external GUI editor that returns at once with the file unchanged
 * (it handed the file to a window already open) ends the session with a
 * notice, not in silence. Each case sets and restores its own
 * SNOTE_EDITOR_QUICK_MS (test/setup.ts sets it to 0 for every other test).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { editInEditor } from '../../src/core/editor';
import { draftsDir, setDraftsDir } from '../../src/core/editor-drafts';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { testNotes } from '../tui/fixtures';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const NOTICE = 'Set SNOTE_EDITOR to a command that waits, e.g. code --wait. Nothing was saved';
const FAKE_EDITOR = 'node test/fixtures/fake-editor.mjs';
const eid = (id: string): EntityId => id as unknown as EntityId;

let scratch: string;
let savedQuick: string | undefined;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'editor-quick-'));
  setDraftsDir(join(scratch, 'drafts'));
  savedQuick = process.env.SNOTE_EDITOR_QUICK_MS;
});

afterEach(() => {
  setDraftsDir(null);
  if (savedQuick === undefined) delete process.env.SNOTE_EDITOR_QUICK_MS;
  else process.env.SNOTE_EDITOR_QUICK_MS = savedQuick;
  rmSync(scratch, { recursive: true, force: true });
});

const script = (name: string, body: string): string => {
  const dir = join(scratch, 'bin');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, '#!/bin/sh\n' + body + '\n');
  chmodSync(p, 0o755);
  return p;
};

const snoteEntries = (): string[] =>
  existsSync(draftsDir()) ? readdirSync(draftsDir()).filter((n) => n.startsWith('snote-')) : [];

describe('editor that returns at once', () => {
  it('1: WHEN `SNOTE_EDITOR_QUICK_MS` is `600000` and editInEditor(\'keep me\', { editor: \'true\' }) runs (`true` exits `0` at once and does not touch the file) THEN it rejects with an Error whose message is exactly the notice of TEXTS, and the account drafts folder holds no entry whose name starts with `snote-` afterwards', async () => {
    process.env.SNOTE_EDITOR_QUICK_MS = '600000';
    const err = await editInEditor('keep me', { editor: 'true' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(NOTICE);
    expect(snoteEntries()).toEqual([]);
  });

  it('2: WHEN `SNOTE_EDITOR_QUICK_MS` is `600000` and editInEditor(\'keep me\', { editor: \'node test/fixtures/fake-editor.mjs\' }) runs (it exits at once but appends `EDITED`) THEN it resolves to `keep me\\nEDITED` and does not reject', async () => {
    process.env.SNOTE_EDITOR_QUICK_MS = '600000';
    await expect(editInEditor('keep me', { editor: FAKE_EDITOR })).resolves.toBe('keep me\nEDITED');
  });

  it('3: WHEN `SNOTE_EDITOR_QUICK_MS` is `1` and a stand-in script named `waits-ed` writes a `started` file and then stays alive until the test creates a `release` file (no timer in the test; the test creates `release` after it has seen `started`), leaving the file unchanged, runs as the editor THEN editInEditor resolves to `null` after the release and does not reject', async () => {
    process.env.SNOTE_EDITOR_QUICK_MS = '1';
    const ctl = join(scratch, 'ctl');
    mkdirSync(ctl);
    const ed = script(
      'waits-ed',
      ': > "$1/started"\nwhile [ ! -e "$1/release" ]; do sleep 0.02; done',
    );
    const run = editInEditor('keep me', { editor: ed + ' ' + ctl });
    await vi.waitFor(() => expect(existsSync(join(ctl, 'started'))).toBe(true), { timeout: 2000, interval: 10 });
    writeFileSync(join(ctl, 'release'), '');
    await expect(run).resolves.toBeNull();
  });

  it('4: WHEN `SNOTE_EDITOR_QUICK_MS` is `600000` and the editor is a script named `nvim` (given by its full path in a temporary folder; it exits `0` at once, file unchanged; opts.stdin is a stub with `pause` and `resume`) THEN editInEditor resolves to `null` and does not reject', async () => {
    process.env.SNOTE_EDITOR_QUICK_MS = '600000';
    const nvim = script('nvim', 'exit 0');
    const stdin = { pause: vi.fn(), resume: vi.fn() };
    await expect(
      editInEditor('keep me', { editor: nvim, stdin: stdin as never }),
    ).resolves.toBeNull();
  });

  it('5: WHEN `SNOTE_EDITOR_QUICK_MS` is `0` and editInEditor(\'keep me\', { editor: \'true\' }) runs THEN it resolves to `null`, and WHEN the variable is `abc`, `-5`, `-0`, `0.0` and the empty string, in five runs, THEN each run rejects with the notice of TEXTS (the default `2000` applies and `true` exits well inside it)', async () => {
    process.env.SNOTE_EDITOR_QUICK_MS = '0';
    await expect(editInEditor('keep me', { editor: 'true' })).resolves.toBeNull();
    for (const v of ['abc', '-5', '-0', '0.0', '']) {
      process.env.SNOTE_EDITOR_QUICK_MS = v;
      const err = await editInEditor('keep me', { editor: 'true' }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err, `value ${JSON.stringify(v)}`).toBeInstanceOf(Error);
      expect((err as Error).message).toBe(NOTICE);
    }
  });

  it('6: WHEN the App (width `80`, height `24`, the `testNotes` of test/tui/fixtures, 4 notes shown) is rendered with runEditor set to `(t) => editInEditor(t, { editor: \'true\' })`, `SNOTE_EDITOR_QUICK_MS` is `600000`, and `e` is pressed, and in a second render `n` is pressed, THEN each frame contains the whole notice of TEXTS, and `data.notes` is the same Map object (`toBe`) as before the key', async () => {
    process.env.SNOTE_EDITOR_QUICK_MS = '600000';
    for (const key of ['e', 'n']) {
      const store = makeStore({ stubClient: {} });
      testNotes.forEach((note, idx) => {
        store.dispatch({
          type: 'CREATE_NOTE_WITH_ID',
          noteId: eid(`note-${idx + 1}`),
          note: {
            content: note.content,
            systemTags: note.systemTags,
            tags: note.tags,
            deleted: note.deleted,
            modificationDate: note.modificationDate,
            creationDate: note.creationDate,
          },
        });
      });
      const { stdin, lastFrame, unmount } = render(
        <App
          store={store}
          width={80}
          height={24}
          runEditor={(t: string) => editInEditor(t, { editor: 'true' })}
        />,
      );
      await waitForInput(stdin);
      await waitForFrame(lastFrame, '4 notes');
      const before = store.getState().data.notes;
      stdin.write(key);
      const frame = await waitForFrame(lastFrame, NOTICE, 2500);
      expect(frame).toContain(NOTICE);
      expect(store.getState().data.notes).toBe(before);
      unmount();
    }
  });

  it('7: WHEN README.md is read THEN `split(\'\\n\').length` is `199` (as on the base), its `## Editor` section contains `GUI editors must wait for you to close the file` and `code --wait`, `codium --wait`, `subl -w` and `gvim -f`, and the README sentence of TEXTS appears exactly once', () => {
    const readme = readFileSync('README.md', 'utf-8');
    expect(readme.split('\n').length).toBe(199);
    const sentence =
      'GUI editors must wait for you to close the file: set `SNOTE_EDITOR` to `code --wait`, `codium --wait`, `subl -w` or `gvim -f`.';
    const start = readme.indexOf('## Editor');
    const rest = readme.slice(start + 1);
    const next = rest.search(/\n## /);
    const section = next === -1 ? rest : rest.slice(0, next);
    expect(section).toContain('GUI editors must wait for you to close the file');
    for (const flag of ['`code --wait`', '`codium --wait`', '`subl -w`', '`gvim -f`']) {
      expect(section).toContain(flag);
    }
    expect(readme.split(sentence).length - 1).toBe(1);
  });
});
