/**
 * R1 sync-8 (#115, prompt start, move plus append). For a note the
 * start-up hand-off holds, the sync library applies the server copy as it is
 * and the hand-off is the one merge; that merge never loses text (character
 * merge, else line merge, else both versions in the note), and every
 * both-versions block names the note on the notice line, sanitised.
 */
import { afterEach } from 'vitest';

import { heldBase, mergeLines, mergeLoses } from '../../src/core/held-lines';
import { onProblem } from '../../src/core/problem-signal';
import { makeStore } from '../../src/core/store';
import { requeueUnsynced } from '../../src/core/requeue';
import { makeNote } from '../tui/fixtures';

import type { EntityId, Note } from '@vendor/types';
import type * as A from '@vendor/state/action-types';
import { cleanupBattery, runScenario } from './restart-battery-rig';

afterEach(cleanupBattery);

const CONFLICT = '\u001b]52;c;eA==\u0007T-OFF\nline2\n\n--- conflicting change from another device ---\nT-OTHER\nline2';

describe('R1 sync-8: one merge for a held note, and it never loses text', () => {
  it('1: WHEN n1 (`a\\nb\\nc`) was edited offline to `a\\nc\\nOFF`, another device moved b to the top and snote restarts THEN the server and the store hold content `b\\na\\nc\\nOFF`, verdict `KEPT`', async () => {
    const o = await runScenario('delete-moved');
    expect(o.server?.content).toBe('b\na\nc\nOFF');
    expect(o.store?.content).toBe('b\na\nc\nOFF');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('2: WHEN n1 (`line1\\nline2`) was edited offline by moving line2 above line1, another device appended X and snote restarts THEN the server and the store hold content `line2\\nline1\\nX`, verdict `KEPT`', async () => {
    const o = await runScenario('MOVEAPP');
    expect(o.server?.content).toBe('line2\nline1\nX');
    expect(o.store?.content).toBe('line2\nline1\nX');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('3: WHEN n1 (`line1\\nline2`) was edited offline by moving line2 above line1, another device appended X and snote restarts with a re-index THEN the server and the store hold content `line2\\nline1\\nX`, verdict `KEPT`', async () => {
    const o = await runScenario('MOVEAPP-reindex');
    expect(o.server?.content).toBe('line2\nline1\nX');
    expect(o.store?.content).toBe('line2\nline1\nX');
    expect(o.verdict).toBe('KEPT');
  }, 45000);

  it('4: WHEN heldBase (base `line1\\nline2`) is asked for the edit `line1\\nline2\\n\\nA` against `line1\\nline2\\n\\nB`, and for `line1\\nline2\\nMK\\nY` against `line1\\nline2\\nMK` THEN it returns `line1\\nline2` and `line1\\nline2\\nMK`', () => {
    expect([
      heldBase('line1\nline2', 'line1\nline2\n\nA', 'line1\nline2\n\nB'),
      heldBase('line1\nline2', 'line1\nline2\nMK\nY', 'line1\nline2\nMK'),
    ]).toEqual(['line1\nline2', 'line1\nline2\nMK']);
  });

  it('5: WHEN n1 (`T\\nline2`) was edited offline to a first line holding an OSC 52 sequence and `T-OFF`, another device changed the first line to `T-OTHER` and snote restarts THEN the server and the store hold both versions with `--- conflicting change from another device ---`, and one notice starts `kept both versions of `, contains `T-OFF` and no `\\u001b` or `\\u0007`', async () => {
    const seen: string[] = [];
    const off = onProblem((m) => seen.push(m));
    const o = await runScenario('CONFLICT-hostile-title');
    off();
    const kept = seen.filter((m) => m.startsWith('kept both versions of '));
    expect(o.server?.content).toBe(CONFLICT);
    expect(o.store?.content).toBe(CONFLICT);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toContain('T-OFF');
    expect(kept[0]).not.toContain('\u001b');
    expect(kept[0]).not.toContain('\u0007');
  }, 45000);

  it('6: WHEN mergeLines merges base `line1\\nline2`, local `line2\\nline1` and remote `line1\\nline2\\nX`, mergeLoses checks the result `c\\nOFF` of base `a\\nb\\nc`, local `a\\nc\\nOFF` and remote `b\\na\\nc`, and the result `line1\\nline2\\nline1\\nOFF` of base `line1\\nline2`, local `line1\\nline2\\nline1\\nOFF` and remote `line2` THEN they return `line2\\nline1\\nX`, `true` and `true`', () => {
    expect([
      mergeLines('line1\nline2', 'line2\nline1', 'line1\nline2\nX'),
      mergeLoses('a\nb\nc', 'a\nc\nOFF', 'b\na\nc', 'c\nOFF'),
      mergeLoses('line1\nline2', 'line1\nline2\nline1\nOFF', 'line2', 'line1\nline2\nline1\nOFF'),
    ]).toEqual(['line2\nline1\nX', true, true]);
  });

  it('7: WHEN requeueUnsynced holds n1 (offline `line1\\nline2\\nOFF`, ghost `line1\\nline2`) and waits for the catch-up THEN the note bucket\'s network-change resolver returns the base it is given (`GIVEN`) for n1 and `null` for another id, and `null` for n1 once n1 was edited in this session', async () => {
    const id = 'n1' as unknown as EntityId;
    const store = makeStore({ stubClient: {} });
    let resolver: ((id: string, data: unknown, base: unknown) => unknown) | undefined;
    (store as unknown as { client: unknown }).client = {
      buckets: [{ name: 'note', beforeNetworkChange: (fn: typeof resolver) => { resolver = fn ?? undefined; } }],
    };
    const held = makeNote('n1', 'line1\nline2\nOFF', { modificationDate: 2000 }) as unknown as Note;
    store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: id, note: held } as A.ActionType);
    const base = makeNote('n1', 'line1\nline2', { modificationDate: 1000 }) as unknown as Note;
    let release: () => void = () => {};
    const caughtUp = new Promise<void>((r) => { release = r; });
    const run = requeueUnsynced(store, { get: async () => ({ data: base as Partial<Note> }) }, () => caughtUp);
    await expect.poll(() => resolver !== undefined, { timeout: 1000 }).toBe(true);
    const before = [resolver?.('n1', {}, 'GIVEN'), resolver?.('n2', {}, 'GIVEN')];
    store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: 'line1\nline2\nOFF\nSESS' } } as A.ActionType);
    const after = resolver?.('n1', {}, 'GIVEN');
    release();
    await run;
    expect([...before, after]).toEqual(['GIVEN', null, null]);
  });
});
