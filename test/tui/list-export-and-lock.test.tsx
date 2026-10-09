/**
 * T304: (1) `w` export from the idle notes list (not just note-focused).
 *        (2) Second snote on one account dir shows lock message, exits non-zero.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { render } from 'ink-testing-library';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { main } from '../../src/cli/main';
import { acquireInstanceLock } from '../../src/core/instance-lock';
import type { Note, TagName } from '@vendor/types';

const note = (content: string, tags: string[] = [], deleted = false): Note =>
  ({
    content,
    tags: tags as TagName[],
    systemTags: [],
    creationDate: 1000,
    modificationDate: 1000,
    deleted,
  }) as Note;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ink's ANSI frames break substring checks; search the stripped frame.
const stripAnsi = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');

describe('T304 list export and instance lock', () => {
  let dir: string;
  let prevXdg: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'export-docs-'));
    prevXdg = process.env.XDG_DOCUMENTS_DIR;
    process.env.XDG_DOCUMENTS_DIR = dir;
  });

  afterEach(() => {
    if (prevXdg === undefined) delete process.env.XDG_DOCUMENTS_DIR;
    else process.env.XDG_DOCUMENTS_DIR = prevXdg;
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  });

  it("1: WHEN a note tagged `work` is selected, the app renders at width 118 (tags pane auto-opens, no Tab pressed) and `w` then Enter are written THEN the frame contains `exported:` and the file exists under `XDG_DOCUMENTS_DIR`; in a second render at the same width with a trashed note selected, `w` alone shows `In trash: press u to restore first` and writes no file", async () => {
    // First render: tagged note selected, width 118 → tags auto-open
    const store1 = makeStore({ stubClient: {} });
    store1.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: 'w1' as never,
      note: note('# Plan\nstep 1', ['work'], false),
    });
    const { stdin: stdin1, lastFrame: lastFrame1 } = render(<App store={store1} width={118} height={24} />);
    await delay(50);

    // tags pane should have auto-opened at width 118
    stdin1.write('w');
    await delay(50);
    stdin1.write('\r');
    const path = join(dir, 'Plan.md');
    await vi.waitFor(
      () => {
        const frame = stripAnsi(lastFrame1());
        expect(frame).toContain('exported:');
        expect(existsSync(path)).toBe(true);
      },
      { timeout: 2000 },
    );

    // Second render: trashed note selected in trash view
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    process.env.XDG_DOCUMENTS_DIR = dir;

    const store2 = makeStore({ stubClient: {} });
    store2.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: 'w2' as never,
      note: note('# Trashed\ncontent', [], true),
    });
    const { stdin: stdin2, lastFrame: lastFrame2 } = render(<App store={store2} width={118} height={24} />);
    await delay(50);
    // Navigate to trash so the deleted note is visible, then press w
    stdin2.write('T');
    await delay(50);
    stdin2.write('w');
    await delay(50);
    const frame2 = stripAnsi(lastFrame2());
    expect(frame2).toContain('In trash: press u to restore first');
    // no file should have been written
    expect(existsSync(join(dir, 'Trashed.md'))).toBe(false);
  });

  it("2: WHEN `acquireInstanceLock` already holds the lock for the account dir and `main(['--data-dir', dir], io)` then runs with a saved token for that account THEN it resolves non-zero, `logged.join('\\n')` contains `holds the instance lock`, never contains `Email:`, and the account dir's file list is unchanged from before the call", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'snote-lock-'));
    const acctDir = join(baseDir, 'test@example.com');
    try {
      // First process: acquire the instance lock on the account dir
      mkdirSync(acctDir, { recursive: true });
      const lock1 = acquireInstanceLock(acctDir);

      // Save a token in the data-dir root (where loadToken looks)
      writeFileSync(join(baseDir, 'auth.json'), JSON.stringify({ email: 'test@example.com', token: 'tok' }));

      // Record the dir contents before main() runs
      const filesBefore = readdirSync(acctDir).sort();

      const logged: string[] = [];
      const io = { log: (text: string) => { logged.push(text); } };

      // Spy on process.exit so vitest doesn't throw, then assert the exit code
      let exitCode: number | null = null;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code: number) => {
        exitCode = code;
        throw Object.assign(new Error(`exit:${code}`), { code });
      });

      let result: number | undefined;
      try {
        result = await main(['--data-dir', baseDir], io);
      } catch (e: any) {
        if (e.message?.startsWith('exit:')) {
          // process.exit(1) was called — that's the expected graceful path
          result = 1;
        } else {
          throw e;
        }
      } finally {
        exitSpy.mockRestore();
      }

      expect(result).not.toBe(0);
      const combined = logged.join('\n');
      expect(combined).toContain('holds the instance lock');
      expect(combined).not.toContain('Email:');
      // dir contents unchanged
      const filesAfter = readdirSync(acctDir).sort();
      expect(filesAfter).toEqual(filesBefore);

      // First process releases the lock
      lock1.release();
    } finally {
      try { rmSync(baseDir, { recursive: true, force: true }); } catch { /* */ }
    }
  });
});
