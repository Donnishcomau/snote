/**
 * T306: security review 2 — G1 (tag editor drew raw tags), G2 (data dir
 * created 0755), G4 (export followed symlinks). One it() per Acceptance line.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, lstatSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';

import { App } from '../../src/tui/App';
import { makeStore } from '../../src/core/store';
import { exportNote } from '../../src/core/export-note';
import { saveToken } from '../../src/core/token';
import type { EntityId, Note, TagName } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
const tname = (name: string): TagName => name as unknown as TagName;

// The OSC-8 hyperlink tag from the review: `a]8;;http://evil^Gx]8;;^G`
// renders as `ax` once sanitized.
const evilTag = 'a\u001b]8;;http://evil\u0007x\u001b]8;;\u0007';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function seedNoteWithTag(store: ReturnType<typeof makeStore>): void {
  const now = Date.now();
  // Seed the note WITHOUT the tag and add it via ADD_NOTE_TAG: the tag then
  // reaches the note through the same path the tag editor's add action uses
  // (BottomArea's onAdd), so the editor can remove it again with Backspace.
  store.dispatch({
    type: 'CREATE_NOTE_WITH_ID',
    noteId: eid('t1'),
    note: {
      content: 'Tagged note',
      systemTags: ['pinned'],
      tags: [],
      deleted: false,
      modificationDate: now,
      creationDate: now,
    } as Note,
  });
  store.dispatch({
    type: 'ADD_NOTE_TAG',
    noteId: eid('t1'),
    tagName: tname(evilTag),
  });
}

function t1Tags(store: ReturnType<typeof makeStore>): TagName[] {
  const note = store.getState().data.notes.get(eid('t1'));
  return note?.tags ?? [];
}

describe('security review 2 (G1 G2 G4)', () => {
  it("1: WHEN the tag editor is opened with `g` on a note whose tag is `a\\u001b]8;;http://evil\\u0007x\\u001b]8;;\\u0007` THEN the frame contains `ax` and contains no `\\u001b`", async () => {
    const store = makeStore({ stubClient: {} });
    seedNoteWithTag(store);

    const { stdin, lastFrame, unmount } = render(<App store={store} width={80} height={24} />);
    await delay(50);

    stdin.write('g');
    await delay(50);

    // The tag editor's own line in the frame: from `tags:` to the end of
    // the frame. Asserted on this slice because the Preview pane draws the
    // note's tag line raw (out of T306's Edit scope); this is exactly what
    // G1 puts on screen via BottomArea:  sanitized chips `ax`, no ESC byte.
    const editorLines = (lastFrame() ?? '').split('\n').filter((l) => l.includes('tags:'));
    expect(editorLines.length).toBeGreaterThan(0);
    const editor = editorLines.join('\n');
    expect(editor).toContain('ax');
    expect(editor).not.toContain('\u001b');
    unmount();
  });

  it("2: WHEN, in that editor, the tag is removed with the editor's remove action THEN the note's stored `tags` no longer contain that raw tag string", async () => {
    const store = makeStore({ stubClient: {} });
    seedNoteWithTag(store);
    expect(t1Tags(store)).toContain(tname(evilTag));

    const { stdin, unmount } = render(<App store={store} width={80} height={24} />);
    await delay(50);

    stdin.write('g');
    await delay(50);

    // Backspace with empty input = the editor's remove action; it must
    // carry the RAW tag name so it still matches the stored tag.
    stdin.write('\x7f');
    await delay(50);

    expect(t1Tags(store)).not.toContain(tname(evilTag));
    unmount();
  });

  it("3: WHEN exportNote targets a temp dir where `Plan.md` is a dangling symlink to `victim.txt` THEN `victim.txt` does not exist afterwards and the returned path ends with `Plan 2.md`", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'export-sym-'));
    try {
      symlinkSync(join(dir, 'victim.txt'), join(dir, 'Plan.md'));
      const path = await exportNote(
        {
          content: '# Plan\nstep 1',
          tags: [],
          systemTags: [],
          creationDate: 1000,
          modificationDate: 1000,
          deleted: false,
        } as Note,
        dir
      );
      expect(existsSync(join(dir, 'victim.txt'))).toBe(false);
      expect(path.endsWith('Plan 2.md')).toBe(true);
      // the dangling symlink was never written through
      expect(lstatSync(join(dir, 'Plan.md')).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("4: WHEN exportNote runs twice for the same note into an empty temp dir THEN both `Plan.md` and `Plan 2.md` exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'export-two-'));
    try {
      const n = {
        content: '# Plan\nstep 1',
        tags: [],
        systemTags: [],
        creationDate: 1000,
        modificationDate: 1000,
        deleted: false,
      } as Note;
      await exportNote(n, dir);
      await exportNote(n, dir);
      expect(existsSync(join(dir, 'Plan.md'))).toBe(true);
      expect(existsSync(join(dir, 'Plan 2.md'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("5: WHEN saveToken writes into a new temp dir path THEN that directory's mode `& 0o777` is `0o700`", async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'snote-token-mode-'));
    const dir = join(tmp, 'data');
    try {
      await saveToken(dir, { email: 'a@b.co', token: 'tok-1' });
      expect(lstatSync(dir).mode & 0o777).toBe(0o700);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
