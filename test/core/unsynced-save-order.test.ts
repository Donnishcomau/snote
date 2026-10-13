import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const seen: Array<{ unsyncedOnDisk: boolean }> = [];
let dirUnderTest = '';

vi.mock('../../src/core/persistence', () => ({
  saveState: vi.fn(() => {
    seen.push({ unsyncedOnDisk: existsSync(join(dirUnderTest, 'unsynced.json')) });
  }),
}));

import { trackUnsynced } from '../../src/core/unsynced';

describe('unsynced: state.json is saved before unsynced.json is rewritten (F208)', () => {
  it('1: WHEN n1 goes pending THEN saveState runs once, before unsynced.json exists, and unsynced.json then holds `n1`', () => {
    dirUnderTest = mkdtempSync(join(tmpdir(), 'snote-f208-'));
    try {
      seen.length = 0;
      let listener = () => {};
      let state = {
        simperium: { pendingNotes: {} as Record<string, unknown> },
        data: { notes: new Map([['n1', { modificationDate: 1234 }]]) },
      };
      const store = {
        getState: () => state as never,
        subscribe: (l: () => void) => {
          listener = l;
          return () => {};
        },
      };
      trackUnsynced(store, dirUnderTest);
      state = { ...state, simperium: { pendingNotes: { n1: {} } } };
      listener();
      expect(seen).toEqual([{ unsyncedOnDisk: false }]);
      expect(JSON.parse(readFileSync(join(dirUnderTest, 'unsynced.json'), 'utf8'))).toEqual({
        n1: 1234,
      });
    } finally {
      rmSync(dirUnderTest, { recursive: true, force: true });
    }
  });
});
