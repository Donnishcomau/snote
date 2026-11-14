/**
 * #895: stopping persistOnChange is final. The stop saves once,
 * then no timer, kept state or waiting step writes: after a sign-out the
 * account's files are gone and stay gone, and a later save (another
 * account's) runs nothing the stopped one left waiting.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeStore } from '../../src/core/store';
import { afterNextSave, afterSaveCount, loadState, persistOnChange } from '../../src/core/persistence';
import { removeDrafts } from '../../src/core/editor-drafts';
import { currentProblem, resetProblemSignal } from '../../src/core/problem-signal';
import type { EntityId } from '@vendor/types';

const eid = (id: string): EntityId => id as unknown as EntityId;

function edit(store: ReturnType<typeof makeStore>, id: string, content: string): void {
  store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: eid(id), note: { content, systemTags: [], tags: [] } });
}

describe('#895 a stopped saver writes nothing more', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-895-'));
    resetProblemSignal();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetProblemSignal();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('1: WHEN an edit is pending under persistOnChange(store, dir, 500) and the stop is called THEN state.json holds the note `Last words` at once and no timer of the saver is left', () => {
    const dir = path.join(tmp, 'acct');
    const store = makeStore({ stubClient: {} });
    const stop = persistOnChange(store, dir, 500);
    const before = vi.getTimerCount();
    edit(store, 'note-1', 'Last words');
    expect(vi.getTimerCount()).toBe(before + 1);

    stop();

    expect(loadState(dir)?.data?.notes?.get(eid('note-1'))?.content).toBe('Last words');
    expect(vi.getTimerCount()).toBe(before);
  });

  it('2: WHEN the save at the stop fails (`state.json.tmp` is a directory), the folder is then removed as a sign-out does, 600 ms pass and the stop is called again THEN the folder does not exist', () => {
    const dir = path.join(tmp, 'acct');
    fs.mkdirSync(path.join(dir, 'state.json.tmp'), { recursive: true });
    const store = makeStore({ stubClient: {} });
    const stop = persistOnChange(store, dir, 500);
    edit(store, 'note-1', 'Signed-out text');

    stop();
    expect(currentProblem()).toBe('could not save notes: EISDIR');
    fs.rmSync(dir, { recursive: true, force: true });
    vi.advanceTimersByTime(600);
    stop();

    expect(fs.existsSync(dir)).toBe(false);
  });

  it('3: WHEN a step waits for the next save, the save at the stop fails, and a new saver on another folder then saves THEN the step never ran and no step is left waiting', () => {
    const dirA = path.join(tmp, 'a');
    const dirB = path.join(tmp, 'b');
    fs.mkdirSync(path.join(dirA, 'state.json.tmp'), { recursive: true });
    const storeA = makeStore({ stubClient: {} });
    const stopA = persistOnChange(storeA, dirA, 500);
    edit(storeA, 'note-1', 'Account A text');
    const step = vi.fn();
    afterNextSave(step);

    stopA();
    const storeB = makeStore({ stubClient: {} });
    const stopB = persistOnChange(storeB, dirB, 500);
    edit(storeB, 'note-2', 'Account B text');
    stopB();

    expect(loadState(dirB)?.data?.notes?.get(eid('note-2'))?.content).toBe('Account B text');
    expect(step).toHaveBeenCalledTimes(0);
    expect(afterSaveCount()).toBe(0);
  });

  it('4: WHEN a saver is stopped, a step is then handed in to wait for the next save, and a new saver on another folder saves THEN the step never ran and no step is left waiting', () => {
    const storeA = makeStore({ stubClient: {} });
    const stopA = persistOnChange(storeA, path.join(tmp, 'a'), 500);
    edit(storeA, 'note-1', 'Account A text');
    stopA();
    const step = vi.fn();
    afterNextSave(step);

    const storeB = makeStore({ stubClient: {} });
    const stopB = persistOnChange(storeB, path.join(tmp, 'b'), 500);
    edit(storeB, 'note-2', 'Account B text');
    stopB();

    expect(step).toHaveBeenCalledTimes(0);
    expect(afterSaveCount()).toBe(0);
  });

  it('5: WHEN a draft folder is handed back for removal after the saver stopped and a new saver on another folder then saves THEN the draft folder `snote-draft1` still exists', () => {
    const draft = path.join(tmp, 'a', 'drafts', 'snote-draft1');
    fs.mkdirSync(draft, { recursive: true });
    const storeA = makeStore({ stubClient: {} });
    const stopA = persistOnChange(storeA, path.join(tmp, 'a'), 500);
    stopA();
    afterNextSave(() => removeDrafts([draft]));

    const storeB = makeStore({ stubClient: {} });
    const stopB = persistOnChange(storeB, path.join(tmp, 'b'), 500);
    edit(storeB, 'note-2', 'Account B text');
    stopB();

    expect(fs.existsSync(draft)).toBe(true);
  });
});
