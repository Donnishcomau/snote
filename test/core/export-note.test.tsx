/**
 * T298: export the selected note to a .md file (`w`).
 * Pure naming/tags tests plus one end-to-end render test of <App> that
 * writes into a temp documents dir set via XDG_DOCUMENTS_DIR. The file
 * carries a .tsx extension because it renders <App /> with JSX.
 */

import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';

import { exportFileName, exportText, exportNote } from '../../src/core/export-note';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from '../tui/fixtures';
import type { EntityId, Note, TagName } from '@vendor/types';

const note = (content: string, tags: string[] = []): Note =>
  ({
    content,
    tags: tags as TagName[],
    systemTags: [],
    creationDate: 1000,
    modificationDate: 1000,
    deleted: false,
  }) as Note;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ink's ANSI frames break substring checks; search the stripped frame.
const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

describe('export-note', () => {
  it("1: WHEN exportFileName('# Shopping list\\nmilk') is called THEN it returns `Shopping list`", () => {
    expect(exportFileName('# Shopping list\nmilk')).toBe('Shopping list');
  });

  it("2: WHEN exportFileName('\\n  \\n') is called THEN it returns `untitled`, and exportFileName('a/b:c*d') returns `abcd`", () => {
    expect(exportFileName('\n  \n')).toBe('untitled');
    expect(exportFileName('a/b:c*d')).toBe('abcd');
  });

  it("3: WHEN exportText gets content `hello` and tags `['work', 'ideas']` THEN it returns `hello\\n\\nTags:\\n  work, ideas`", () => {
    expect(exportText(note('hello', ['work', 'ideas']))).toBe('hello\n\nTags:\n  work, ideas');
  });

  it("4: WHEN exportNote writes a note with content `# Plan\\nstep 1` into an empty temp dir THEN the file `Plan.md` exists with content `# Plan\\nstep 1`", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'export-'));
    try {
      await exportNote(note('# Plan\nstep 1'), dir);
      const path = join(dir, 'Plan.md');
      expect(existsSync(path)).toBe(true);
      expect(await readFile(path, 'utf8')).toBe('# Plan\nstep 1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("5: WHEN exportNote runs twice for the same note into the same temp dir THEN both `Plan.md` and `Plan 2.md` exist and the first is unchanged", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'export-'));
    try {
      await exportNote(note('# Plan\nstep 1'), dir);
      await exportNote(note('# Plan\nstep 1'), dir);
      const first = join(dir, 'Plan.md');
      const second = join(dir, 'Plan 2.md');
      expect(existsSync(first)).toBe(true);
      expect(existsSync(second)).toBe(true);
      expect(await readFile(first, 'utf8')).toBe('# Plan\nstep 1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("6: WHEN `w` is pressed in <App> on a selected note, then Enter THEN the frame contains `exported:` and the file exists in the temp documents dir set via `XDG_DOCUMENTS_DIR`", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'export-docs-'));
    const prevXdg = process.env.XDG_DOCUMENTS_DIR;
    process.env.XDG_DOCUMENTS_DIR = dir;
    try {
      const store = makeStore({ stubClient: {} });
      store.dispatch({
        type: 'IMPORT_NOTE_WITH_ID',
        noteId: 'w1' as unknown as EntityId,
        note: makeNote('w1', '# Plan\nstep 1', {
          creationDate: 1000,
          modificationDate: 1000,
        }) as never,
      });
      const { stdin, lastFrame } = render(<App store={store} width={80} height={24} />);
      await delay(50);
      stdin.write('\t');
      await delay(50);
      stdin.write('w');
      await delay(50);
      stdin.write('\r');
      const path = join(dir, 'Plan.md');
      await vi.waitFor(
        () => {
          const frame = stripAnsi(lastFrame());
          expect(frame).toContain('exported:');
          expect(existsSync(path)).toBe(true);
        },
        { timeout: 2000 },
      );
    } finally {
      if (prevXdg === undefined) delete process.env.XDG_DOCUMENTS_DIR;
      else process.env.XDG_DOCUMENTS_DIR = prevXdg;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
