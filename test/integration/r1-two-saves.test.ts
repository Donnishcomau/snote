/**
 * R1 sync-5 (#27, F187; #20, F181; S11-01-Q1). A save queued behind an
 * unconfirmed one before a quit lands once after the restart: the echo of the
 * first save only confirms it when the note as loaded from state.json holds
 * that save plus the later one, and the start-up hand-off does not merge again
 * a server change the offline copy already includes (also after a re-index,
 * which carries no change ids). The sent record of the pre-quit change is
 * kept until the start-up catch-up has really been applied, not only until
 * the 4 s fallback.
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
const MK = 'line1\nline2\nMK';
type Copy = { content: string; modificationDate: number };
type Queued = { type: string; id: string; object: { content?: string } };

/** A fake note channel for n1: ghost at version 1 holding BASE, nothing in flight, local and loaded copy. */
function setup(localCopy: Copy, loadedCopy: Copy) {
  const dir = mkdtempSync(join(tmpdir(), 'snote-sync5-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'sent-changes.json'), JSON.stringify({ n1: 'echo-ccid' }));
  const ghost = { content: BASE, modificationDate: 1000, deleted: false, systemTags: [], tags: [] };
  const message = new EventEmitter();
  const queued: Queued[] = [];
  const localQueue = Object.assign(new EventEmitter(), {
    sent: {} as Record<string, { ccid?: string; sv?: number }>,
    queue: (change: Queued) => queued.push(change),
  });
  const store = {
    eachGhost: (fn: (g: { key: string; version: number; data: unknown }) => void) =>
      fn({ key: 'n1', version: 1, data: ghost }),
  };
  const channel = Object.assign(new EventEmitter(), { message, localQueue, store });
  const local = { deleted: false, systemTags: [], tags: [], ...localCopy };
  const notes = { get: (_id: string, cb: (e: unknown, o?: { data: unknown }) => void) => cb(null, { data: local }) };
  const bucket = { name: 'note', channel, store: notes };
  const loaded = new Map([['n1', { ...local, ...loadedCopy }]]);
  const tracker = trackOwnEchoes({ buckets: [bucket] }, dir, loaded);
  const echo = { id: 'n1', ccids: ['echo-ccid'], sv: 1, ev: 2, o: 'M', v: { content: { o: 'd', v: '=11\t+%0AMK' }, modificationDate: { o: 'r', v: 2000 } } };
  message.emit('c', JSON.stringify([echo]));
  return { localQueue, queued, tracker };
}

describe('R1 sync-5: a save queued behind an unconfirmed one lands once after a restart', () => {
  it('1: WHEN the edit `MK` was sent and not acknowledged, a second save adding a line `Y` waits behind it, snote quits and restarts THEN the server and the store hold content `line1\\nline2\\nMK\\nY`, verdict `KEPT`', async () => {
    const o = await runScenario('S27-two-saves');
    expect(o.server?.content).toBe(MK + '\nY');
    expect(o.store?.content).toBe(MK + '\nY');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN the edit `MK` was sent and not acknowledged, a second save adding a line `Y` waits behind it, snote quits and the next start must re-index (change version unreadable) THEN the server and the store hold content `line1\\nline2\\nMK\\nY`, verdict `KEPT`', async () => {
    const o = await runScenario('S20-reindex-two-saves');
    expect(o.server?.content).toBe(MK + '\nY');
    expect(o.store?.content).toBe(MK + '\nY');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('3: WHEN the edit `MK` was sent and not acknowledged before a quit, snote restarts with the catch-up 6 s late and the user pins n1 at once THEN the server holds content `line1\\nline2\\nMK` with system tag `pinned`, verdict `KEPT`', async () => {
    const o = await runScenario('S11-01-Q1-pin');
    expect(o.server?.content).toBe(MK);
    expect(o.server?.systemTags).toContain('pinned');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('4: WHEN nothing is in flight for n1, the note as loaded and the local copy hold `line1\\nline2\\nMK\\nY` (date 3000) and the echo of `echo-ccid` (sv 1, adds `MK`, date 2000) arrives alone THEN the in-flight n1 entry has ccid `echo-ccid` and a modify of n1 with content `line1\\nline2\\nMK\\nY` is queued', () => {
    const s = setup({ content: MK + '\nY', modificationDate: 3000 }, { content: MK + '\nY', modificationDate: 3000 });
    expect(s.localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    expect(s.queued.map((q) => [q.type, q.id, q.object.content])).toEqual([['modify', 'n1', MK + '\nY']]);
    s.tracker.stop();
  });

  it('5: WHEN nothing is in flight for n1, the note as loaded and the local copy hold `line1\\nline2\\nY` (date 3000, no `MK`) and the echo of `echo-ccid` (sv 1, adds `MK`, date 2000) arrives alone THEN no n1 entry is in flight and nothing is queued', () => {
    const s = setup({ content: BASE + '\nY', modificationDate: 3000 }, { content: BASE + '\nY', modificationDate: 3000 });
    expect(s.localQueue.sent['n1']).toBeUndefined();
    expect(s.queued).toEqual([]);
    s.tracker.stop();
  });

  it('6: WHEN nothing is in flight for n1, the note as loaded and the local copy hold `line1\\nline2\\nMK\\nY` with date 1500, older than the echo of `echo-ccid` (sv 1, adds `MK`, date 2000), and the echo arrives alone THEN no n1 entry is in flight and nothing is queued', () => {
    const s = setup({ content: MK + '\nY', modificationDate: 1500 }, { content: MK + '\nY', modificationDate: 1500 });
    expect(s.localQueue.sent['n1']).toBeUndefined();
    expect(s.queued).toEqual([]);
    s.tracker.stop();
  });
});
