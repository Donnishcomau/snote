/**
 * #557: the hold check reads the echo itself, and only against the ghost the echo applies to.
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
const OTHER = { id: 'n1', ccids: ['other-ccid'], sv: 3, ev: 4, o: 'M', v: { tags: { o: 'r', v: ['x'] } } };

function setup(local: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'snote-f195-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'sent-changes.json'), JSON.stringify({ n1: 'echo-ccid' }));
  const message = new EventEmitter();
  const localQueue = Object.assign(new EventEmitter(), { sent: {} as Record<string, { ccid?: string }> });
  const ghostStore = {
    eachGhost: (fn: (g: { key: string; version: number; data: unknown }) => void) => fn({ key: 'n1', version: 3, data: GHOST }),
  };
  const channel = Object.assign(new EventEmitter(), { message, localQueue, store: ghostStore });
  const noteStore = {
    get: (id: string, cb: (e: unknown, o: { id: string; data: unknown }) => void) =>
      cb(null, { id, data: id === 'n1' ? local : undefined }),
  };
  const client = { buckets: [{ name: 'note', channel, store: noteStore }] };
  const tracker = trackOwnEchoes(client, dir);
  const frame = (changes: unknown[]) => message.emit('c', JSON.stringify(changes));
  return { localQueue, tracker, frame };
}

describe('#557 the hold check reads the echo, against the ghost it applies to', () => {
  it('1: WHEN one frame carries another device\'s tags change of n1 (sv 3) and then the echo of `echo-ccid` adding MK (sv 4), and the local n1 holds the tags but not MK THEN `localQueue.sent` has no n1 entry', () => {
    const { localQueue, tracker, frame } = setup({ ...GHOST, tags: ['x'] });
    frame([OTHER, { id: 'n1', ccids: ['echo-ccid'], sv: 4, ev: 5, o: 'M', v: { content: ADD_MK } }]);
    expect('n1' in localQueue.sent).toBe(false);
    tracker.stop();
  });
  it('2: WHEN the echo of `echo-ccid` adding MK (sv 3) is the first change of n1 in its frame, another device\'s tags change follows, and the local n1 holds MK THEN the in-flight n1 entry has ccid `echo-ccid`', () => {
    const { localQueue, tracker, frame } = setup({ ...GHOST, content: 'line1\nline2\nMK' });
    frame([{ id: 'n1', ccids: ['echo-ccid'], sv: 3, ev: 4, o: 'M', v: { content: ADD_MK } }, { ...OTHER, sv: 4, ev: 5 }]);
    expect(localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    tracker.stop();
  });
});
