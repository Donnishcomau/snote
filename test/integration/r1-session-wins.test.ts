/**
 * R1 sync-2 (F205; REQUIRED-LINES section A rows 1-3; F228): at the start-up
 * hand-off a field the user changed in this session (the store copy differs
 * from both the held offline copy and the server copy) wins over both; tag
 * lists apply the same rule per tag. A store copy overwritten with the server
 * copy is not a session change. Lines 1-3 run restart battery scenarios
 * (test/integration/restart-battery-rig.ts); lines 4-6 drive requeueUnsynced. Only a store copy newer than both copies
 * holds a session change (line 6: an older server version does not).
 */
import { afterEach } from 'vitest';
import { makeStore } from '../../src/core/store';
import { requeueUnsynced } from '../../src/core/requeue';
import { makeNote } from '../tui/fixtures';
import { cleanupBattery, runScenario } from './restart-battery-rig';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';

afterEach(cleanupBattery);

const OFF = 'line1\nline2\nOFF';
const BASE = 'line1\nline2';
const note = (deleted: boolean, systemTags: string[], tags: string[]) => ({ content: OFF, deleted, systemTags, tags });
const id = 'n1' as unknown as EntityId;

/** Run the hand-off for n1: `held` is the saved offline copy, `server` the copy after the catch-up, `atHandOff` the store copy the catch-up leaves (if any). */
async function handOff(base: Note, held: Note, server: Note, atHandOff?: Note) {
  const store = makeStore({ stubClient: {} });
  const put = (n: Note) => store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: id, note: n } as A.ActionType);
  put(held);
  let caughtUp = false;
  const ghosts = { get: async () => ({ data: (caughtUp ? server : base) as Partial<Note> }) };
  const run = requeueUnsynced(store, ghosts, async () => {
    caughtUp = true;
    if (atHandOff) put(atHandOff);
  });
  return { run, n1: () => store.getState().data.notes.get(id) };
}

describe('R1 restart hand-off keeps this session\'s changes', () => {
  it('1: WHEN n1 has an offline edit `OFF`, every reply is 1200 ms late and the user pins n1 400 ms after the start THEN the server and the store hold content `OFF`, system tags [`pinned`], verdict `KEPT`', async () => {
    const o = await runScenario('S11-01-Q8-pin-400');
    expect(o.server).toEqual(note(false, ['pinned'], []));
    expect(o.store).toEqual(note(false, ['pinned'], []));
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN n1 has an offline edit `OFF`, every reply is 1200 ms late and the user trashes n1 400 ms after the start THEN the server and the store hold content `OFF`, deleted `true`, verdict `KEPT`', async () => {
    const o = await runScenario('S11-01-Q8-trash-400');
    expect(o.server).toEqual(note(true, [], []));
    expect(o.store).toEqual(note(true, [], []));
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('3: WHEN n1 has an offline edit `OFF`, every reply is 1200 ms late and the user tags n1 `work` 400 ms after the start THEN the server and the store hold content `OFF`, tags [`work`], verdict `KEPT`', async () => {
    const o = await runScenario('S11-01-Q8-tag-400');
    expect(o.server).toEqual(note(false, [], ['work']));
    expect(o.store).toEqual(note(false, [], ['work']));
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('4: WHEN n1 was trashed, tagged `mine` and edited to `OFF` while snote was closed (synced tags [`keep`]), and the catch-up leaves the store holding the server copy (not trashed, tags [`keep`, `home`]) with a pin and the removal of `keep` made in this session THEN requeueUnsynced resolves and n1 in the store holds content `OFF`, deleted `true`, tags [`home`, `mine`], system tags [`pinned`]', async () => {
    const base = makeNote('n1', BASE, { modificationDate: 1000, tags: ['keep'] });
    const held = makeNote('n1', OFF, { modificationDate: 2000, deleted: true, tags: ['keep', 'mine'] });
    const server = makeNote('n1', BASE, { modificationDate: 1500, tags: ['keep', 'home'] });
    const atHandOff = makeNote('n1', BASE, { modificationDate: 2100, tags: ['home'], pinned: true });
    const h = await handOff(base, held, server, atHandOff);
    await expect(h.run).resolves.toEqual([id]);
    expect(h.n1()?.content).toBe(OFF);
    expect(h.n1()?.deleted).toBe(true);
    expect(h.n1()?.tags).toEqual(['home', 'mine']);
    expect(h.n1()?.systemTags).toEqual(['pinned']);
  });

  it('5: WHEN n1 was synced with tags [`old`, `\\ud800`], edited to `OFF` with `old` removed while snote was closed, and the server copy after the catch-up has tags [`home`, `\\ud800`] and system tags [`pinned`, `\\ud800`] THEN requeueUnsynced resolves without throwing and n1 in the store holds content `OFF`, tags exactly [`home`] and system tags exactly [`pinned`]', async () => {
    const base = { ...makeNote('n1', BASE, { modificationDate: 1000 }), tags: ['old', '\ud800'] } as unknown as Note;
    const held = makeNote('n1', OFF, { modificationDate: 2000, tags: [] });
    const server = {
      ...makeNote('n1', BASE, { modificationDate: 1500 }),
      tags: ['home', '\ud800'],
      systemTags: ['pinned', '\ud800'],
    } as unknown as Note;
    const h = await handOff(base, held, server);
    await expect(h.run).resolves.toEqual([id]);
    expect(h.n1()?.content).toBe(OFF);
    expect(h.n1()?.tags).toEqual(['home']);
    expect(h.n1()?.systemTags).toEqual(['pinned']);
  });

  it('6: WHEN n1 has an offline edit `OFF`, the server copy after the catch-up is not trashed, and the store at the hand-off still holds an older server version that is trashed (another device trashed then restored n1; nothing was done in this session) THEN requeueUnsynced resolves and n1 in the store holds content `OFF` and deleted `false`', async () => {
    const base = makeNote('n1', BASE, { modificationDate: 1000 });
    const held = makeNote('n1', OFF, { modificationDate: 2000 });
    const server = makeNote('n1', BASE, { modificationDate: 1500 });
    const stale = makeNote('n1', BASE, { modificationDate: 1400, deleted: true });
    const h = await handOff(base, held, server, stale);
    await expect(h.run).resolves.toEqual([id]);
    expect(h.n1()?.content).toBe(OFF);
    expect(h.n1()?.deleted).toBe(false);
  });
});
