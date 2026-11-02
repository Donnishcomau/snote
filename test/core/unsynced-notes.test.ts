import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const writes: string[] = [];
const fullSaves: string[] = [];

vi.mock('../../src/core/secure-fs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/core/secure-fs')>();
  return {
    ...orig,
    secureWriteFileSync: (p: string, d: string) => {
      writes.push(basename(p));
      orig.secureWriteFileSync(p, d);
    },
  };
});
vi.mock('../../src/core/persistence', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/core/persistence')>();
  return {
    ...orig,
    saveState: (s: never, d: string) => {
      fullSaves.push(d);
      orig.saveState(s, d);
    },
  };
});

import { loadUnsyncedNotes, overlayUnsyncedNotes, trackUnsynced } from '../../src/core/unsynced';

const note = (content: string, modificationDate: number) => ({ content, modificationDate });

function rig(dir: string, withStateJson: boolean, stateBroken = false) {
  const notes = new Map<string, unknown>([
    ['n1', note('one', 1000)],
    ['n2', note('two', 1000)],
  ]);
  let state: any = { simperium: { pendingNotes: {} }, data: { notes } };
  let listener = () => {};
  const store = {
    getState: () => state,
    subscribe: (l: () => void) => {
      listener = l;
      return () => {};
    },
  };
  if (withStateJson) writeFileSync(join(dir, 'state.json'), '{}');
  trackUnsynced(store as never, dir, stateBroken);
  return {
    edit: (id: string, content: string, date: number) => {
      const next = new Map(state.data.notes);
      next.set(id, note(content, date));
      state = {
        simperium: { pendingNotes: { ...state.simperium.pendingNotes, [id]: {} } },
        data: { ...state.data, notes: next },
      };
      listener();
    },
    ack: (id: string) => {
      const { [id]: _gone, ...rest } = state.simperium.pendingNotes;
      state = { ...state, simperium: { pendingNotes: rest } };
      listener();
    },
  };
}

describe('#336a unsynced: a change writes the pending notes, not the whole library ()', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'snote-336a-'));
    writes.length = 0;
    fullSaves.length = 0;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('1: WHEN state.json exists and n1 goes pending THEN no full state save runs and unsynced-notes.json holds n1 as `edited` at 2000', () => {
    const r = rig(dir, true);
    r.edit('n1', 'edited', 2000);
    expect(fullSaves).toEqual([]);
    expect(JSON.parse(readFileSync(join(dir, 'unsynced-notes.json'), 'utf8'))).toEqual({
      n1: note('edited', 2000),
    });
  });

  it('2: WHEN n1 goes pending THEN unsynced-notes.json is written before unsynced.json', () => {
    const r = rig(dir, true);
    r.edit('n1', 'edited', 2000);
    expect(writes).toEqual(['unsynced-notes.json', 'unsynced.json']);
  });

  it('3: WHEN there is no state.json yet and n1 goes pending THEN exactly one full state save runs', () => {
    const r = rig(dir, false);
    r.edit('n1', 'edited', 2000);
    expect(fullSaves).toEqual([dir]);
  });

  it('4: WHEN n1 and n2 are pending and n1 is confirmed THEN unsynced-notes.json holds only n2', () => {
    const r = rig(dir, true);
    r.edit('n1', 'a', 2000);
    r.edit('n2', 'b', 2001);
    r.ack('n1');
    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'unsynced-notes.json'), 'utf8')))).toEqual(['n2']);
  });

  it('5: WHEN state.json holds n1 at 1000 and the saved copy is `edited` at 2000 THEN the overlay returns `edited` whether the record says 2000, says 1000 or lacks n1; a saved copy older than the record (1999 against 2000) and a state.json copy at 2000 change nothing', () => {
    const loaded = { data: { notes: new Map<any, unknown>([['n1', note('old', 1000)]]) } };
    const content = (o: any) => (o!.data.notes.get('n1') as { content: string }).content;
    expect(content(overlayUnsyncedNotes(loaded, { n1: 2000 }, { n1: note('edited', 2000) }))).toBe('edited');
    expect(content(overlayUnsyncedNotes(loaded, { n1: 1000 }, { n1: note('edited', 2000) }))).toBe('edited');
    expect(content(overlayUnsyncedNotes(loaded, {}, { n1: note('edited', 2000) }))).toBe('edited');
    expect(overlayUnsyncedNotes(loaded, { n1: 2000 }, { n1: note('edited', 1999) })).toBe(loaded);
    const same = { data: { notes: new Map<any, unknown>([['n1', note('already', 2000)]]) } };
    expect(overlayUnsyncedNotes(same, { n1: 2000 }, { n1: note('edited', 2000) })).toBe(same);
    writeFileSync(join(dir, 'unsynced-notes.json'), JSON.stringify({ n1: {}, n2: 42, n3: null, n4: { content: 'x' }, n5: { modificationDate: 'x', content: 'y' }, n6: { modificationDate: 9 }, n7: { content: 'z', modificationDate: null }, n8: { content: 'z', modificationDate: '' } }));
    expect(loadUnsyncedNotes(dir)).toEqual({});
    writeFileSync(join(dir, 'unsynced-notes.json'), JSON.stringify({ n6: { modificationDate: 9 } }));
    expect(loadUnsyncedNotes(dir)).toEqual({});
    expect(overlayUnsyncedNotes(loaded, {}, loadUnsyncedNotes(dir))).toBe(loaded);
  });

  it('6: WHEN n1 is pending at 2000 and a history restore replaces it by a pending copy at 500 THEN exactly one full state save runs', () => {
    const r = rig(dir, true);
    r.edit('n1', 'edited', 2000);
    expect(fullSaves).toEqual([]);
    r.edit('n1', 'restored', 500);
    expect(fullSaves).toEqual([dir]);
  });

  it('7: WHEN state.json exists but was not loadable at start and n1 goes pending THEN exactly one full state save runs and a second change runs none', () => {
    const r = rig(dir, true, true);
    r.edit('n1', 'edited', 2000);
    r.edit('n2', 'edited', 2001);
    expect(fullSaves).toEqual([dir]);
  });
});
