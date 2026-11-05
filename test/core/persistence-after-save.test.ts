/**
 * #629: the callbacks waiting for the next save each run on their own: one
 * that throws neither drops the later ones nor turns the save into
 * `could not save notes`.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeStore } from '../../src/core/store';
import { afterNextSave, afterSaveCount, loadState, persistOnChange } from '../../src/core/persistence';
import { currentProblem, resetProblemSignal } from '../../src/core/problem-signal';
import type { EntityId } from '@vendor/types';

describe('#629 a throwing save callback does not stop the others', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-629-'));
    resetProblemSignal();
  });

  afterEach(() => {
    resetProblemSignal();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('1: WHEN two callbacks wait for the next save, the first throws `sidecar write failed`, and the save runs THEN the second ran once, state.json holds the note `Saved text`, no callback is left waiting and the notice is exactly `notes saved; could not update the editor drafts` (rev2: never `could not save notes`)', () => {
    const store = makeStore({ stubClient: {} });
    const stop = persistOnChange(store, tmp, 60000);
    const ran: string[] = [];
    afterNextSave(() => {
      ran.push('first');
      throw new Error('sidecar write failed');
    });
    afterNextSave(() => ran.push('second'));
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n1' as unknown as EntityId, note: { content: 'Saved text', systemTags: [], tags: [] } });
    stop();
    expect(ran).toEqual(['first', 'second']);
    const loaded = loadState(tmp) as { data?: { notes?: Map<string, { content: string }> } };
    expect(loaded.data?.notes?.get('n1')?.content).toBe('Saved text');
    expect(afterSaveCount()).toBe(0);
    expect(currentProblem()).toBe('notes saved; could not update the editor drafts');
  });

  it('2: WHEN a callback waiting for the save throws an error with code `EACCES` and the message `Secret note text`, the save runs, and then a second save runs with a callback that does not throw THEN the first notice is exactly `notes saved; could not update the editor drafts: EACCES` (no `Secret note text`), and after the second save no notice is shown', () => {
    const store = makeStore({ stubClient: {} });
    const stop = persistOnChange(store, tmp, 0);
    afterNextSave(() => {
      throw Object.assign(new Error('Secret note text'), { code: 'EACCES' });
    });
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n1' as unknown as EntityId, note: { content: 'Secret note text', systemTags: [], tags: [] } });
    stop();
    const first = currentProblem();
    expect(first).toBe('notes saved; could not update the editor drafts: EACCES');
    expect(first).not.toContain('Secret note text');
    const stop2 = persistOnChange(store, tmp, 60000);
    let ran = 0;
    afterNextSave(() => { ran += 1; });
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: 'n2' as unknown as EntityId, note: { content: 'Other', systemTags: [], tags: [] } });
    stop2();
    expect(ran).toBe(1);
    expect(currentProblem()).toBeNull();
  });
});
