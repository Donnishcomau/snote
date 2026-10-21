/**
 * R1 sync-6 (#93, F226). A note deleted forever just after a restart that
 * followed a quit before the server confirmed an edit stays deleted: the
 * echo of the pre-quit edit only confirms it when the note is in
 * tombstones.json (deleted forever on this machine), also when the remove is
 * already in flight or the local copy is not removed yet, so the echo never
 * re-creates the note and nothing is queued for it.
 */
import { afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { trackOwnEchoes } from '../../src/core/own-echoes';
import { cleanupBattery, runScenario } from './restart-battery-rig';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
afterEach(cleanupBattery);

const BASE = 'line1\nline2';
type Queued = { type: string; id: string };

/** A fake note channel for n1: ghost at version 1 holding BASE; optional tombstone, in-flight change and local copy (none by default). */
function setup(tombstoned: boolean, flying?: Record<string, unknown>, localCopy?: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'snote-sync6-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'sent-changes.json'), JSON.stringify({ n1: 'echo-ccid' }));
  if (tombstoned) writeFileSync(join(dir, 'tombstones.json'), JSON.stringify(['n1']));
  const ghost = { content: BASE, modificationDate: 1000, deleted: false, systemTags: [], tags: [] };
  const message = new EventEmitter();
  const queued: Queued[] = [];
  const localQueue = Object.assign(new EventEmitter(), {
    sent: {} as Record<string, { ccid?: string; o?: string } | undefined>,
    queue: (change: Queued) => queued.push(change),
  });
  if (flying) localQueue.sent['n1'] = flying;
  const store = {
    eachGhost: (fn: (g: { key: string; version: number; data: unknown }) => void) =>
      fn({ key: 'n1', version: 1, data: ghost }),
  };
  const channel = Object.assign(new EventEmitter(), { message, localQueue, store });
  const notes = { get: (_id: string, cb: (e: unknown, o?: { data: unknown }) => void) => cb(null, localCopy ? { data: localCopy } : undefined) };
  const bucket = { name: 'note', channel, store: notes };
  const loaded = new Map([['n1', { ...ghost, content: BASE + '\nMK', modificationDate: 2000 }]]);
  const tracker = trackOwnEchoes({ buckets: [bucket] }, dir, loaded);
  const echo = { id: 'n1', ccids: ['echo-ccid'], sv: 1, ev: 2, o: 'M', v: { content: { o: 'd', v: '=11\t+%0AMK' }, modificationDate: { o: 'r', v: 2000 } } };
  message.emit('c', JSON.stringify([echo]));
  return { localQueue, queued, tracker };
}

describe('R1 sync-6: delete forever just after a restart stays deleted', () => {
  it('1: WHEN the edit `MK` was sent and not acknowledged, snote quits, restarts with the catch-up 1.5 s late and the user trashes and deletes n1 forever at once THEN the server and the store hold no n1, verdict `KEPT`', async () => {
    const o = await runScenario('S226-forever-late-echo');
    expect(o.server).toBeNull();
    expect(o.store).toBeNull();
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN n1 has no local copy, is in tombstones.json, nothing is in flight and the echo of `echo-ccid` (sv 1, adds `MK`) arrives THEN the in-flight n1 entry has ccid `echo-ccid` and nothing is queued', () => {
    const s = setup(true);
    expect(s.localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    expect(s.queued).toEqual([]);
    s.tracker.stop();
  });

  it('3: WHEN n1 has no local copy, is in tombstones.json, a remove of n1 (ccid `remove-ccid`) is in flight and the echo of `echo-ccid` (sv 1, adds `MK`) arrives THEN the in-flight n1 entry has ccid `echo-ccid` and nothing is queued', () => {
    const s = setup(true, { id: 'n1', o: '-', ccid: 'remove-ccid' });
    expect(s.localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    expect(s.queued).toEqual([]);
    s.tracker.stop();
  });

  it('4: WHEN n1 has no local copy, is not in tombstones.json, nothing is in flight and the echo of `echo-ccid` (sv 1, adds `MK`) arrives THEN no n1 entry is in flight and nothing is queued', () => {
    const s = setup(false);
    expect(s.localQueue.sent['n1']).toBeUndefined();
    expect(s.queued).toEqual([]);
    s.tracker.stop();
  });

  it('5: WHEN n1 has no local copy, is not in tombstones.json, a remove of n1 (ccid `remove-ccid`) is in flight and the echo of `echo-ccid` (sv 1, adds `MK`) arrives THEN the in-flight n1 entry is still the remove with ccid `remove-ccid`', () => {
    const s = setup(false, { id: 'n1', o: '-', ccid: 'remove-ccid' });
    expect(s.localQueue.sent['n1']).toEqual({ id: 'n1', o: '-', ccid: 'remove-ccid' });
    expect(s.queued).toEqual([]);
    s.tracker.stop();
  });

  it('6: WHEN n1 is in tombstones.json, its local copy is still there, trashed (`deleted` true, content `line1\\nline2\\nMK`, date 3000), nothing is in flight and the echo of `echo-ccid` (sv 1, adds `MK`) arrives THEN the in-flight n1 entry has ccid `echo-ccid` and nothing is queued', () => {
    const s = setup(true, undefined, { content: BASE + '\nMK', modificationDate: 3000, deleted: true, systemTags: [], tags: [] });
    expect(s.localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    expect(s.queued).toEqual([]);
    s.tracker.stop();
  });
});
