import { describe, expect, it } from 'vitest';
import { makeStore } from '../../src/core/store';
import { revisionLabel, revisionsOf } from '../../src/core/history';
import { makeNote } from '../tui/fixtures';
import type { EntityId } from '@vendor/types';

const id = 'n1' as EntityId;

describe('#17 F244 malformed revisions', () => {
  it('1: WHEN a version has modificationDate NaN, "x", undefined, `1e20` or `-1e16` THEN revisionLabel returns a label with `unknown date` and the title, and WHEN versions hold content `42` or `{}` THEN revisionsOf leaves them out and keeps the text versions', () => {
    for (const date of [Number.NaN, 'x', undefined, 1e20, -1e16]) {
      const note = makeNote('n1', 'Title here');
      (note as unknown as Record<string, unknown>).modificationDate = date;
      const label = revisionLabel({ version: 4, note });
      expect(label).toContain('unknown date');
      expect(label).toContain('Title here');
    }
    const store = makeStore({ stubClient: {} });
    const bad42 = makeNote('n1', 'x');
    (bad42 as unknown as Record<string, unknown>).content = 42;
    const badObj = makeNote('n1', 'x');
    (badObj as unknown as Record<string, unknown>).content = {};
    store.dispatch({
      type: 'LOAD_REVISIONS',
      noteId: id,
      revisions: [[1, makeNote('n1', 'keep one')], [2, bad42], [3, badObj], [4, makeNote('n1', 'keep two')]],
    } as never);
    expect(revisionsOf(store.getState(), id).map((r) => r.version)).toEqual([4, 1]);
  });
});
