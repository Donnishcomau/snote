/**
 * R1 sync-1 (F203; REQUIRED-LINES section A rows 4-6): at the start-up
 * hand-off the tag lists of a note edited while snote was closed are merged as
 * sets with the server's copy (tag identity is Simplenote's tag hash), so
 * another device's tag change made while snote was closed is kept and a tag
 * removed offline stays removed. Lines 1-5 run restart battery scenarios
 * (test/integration/restart-battery-rig.ts); line 6 drives requeueUnsynced.
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
const note = (systemTags: string[], tags: string[]) => ({ content: OFF, deleted: false, systemTags, tags });

describe('R1 restart hand-off merges tag lists', () => {
  it('1: WHEN n1 has an offline edit `OFF`, another device set tags [`home`] while snote was closed, replies are 1200 ms late and the user tags n1 `work` THEN the server and the store hold content `OFF`, tags [`home`, `work`], verdict `KEPT`', async () => {
    const o = await runScenario('S12-02-A1-tags');
    expect(o.server).toEqual(note([], ['home', 'work']));
    expect(o.store).toEqual(note([], ['home', 'work']));
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN n1 has an offline edit `OFF`, another device set system tag `markdown` while snote was closed, replies are 1200 ms late and the user pins n1 THEN the server and the store hold content `OFF`, system tags [`markdown`, `pinned`], verdict `KEPT`', async () => {
    const o = await runScenario('S12-02-A4-systemTags');
    expect(o.server).toEqual(note(['markdown', 'pinned'], []));
    expect(o.store).toEqual(note(['markdown', 'pinned'], []));
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('3: WHEN n1 has an offline edit `OFF` and an offline pin, another device set tags [`home`] while snote was closed, replies are 1200 ms late and the user tags n1 `work` THEN the server and the store hold content `OFF`, `pinned`, tags [`home`, `work`], verdict `KEPT`', async () => {
    const o = await runScenario('S12-02-O5-offline-pin-tags');
    expect(o.server).toEqual(note(['pinned'], ['home', 'work']));
    expect(o.store).toEqual(note(['pinned'], ['home', 'work']));
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('4: WHEN n1 was synced with tags [`old`, `gone`], `old` was removed while snote was closed (content edited to `OFF`), and another device meanwhile removed `gone` and added `home` THEN after the restart the server and the store hold content `OFF` and tags exactly [`home`], verdict `KEPT`', async () => {
    const o = await runScenario('TAG-1-removed-offline');
    expect(o.server).toEqual(note([], ['home']));
    expect(o.store).toEqual(note([], ['home']));
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('5: WHEN n1 was synced with tags [`Work`], while snote was closed `Work` was removed and `Home` added (content `OFF`), and another device meanwhile set tags [`work`, `home`] THEN after the restart the server and the store hold tags exactly [`home`] (same tag hash, no duplicate), verdict `KEPT`', async () => {
    const o = await runScenario('TAG-2-same-tag-hash');
    expect(o.server).toEqual(note([], ['home']));
    expect(o.store).toEqual(note([], ['home']));
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('6: WHEN n1 was synced with tags [`old`], edited to `OFF` with `old` removed while snote was closed, and the server copy after the catch-up has tags [`home`, 7, `home`, `old`] THEN requeueUnsynced resolves without throwing and n1 in the store holds content `OFF` and tags exactly [`home`] (the non-string entry and the duplicate are dropped, `old` stays removed)', async () => {
    const store = makeStore({ stubClient: {} });
    const id = 'n1' as unknown as EntityId;
    const base = makeNote('n1', 'line1\nline2', { modificationDate: 1000, tags: ['old'] });
    const current = {
      ...makeNote('n1', 'line1\nline2', { modificationDate: 1500 }),
      tags: ['home', 7, 'home', 'old'],
    } as unknown as Note;
    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: id,
      note: makeNote('n1', OFF, { modificationDate: 2000, tags: [] }),
    } as A.ActionType);
    let caughtUp = false;
    const ghosts = { get: async () => ({ data: (caughtUp ? current : base) as Partial<Note> }) };
    await expect(
      requeueUnsynced(store, ghosts, async () => {
        caughtUp = true;
      })
    ).resolves.toEqual([id]);
    const n1 = store.getState().data.notes.get(id);
    expect(n1?.content).toBe(OFF);
    expect(n1?.tags).toEqual(['home']);
  });
});
