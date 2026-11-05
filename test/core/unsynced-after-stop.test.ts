/**
 * #693: after a logout or quit stops the unsynced tracker, the start-up re-send can still finish and call `settle()`.
 * A stopped tracker must write nothing: no state.json, unsynced.json or unsynced-notes.json comes back (with note text)
 * in a data folder the logout emptied. Test 2 is the control: the same fixture, not stopped, does write.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { trackUnsynced } from '../../src/core/unsynced';

const FILES = ['state.json', 'unsynced.json', 'unsynced-notes.json'];
let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unsynced-after-stop-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** n1 `secret text` is carried in unsynced.json and no longer pending, so `settle()` changes the record and writes. */
function rig() {
  writeFileSync(join(dir, 'unsynced.json'), JSON.stringify({ n1: 1000 }));
  const notes = new Map<string, unknown>([['n1', { content: 'secret text', modificationDate: 1000 }]]);
  const state = { simperium: { pendingNotes: {} }, data: { notes } };
  const store = { getState: () => state as never, subscribe: () => () => undefined };
  return trackUnsynced(store, dir);
}
const onDisk = (): string[] => FILES.filter((f) => existsSync(join(dir, f)));

describe('#693 a stopped unsynced tracker writes no file', () => {
  it('1: WHEN the tracker is stopped, the logout removes the account files and settle() then runs THEN none of state.json, unsynced.json, unsynced-notes.json is on disk', () => {
    const tracker = rig();
    tracker.stop();
    for (const f of FILES) rmSync(join(dir, f), { force: true });
    tracker.settle();
    expect(onDisk()).toEqual([]);
  });

  it('2: WHEN the same tracker is not stopped and settle() runs after the files were removed THEN it writes state.json, unsynced.json and unsynced-notes.json (the fixture reaches the writer)', () => {
    const tracker = rig();
    for (const f of FILES) rmSync(join(dir, f), { force: true });
    tracker.settle();
    expect(onDisk()).toEqual(FILES);
    tracker.stop();
  });
});
