/**
 * #637: the `w` prompt in <App>: the prefilled path can be edited (name and
 * folder) and Enter exports there; Escape writes nothing; a missing
 * folder gives the fixed notice and writes nothing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { render } from 'ink-testing-library';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { makeNote } from './fixtures';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';
import type { EntityId } from '@vendor/types';

const LEFT = '\x1b[D';
const BS = '\x7f';
const strip = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '');
const prev = process.env.XDG_DOCUMENTS_DIR;
let docs = '';
let r: ReturnType<typeof render> | null = null;
afterEach(() => {
  r?.unmount();
  r = null;
  if (prev === undefined) delete process.env.XDG_DOCUMENTS_DIR;
  else process.env.XDG_DOCUMENTS_DIR = prev;
  rmSync(docs, { recursive: true, force: true });
});

async function openExport() {
  docs = mkdtempSync(join(tmpdir(), 'export-prompt-'));
  process.env.XDG_DOCUMENTS_DIR = docs;
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: 'w1' as unknown as EntityId, note: makeNote('w1', '# Plan\nstep 1', { creationDate: 1000, modificationDate: 1000 }) as never });
  r = render(<App store={store} width={200} height={24} />);
  await waitForInput(r.stdin);
  await waitForFrame(r.lastFrame, 'Plan');
  r.stdin.write('\t');
  r.stdin.write('w');
  await waitForFrame(r.lastFrame, `export: ${join(docs, 'Plan.md')}`);
  return r;
}

describe('#637 the export prompt path is editable', () => {
  it('1: WHEN `w` opens the prompt and Left x3, Backspace x4, `Todo` and Enter are typed THEN `Todo.md` is written in the documents dir with the note text and the frame says `exported:`', async () => {
    const a = await openExport();
    for (let i = 0; i < 3; i++) a.stdin.write(LEFT);
    for (let i = 0; i < 4; i++) a.stdin.write(BS);
    await waitForFrame(a.lastFrame, `export: ${join(docs, '.md')}`);
    a.stdin.write('Todo');
    await waitForFrame(a.lastFrame, `export: ${join(docs, 'Todo.md')}`);
    a.stdin.write('\r');
    await waitForFrame(a.lastFrame, (f) => strip(f).includes(`exported: ${join(docs, 'Todo.md')}`));
    expect(readFileSync(join(docs, 'Todo.md'), 'utf8')).toBe('# Plan\nstep 1');
    expect(readdirSync(docs)).toEqual(['Todo.md']);
  });

  it('2: WHEN `w` opens the prompt and Escape is pressed, unchanged or after a Backspace, THEN the prompt closes, the documents dir stays empty and the frame never says `exported:`', async () => {
    for (const edit of [false, true]) {
      const a = await openExport();
      if (edit) {
        a.stdin.write(BS);
        await waitForFrame(a.lastFrame, `export: ${join(docs, 'Plan.m')}`);
      }
      a.stdin.write('\x1b');
      const f = await waitForFrame(a.lastFrame, (fr) => !fr.includes('export:'));
      expect(f).not.toContain('exported:');
      expect(readdirSync(docs)).toEqual([]);
      a.unmount();
      r = null;
      rmSync(docs, { recursive: true, force: true });
    }
  });

  it('3: WHEN the line is cleared with Ctrl+U and a path in a missing folder is typed THEN Enter shows `export failed: folder does not exist:` and nothing is written', async () => {
    const a = await openExport();
    a.stdin.write('\x15');
    await waitForFrame(a.lastFrame, (f) => /export: *$/m.test(strip(f)));
    a.stdin.write(`${docs}/missing/x.md`);
    await waitForFrame(a.lastFrame, `export: ${docs}/missing/x.md`);
    a.stdin.write('\r');
    await waitForFrame(a.lastFrame, (f) => strip(f).includes(`export failed: folder does not exist: ${docs}/missing/`));
    expect(existsSync(join(docs, 'missing'))).toBe(false);
    expect(readdirSync(docs)).toEqual([]);
  });
});
