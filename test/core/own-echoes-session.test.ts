/**
 * R1 sync-3 (F206; REQUIRED-LINES section A row 7) and issue #23 (F190).
 * After a restart the server's echo of a change sent before the quit only
 * confirms that change: when the user set the changed fields again in this
 * session (the note as loaded from state.json differs, and the local copy is
 * newer than both the loaded copy and the ghost), the echo is acknowledged
 * and the user's edit goes out on its own send. A field this session did not set
 * keeps today's rule. A seeded entry carries the ghost's `sv`, and an echo
 * whose `sv` is not the ghost's version is never seeded.
 */
import { afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { trackOwnEchoes } from '../../src/core/own-echoes';
import { cleanupBattery, runScenario } from '../integration/restart-battery-rig';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
afterEach(cleanupBattery);

const BASE = 'line1\nline2';
const MK = 'line1\nline2\nMK';
type Copy = { content: string; modificationDate: number; systemTags?: string[] };

/** A fake note channel for n1: ghost at `version`, the loaded and the local copy as given. */
function setup(version: number, loadedCopy: Copy, localCopy: Copy) {
  const dir = mkdtempSync(join(tmpdir(), 'snote-sync3-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'sent-changes.json'), JSON.stringify({ n1: 'echo-ccid' }));
  const ghost = { content: BASE, modificationDate: 1000, deleted: false, systemTags: [], tags: [] };
  const message = new EventEmitter();
  const localQueue = Object.assign(new EventEmitter(), {
    sent: {} as Record<string, { ccid?: string; sv?: number }>,
  });
  const store = {
    eachGhost: (fn: (g: { key: string; version: number; data: unknown }) => void) =>
      fn({ key: 'n1', version, data: ghost }),
  };
  const channel = Object.assign(new EventEmitter(), { message, localQueue, store });
  const local = { deleted: false, systemTags: [], tags: [], ...localCopy };
  const notes = { get: (_id: string, cb: (e: unknown, o?: { data: unknown }) => void) => cb(null, { data: local }) };
  const bucket = { name: 'note', channel, store: notes };
  const loaded = new Map([['n1', { deleted: false, systemTags: [], tags: [], ...loadedCopy }]]);
  const tracker = trackOwnEchoes({ buckets: [bucket] }, dir, loaded);
  const echoMk = (sv: number) =>
    message.emit(
      'c',
      JSON.stringify([
        { id: 'n1', ccids: ['echo-ccid'], sv, ev: sv + 1, o: 'M', v: { content: { o: 'd', v: '=11\t+%0AMK' }, modificationDate: { o: 'r', v: 2000 } } },
      ])
    );
  return { localQueue, tracker, echoMk };
}

describe('R1 sync-3: the echo of a pre-quit change never undoes this session', () => {
  it('1: WHEN the edit `MK` was sent before a quit and not acknowledged, snote restarts with a prompt catch-up and the user edits n1 back to `line1\\nline2` before the echo THEN the server and the store hold content `line1\\nline2`, verdict `KEPT`', async () => {
    const o = await runScenario('T531-P1-revert');
    expect(o.server?.content).toBe(BASE);
    expect(o.store?.content).toBe(BASE);
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN n1 was loaded as `line1\\nline2\\nMK` (date 2000), its ghost at version 1 holds `line1\\nline2` (date 1000), the user set it back to `line1\\nline2` in this session (date 3000) and the echo of `MK` arrives with sv 1 THEN the in-flight n1 entry has ccid `echo-ccid` and sv `1`', () => {
    const s = setup(1, { content: MK, modificationDate: 2000 }, { content: BASE, modificationDate: 3000 });
    s.echoMk(1);
    expect(s.localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    expect(s.localQueue.sent['n1']?.sv).toBe(1);
    s.tracker.stop();
  });

  it('3: WHEN n1 was loaded as `line1\\nline2` (the save of `MK` never reached state.json), the user pins n1 in this session (date 3000) and the echo of `MK` arrives with sv 1 THEN `localQueue.sent` has no n1 entry', () => {
    const s = setup(1, { content: BASE, modificationDate: 1000 }, { content: BASE, modificationDate: 3000, systemTags: ['pinned'] });
    s.echoMk(1);
    expect('n1' in s.localQueue.sent).toBe(false);
    s.tracker.stop();
  });

  it('4: WHEN n1 was loaded as `line1\\nline2\\nMK` (date 2000) and a start-up write set the local copy to the ghost `line1\\nline2` with the ghost date 1000 (no user action) and the echo of `MK` arrives with sv 1 THEN `localQueue.sent` has no n1 entry', () => {
    const s = setup(1, { content: MK, modificationDate: 2000 }, { content: BASE, modificationDate: 1000 });
    s.echoMk(1);
    expect('n1' in s.localQueue.sent).toBe(false);
    s.tracker.stop();
  });

  it('5: WHEN the ghost for n1 is at version 1 and the echo of `MK` arrives with sv 2 while the local copy holds `line1\\nline2\\nMK` THEN `localQueue.sent` has no n1 entry', () => {
    const s = setup(1, { content: MK, modificationDate: 2000 }, { content: MK, modificationDate: 2000 });
    s.echoMk(2);
    expect('n1' in s.localQueue.sent).toBe(false);
    s.tracker.stop();
  });

  it('6: WHEN the ghost for n1 is at version 1 and the echo of `MK` arrives with sv 1 while the local copy holds `line1\\nline2\\nMK` THEN the in-flight n1 entry has ccid `echo-ccid` and sv `1`', () => {
    const s = setup(1, { content: MK, modificationDate: 2000 }, { content: MK, modificationDate: 2000 });
    s.echoMk(1);
    expect(s.localQueue.sent['n1']?.ccid).toBe('echo-ccid');
    expect(s.localQueue.sent['n1']?.sv).toBe(1);
    s.tracker.stop();
  });
});
