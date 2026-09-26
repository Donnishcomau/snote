import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';

import { makeStore } from '../../src/core/store.js';
import {
  loadTombstones,
  saveTombstones,
  addTombstone,
  tombstonesToResend,
  trackDeletions,
} from '../../src/core/tombstones.js';
import { makeNote } from '../tui/fixtures.js';

import type { EntityId } from '@vendor/types';
import type { State } from '../../src/core/store';
import type * as A from '@vendor/state/action-types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'snote-tomb-'));
}

function eid(id: string): EntityId {
  return id as unknown as EntityId;
}

const note1 = makeNote('n1', 'First');
const note2 = makeNote('n2', 'Second');

describe('tombstones', () => {
  afterEach(() => {
    // cleanup handled per-test with rmSync
  });

  it('1: WHEN loadTombstones(dir) is called on an empty dir, then with tombstones.json holding "not json", then holding {"a":1} THEN each call returns [] and the empty dir still has 0 entries', () => {
    const emptyDir = makeTempDir();
    // empty dir — no file
    expect(loadTombstones(emptyDir)).toEqual([]);

    // not json
    const dir1 = makeTempDir();
    fs.writeFileSync(path.join(dir1, 'tombstones.json'), 'not json');
    expect(loadTombstones(dir1)).toEqual([]);

    // object instead of array
    const dir2 = makeTempDir();
    fs.writeFileSync(path.join(dir2, 'tombstones.json'), '{"a":1}');
    expect(loadTombstones(dir2)).toEqual([]);

    // empty dir still has 0 entries
    const entries = fs.readdirSync(emptyDir);
    expect(entries.length).toBe(0);
  });

  it('2: WHEN addTombstone(dir, "n1"), addTombstone(dir, "n2") and again addTombstone(dir, "n1") are called THEN loadTombstones(dir) equals ["n1", "n2"], the file text is ["n1","n2"], and no file in dir ends in .tmp', () => {
    const dir = makeTempDir();
    addTombstone(dir, 'n1');
    addTombstone(dir, 'n2');
    addTombstone(dir, 'n1');

    expect(loadTombstones(dir)).toEqual(['n1', 'n2']);

    const fileText = fs.readFileSync(path.join(dir, 'tombstones.json'), 'utf8');
    expect(fileText).toEqual('["n1","n2"]');

    const files = fs.readdirSync(dir);
    for (const f of files) {
      expect(f.endsWith('.tmp')).toBe(false);
    }
  });

  it('3: WHEN the list holds n1 and saveTombstones(dir, []) is called THEN loadTombstones(dir) equals [] and the file tombstones.json still exists with the text []', () => {
    const dir = makeTempDir();
    saveTombstones(dir, ['n1']);

    saveTombstones(dir, []);

    expect(loadTombstones(dir)).toEqual([]);
    const filePath = path.join(dir, 'tombstones.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const fileText = fs.readFileSync(filePath, 'utf8');
    expect(fileText).toEqual('[]');
  });

  it('4: WHEN tombstonesToResend(["n1", "n2", "n3"], ghosts) is called and ghosts.get resolves { version: 3 } for n1, { version: 0 } for n2 and { version: 1 } for n3 THEN it resolves ["n1", "n3"]', async () => {
    const ghosts: { get(id: string): Promise<{ version?: number }> } = {
      get: vi.fn().mockImplementation((id: string) => {
        if (id === 'n1') return Promise.resolve({ version: 3 });
        if (id === 'n2') return Promise.resolve({ version: 0 });
        if (id === 'n3') return Promise.resolve({ version: 1 });
        return Promise.resolve({ version: 0 });
      }),
    };

    const result = await tombstonesToResend(['n1', 'n2', 'n3'], ghosts);
    expect(result).toEqual(['n1', 'n3']);
  });

  it('5: WHEN trackDeletions(store, dir) ran and the store gets DELETE_NOTE_FOREVER for n1 THEN data.notes.size goes from 2 to 1 (the reducer still ran), n2 still has "Second", and loadTombstones(dir) equals ["n1"]', () => {
    const dir = makeTempDir();
    const store = makeStore({ stubClient: {} });

    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('n1'), note: note1 } as A.ActionType);
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('n2'), note: note2 } as A.ActionType);
    expect(store.getState().data.notes.size).toBe(2);

    trackDeletions(store, dir);

    store.dispatch({ type: 'DELETE_NOTE_FOREVER', noteId: eid('n1') } as A.ActionType);

    expect(store.getState().data.notes.size).toBe(1);
    const n2 = store.getState().data.notes.get(eid('n2'));
    expect(n2?.content).toBe('Second');
    expect(loadTombstones(dir)).toEqual(['n1']);
  });

  it('6: WHEN trackDeletions(store, dir) ran and the store gets TRASH_NOTE for n2 and REMOTE_NOTE_DELETE_FOREVER for n1 THEN data.notes.size is 1, n2 has deleted true, and tombstones.json does not exist (fs.existsSync)', () => {
    const dir = makeTempDir();
    const store = makeStore({ stubClient: {} });

    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('n1'), note: note1 } as A.ActionType);
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: eid('n2'), note: note2 } as A.ActionType);

    trackDeletions(store, dir);

    store.dispatch({ type: 'TRASH_NOTE', noteId: eid('n2') } as A.ActionType);
    store.dispatch({ type: 'REMOTE_NOTE_DELETE_FOREVER', noteId: eid('n1') } as A.ActionType);

    expect(store.getState().data.notes.size).toBe(1);
    const n2 = store.getState().data.notes.get(eid('n2'));
    expect(n2?.deleted).toBe(true);
    const tombstonePath = path.join(dir, 'tombstones.json');
    expect(fs.existsSync(tombstonePath)).toBe(false);
  });
});
