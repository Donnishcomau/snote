/**
 * #842: an editor that outlived a kill can still write its draft after the next start read it.
 *
 * recoverDrafts restores a draft and removes its folder only after the next state.json save. That removal
 * reads the folder again: a draft whose text or file time changed since the start read it keeps its folder,
 * and the start after that restores the newer text; so does a new draft too large to load, and a folder gone
 * meanwhile leaves the save without a problem notice. An unchanged folder is still removed after the save.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { MAX_DRAFT_BYTES, recoverDrafts, setDraftsDir, writeSource } from '../../src/core/editor-drafts';
import { AFTER_SAVE_STEP_FAILED, loadState, persistOnChange, saveState } from '../../src/core/persistence';
import { onProblem, resetProblemSignal } from '../../src/core/problem-signal';
import { makeStore } from '../../src/core/store';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;
// a whole-second file time: utimes keeps it exactly, so a write can put the read time back (the time-only case)
const T0 = 1_700_000_000;

let account = '';
beforeEach(() => {
  account = mkdtempSync(join(tmpdir(), 'editor-drafts-late-'));
  setDraftsDir(join(account, 'drafts'));
});
afterEach(() => {
  rmSync(account, { recursive: true, force: true });
  setDraftsDir(null);
  resetProblemSignal();
});

const notes = (store: ReturnType<typeof makeStore>): string[] => [...store.getState().data.notes.values()].map((n) => n.content);

// one draft folder `snote-late` holding `note.md` = <text> at file time T0; returns the folder and the draft path
function draft(text: string): { folder: string; file: string } {
  const folder = join(account, 'drafts', 'snote-late');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = join(folder, 'note.md');
  writeFileSync(file, text, { mode: 0o600 });
  utimesSync(file, T0, T0);
  return { folder, file };
}

// a start: a store from state.json (when there is one), saved by persistOnChange with a debounce no test reaches;
// recoverDrafts runs, then <between> (the still-open editor), then the save that runs the queued removal (the flush)
function start(between: () => void): { store: ReturnType<typeof makeStore>; restored: number } {
  const store = makeStore({ stubClient: {}, preloadedState: loadState(account) });
  const save = persistOnChange(store, account, 60_000);
  const restored = recoverDrafts(store);
  between();
  save();
  return { store, restored };
}

describe('#842 a write after the start read the draft', () => {
  it('1: WHEN the start restores draft `before kill` and the editor then writes `after restart` with the file time put back THEN the folder is kept after the save, and the next start restores `after restart`', () => {
    const { folder, file } = draft('before kill');
    const first = start(() => {
      writeFileSync(file, 'after restart');
      utimesSync(file, T0, T0);
    });
    expect(first.restored).toBe(1);
    expect(notes(first.store)).toEqual(['before kill']);
    expect(readFileSync(join(account, 'state.json'), 'utf-8')).toContain('before kill');
    expect(existsSync(folder)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('after restart');
    const next = start(() => {});
    expect(next.restored).toBe(1);
    expect(notes(next.store).sort()).toEqual(['after restart', 'before kill']);
    expect(existsSync(folder)).toBe(false);
  });

  it('2: WHEN the start gives draft `edited words` to note n1 (sidecar: n1 still holds `old words`) and the editor then writes the same text again (a new file time) THEN the folder is kept after the save, and the next start removes it with n1 holding `edited words` and no second note', () => {
    const seed = makeStore({ stubClient: {} });
    seed.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid('n1'), note: { content: 'old words', systemTags: [], tags: [] } } as never);
    saveState(seed.getState(), account);
    const { folder, file } = draft('edited words');
    writeSource(folder, 'n1', 'old words');
    const first = start(() => {
      writeFileSync(file, 'edited words');
      utimesSync(file, T0 + 5, T0 + 5);
    });
    expect(first.restored).toBe(1);
    expect(first.store.getState().data.notes.get(eid('n1'))?.content).toBe('edited words');
    expect(notes(first.store)).toHaveLength(1);
    expect(existsSync(folder)).toBe(true);
    const next = start(() => {});
    expect(next.restored).toBe(0);
    expect(notes(next.store)).toEqual(['edited words']);
    expect(existsSync(folder)).toBe(false);
  });

  it('3: WHEN the start restores draft `left alone` and nothing writes it again THEN the folder is removed after the save, state.json holds `left alone`, and the next start adds no second note', () => {
    const { folder } = draft('left alone');
    const first = start(() => {});
    expect(first.restored).toBe(1);
    expect(readFileSync(join(account, 'state.json'), 'utf-8')).toContain('left alone');
    expect(existsSync(folder)).toBe(false);
    const next = start(() => {});
    expect(next.restored).toBe(0);
    expect(notes(next.store)).toEqual(['left alone']);
  });

  it('4: WHEN the start restores draft `small one` and a new `.md` over MAX_DRAFT_BYTES is written after the start read THEN the folder and that file are kept after the save', () => {
    const { folder } = draft('small one');
    const big = join(folder, 'other.md');
    const first = start(() => writeFileSync(big, 'x'.repeat(MAX_DRAFT_BYTES + 1), { mode: 0o600 }));
    expect(first.restored).toBe(1);
    expect(readFileSync(join(account, 'state.json'), 'utf-8')).toContain('small one');
    expect(existsSync(folder)).toBe(true);
    expect(readFileSync(big, 'utf-8')).toHaveLength(MAX_DRAFT_BYTES + 1);
  });

  it('5: WHEN the restored folder `gone away` is removed after the start read THEN the save completes and no AFTER_SAVE_STEP_FAILED problem is published', () => {
    const { folder } = draft('gone away');
    const problems: string[] = [];
    const stop = onProblem((m) => problems.push(m));
    const first = start(() => rmSync(folder, { recursive: true, force: true }));
    stop();
    expect(first.restored).toBe(1);
    expect(readFileSync(join(account, 'state.json'), 'utf-8')).toContain('gone away');
    expect(problems.filter((m) => m.startsWith(AFTER_SAVE_STEP_FAILED))).toEqual([]);
  });
});
