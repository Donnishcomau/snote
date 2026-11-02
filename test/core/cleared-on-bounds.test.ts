/**
 * Issue #243 (follow-up to the R5 guard, #222): the four allowlist rows whose
 * bound is "cleared on <event>" each have a test written for that bound. Each
 * test watches behaviour through the module's public surface, so it fails when
 * the clearing line is removed: a listener is not called after it unsubscribed,
 * a callback does not run on the second save, a queued note is not synced twice.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { afterNextSave, persistOnChange } from '../../src/core/persistence';
import { onProblem, publishProblem, resetProblemSignal } from '../../src/core/problem-signal';
import { makeStore } from '../../src/core/store';
import { dismissBanner, onBanner, publishBanner, resetBanner } from '../../src/core/update-banner';
import { BucketQueue } from '../../vendor/simplenote/state/simperium/functions/bucket-queue';
import type { EntityId } from '@vendor/types';
import type { Bucket } from 'simperium';

const eid = (id: string): EntityId => id as unknown as EntityId;

describe('issue #243 the "cleared on <event>" rows of the R5 allowlist each have a bound test', () => {
  beforeEach(() => {
    resetBanner();
    resetProblemSignal();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1: WHEN three banner listeners subscribe and two unsubscribe THEN publishBanner("0.2.8", "0.2.9") calls only the one left, and none once it unsubscribes and "0.3.0" is published', () => {
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    const offFirst = onBanner(first);
    const offSecond = onBanner(second);
    const offThird = onBanner(third);
    offFirst();
    offSecond();
    publishBanner('0.2.8', '0.2.9');
    expect(first).toHaveBeenCalledTimes(0);
    expect(second).toHaveBeenCalledTimes(0);
    expect(third).toHaveBeenCalledTimes(1);
    offThird();
    publishBanner('0.2.8', '0.3.0');
    dismissBanner();
    expect(third).toHaveBeenCalledTimes(1);
  });

  it('2: WHEN three problem listeners subscribe and two unsubscribe THEN publishProblem("disk full") calls only the one left, and none once it unsubscribes and "disk gone" is published', () => {
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    const offFirst = onProblem(first);
    const offSecond = onProblem(second);
    const offThird = onProblem(third);
    offFirst();
    offSecond();
    publishProblem('disk full');
    expect(first).toHaveBeenCalledTimes(0);
    expect(second).toHaveBeenCalledTimes(0);
    expect(third).toHaveBeenCalledTimes(1);
    expect(third).toHaveBeenCalledWith('disk full', false);
    offThird();
    publishProblem('disk gone');
    expect(third).toHaveBeenCalledTimes(1);
  });

  it('3: WHEN "note-1" and "note-2" are queued and their deadlines pass THEN each is synced once, has() is false for both, and 60 s later touch is still at 2 calls', () => {
    vi.useFakeTimers();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    const bucket = {
      name: 'note',
      isIndexing: false,
      on: vi.fn(),
      touch: vi.fn().mockResolvedValue(undefined),
    };
    const queue = new BucketQueue(bucket as unknown as Bucket<'note', unknown>);
    queue.add(eid('note-1'), Date.now() + 100);
    queue.add(eid('note-2'), Date.now() + 200);
    expect(queue.has(eid('note-1'))).toBe(true);
    expect(queue.has(eid('note-2'))).toBe(true);
    vi.advanceTimersByTime(300);
    expect(bucket.touch).toHaveBeenCalledTimes(2);
    expect(queue.has(eid('note-1'))).toBe(false);
    expect(queue.has(eid('note-2'))).toBe(false);
    vi.advanceTimersByTime(60000);
    expect(bucket.touch).toHaveBeenCalledTimes(2);
  });

  it('4: WHEN afterNextSave(fn) is registered and two saves follow THEN fn runs once, after the first save and not after the second, which writes "Edit 2"', () => {
    vi.useFakeTimers();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-cleared-on-'));
    try {
      const store = makeStore({ stubClient: {} });
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: eid('note-after-save'),
        note: { content: 'Start', systemTags: [], tags: [] },
      });
      const stop = persistOnChange(store, dir, 50);
      const fn = vi.fn();
      afterNextSave(fn);
      store.dispatch({ type: 'EDIT_NOTE', noteId: eid('note-after-save'), changes: { content: 'Edit 1' } });
      expect(fn).toHaveBeenCalledTimes(0);
      vi.advanceTimersByTime(60);
      expect(fn).toHaveBeenCalledTimes(1);
      store.dispatch({ type: 'EDIT_NOTE', noteId: eid('note-after-save'), changes: { content: 'Edit 2' } });
      vi.advanceTimersByTime(60);
      expect(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).toContain('Edit 2');
      expect(fn).toHaveBeenCalledTimes(1);
      stop();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
