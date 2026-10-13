/**
 * T529 — an echo is seeded as our own only when the local note holds it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { trackOwnEchoes } from '../../src/core/own-echoes';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const GHOST = { content: 'line1\nline2', deleted: false, systemTags: [], tags: [] };
const ADD_MK = { o: 'd', v: '=11\t+%0AMK' };
const TRASH = { o: 'r', v: true };

function setup(local: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'snote-t529-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'sent-changes.json'), JSON.stringify({ n1: 'echo-ccid' }));
  const message = new EventEmitter();
  const localQueue = Object.assign(new EventEmitter(), { sent: {} as Record<string, { ccid?: string }> });
  const ghostStore = {
    eachGhost: (fn: (g: { key: string; data: unknown }) => void) => fn({ key: 'n1', data: GHOST }),
  };
  const channel = Object.assign(new EventEmitter(), { message, localQueue, store: ghostStore });
  const noteStore = {
    get: (id: string, cb: (e: unknown, o: { id: string; data: unknown }) => void) =>
      cb(null, { id, data: id === 'n1' ? local : undefined }),
  };
  const client = { buckets: [{ name: 'note', channel, store: noteStore }] };
  const tracker = trackOwnEchoes(client, dir);
  const echo = (v: Record<string, unknown>) =>
    message.emit('c', JSON.stringify([{ id: 'n1', ccids: ['echo-ccid'], sv: 3, ev: 4, o: 'M', v }]));
  return { localQueue, tracker, echo };
}

describe('T529 an echo is our own only when the local note holds it', () => {
  it('1: WHEN the local n1 content is `line1\\nline2\\nMK` and an echo adding MK arrives THEN the in-flight n1 entry has ccid `echo-ccid`', () => {
    const { localQueue, tracker, echo } = setup({ ...GHOST, content: 'line1\nline2\nMK' });
    echo({ content: ADD_MK });
    expect(localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    tracker.stop();
  });
  it('2: WHEN the local n1 content is `line1\\nline2` and an echo adding MK arrives THEN `localQueue.sent` has no n1 entry', () => {
    const { localQueue, tracker, echo } = setup({ ...GHOST });
    echo({ content: ADD_MK });
    expect('n1' in localQueue.sent).toBe(false);
    tracker.stop();
  });
  it('3: WHEN the local n1 has deleted true and a trash echo arrives THEN the in-flight n1 entry has ccid `echo-ccid`', () => {
    const { localQueue, tracker, echo } = setup({ ...GHOST, deleted: true });
    echo({ deleted: TRASH });
    expect(localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    tracker.stop();
  });
  it('4: WHEN the local n1 has deleted false and a trash echo arrives THEN `localQueue.sent` has no n1 entry', () => {
    const { localQueue, tracker, echo } = setup({ ...GHOST });
    echo({ deleted: TRASH });
    expect('n1' in localQueue.sent).toBe(false);
    tracker.stop();
  });
  it('5: WHEN one echo adds MK and trashes, and the local n1 holds MK with deleted false THEN `localQueue.sent` has no n1 entry', () => {
    const { localQueue, tracker, echo } = setup({ ...GHOST, content: 'line1\nline2\nMK' });
    echo({ content: ADD_MK, deleted: TRASH });
    expect('n1' in localQueue.sent).toBe(false);
    tracker.stop();
  });
  it('6: WHEN the local n1 content is `line1\\nline2\\nMK` and the echo\'s content delta is `=999` THEN emitting it does not throw and `localQueue.sent` has no n1 entry', () => {
    const { localQueue, tracker, echo } = setup({ ...GHOST, content: 'line1\nline2\nMK' });
    expect(() => echo({ content: { o: 'd', v: '=999' } })).not.toThrow();
    expect('n1' in localQueue.sent).toBe(false);
    tracker.stop();
  });
});
