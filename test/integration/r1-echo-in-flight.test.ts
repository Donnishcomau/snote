/**
 * R1 sync-4 (#28, F194; REQUIRED-LINES section A row 8 and section D).
 * After a restart the server's echo of a change sent before the quit only
 * confirms that change, also when the user acted on the note at once: a local
 * modificationDate later than the echo's counts as held, an in-flight change
 * from the echo's own source version (which the server rejects) does not block
 * the seed, and what the user changed on top goes out on its own send. When a
 * later change for the note follows in the same frame, nothing is seeded over
 * the library's in-flight change. The start-up hand-off reads the offline edit
 * from the note as loaded from state.json.
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
type Copy = { content: string; modificationDate: number; systemTags?: string[] };
type Queued = { type: string; id: string; object: { systemTags?: string[] } };

/** A fake note channel for n1: ghost at version 1 holding BASE, the given in-flight entry, local and loaded copy. */
function setup(inFlight: { ccid: string; sv: number } | undefined, localCopy: Copy, loadedCopy?: Copy) {
  const dir = mkdtempSync(join(tmpdir(), 'snote-sync4-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'sent-changes.json'), JSON.stringify({ n1: 'echo-ccid' }));
  const ghost = { content: BASE, modificationDate: 1000, deleted: false, systemTags: [], tags: [] };
  const message = new EventEmitter();
  const queued: Queued[] = [];
  const localQueue = Object.assign(new EventEmitter(), {
    sent: (inFlight ? { n1: { id: 'n1', o: 'M', v: {}, ...inFlight } } : {}) as Record<
      string,
      { ccid?: string; sv?: number }
    >,
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
  const other = { id: 'n1', ccids: ['other-ccid'], sv: 2, ev: 3, o: 'M', v: { content: { o: 'd', v: '=14\t+%0AOTHER' } } };
  const emit = (withOther: boolean) => message.emit('c', JSON.stringify(withOther ? [echo, other] : [echo]));
  return { localQueue, queued, tracker, emit };
}

describe('R1 sync-4: an action just after a restart never doubles the pre-quit change', () => {
  it('1: WHEN the edit `MK` was sent before a quit and not acknowledged, snote restarts with every reply 500 ms late and the user edits n1 back to `line1\\nline2` at once THEN the server and the store hold content `line1\\nline2`, verdict `KEPT`', async () => {
    const o = await runScenario('D1-5-undo-edit');
    expect(o.server?.content).toBe(BASE);
    expect(o.store?.content).toBe(BASE);
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN the edit `MK` was sent before a quit and not acknowledged, snote restarts with every reply 500 ms late and the user adds a line `X` at once THEN the server and the store hold content `line1\\nline2\\nMK\\nX`, verdict `KEPT`', async () => {
    const o = await runScenario('D1-3-edit');
    expect(o.server?.content).toBe(MK + '\nX');
    expect(o.store?.content).toBe(MK + '\nX');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('3: WHEN the edit `MK` was sent before a quit and not acknowledged, n1 is pinned in a session with no server, and snote restarts online THEN the server holds content `line1\\nline2\\nMK` with system tag `pinned`, verdict `KEPT`', async () => {
    const o = await runScenario('T531-P4-offline-pin');
    expect(o.server?.content).toBe(MK);
    expect(o.server?.systemTags).toContain('pinned');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('4: WHEN n1 is in flight with ccid `inflight-ccid` from sv 1, the local copy holds `line1\\nline2\\nMK` pinned (date 3000) and the echo of `echo-ccid` (sv 1, date 2000) is the only change for n1 in its frame THEN the in-flight n1 entry has ccid `echo-ccid` and a modify of n1 with system tag `pinned` is queued', () => {
    const s = setup({ ccid: 'inflight-ccid', sv: 1 }, { content: MK, modificationDate: 3000, systemTags: ['pinned'] });
    s.emit(false);
    expect(s.localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    expect(s.queued.map((q) => [q.type, q.id, q.object.systemTags])).toEqual([['modify', 'n1', ['pinned']]]);
    s.tracker.stop();
  });

  it('5: WHEN n1 is in flight with ccid `inflight-ccid` from sv 1, n1 was loaded as `line1\\nline2\\nMK` (date 2000), the user set it back to `line1\\nline2` in this session (date 3000) and the echo of `echo-ccid` (sv 1) arrives in a frame that also carries a later change of n1 from another device THEN the in-flight n1 entry keeps ccid `inflight-ccid` and nothing is queued', () => {
    const s = setup({ ccid: 'inflight-ccid', sv: 1 }, { content: BASE, modificationDate: 3000 }, { content: MK, modificationDate: 2000 });
    s.emit(true);
    expect(s.localQueue.sent['n1']?.ccid).toBe('inflight-ccid');
    expect(s.queued).toEqual([]);
    s.tracker.stop();
  });

  it('6: WHEN nothing is in flight for n1, the local copy holds `line1\\nline2\\nMK` (date 3000) and the echo of `echo-ccid` (sv 1, date 2000) arrives alone THEN the in-flight n1 entry has ccid `echo-ccid` and nothing is queued', () => {
    const s = setup(undefined, { content: MK, modificationDate: 3000 });
    s.emit(false);
    expect(s.localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    expect(s.queued).toEqual([]);
    s.tracker.stop();
  });
});
