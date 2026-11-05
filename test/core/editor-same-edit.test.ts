/**
 * #347: when both sides made the same edit (the editor returned exactly the text that
 * reached the store from another device), the merge keeps that text once, with no conflict
 * block and no notice, at every size. Different edits still merge or keep both versions.
 */
import { describe, expect, it } from 'vitest';

import { conflictBlock, MERGE_MAX_CHARS, mergeEditorReturn } from '../../src/core/editor-conflict-merge';
import { mergeEditorKeepingText, mergeKeepingText } from '../../src/core/held-lines';

const BASE = 'Groceries\nmilk\nbread';
const SAME = 'Groceries\nmilk\nbread\neggs';

describe('#347 the same edit on both sides is kept once', () => {
  it('1: WHEN the editor returns `Groceries\\nmilk\\nbread\\neggs` and the store already holds that text from another device THEN the merge is exactly that text with conflict `false`', () => {
    expect(mergeEditorReturn(BASE, SAME, SAME)).toEqual({ content: SAME, conflict: false });
  });

  it('2: WHEN both sides hold the same edit of a note longer than MERGE_MAX_CHARS (`60000` characters) THEN the merge is that text once with conflict `false`', () => {
    const base = 'x'.repeat(60_000);
    const same = `${base}\nadded on both`;
    const r = mergeEditorReturn(base, same, same, MERGE_MAX_CHARS);
    expect({ conflict: r.conflict, once: r.content === same }).toEqual({ conflict: false, once: true });
  });

  it('3: WHEN the hand-off merge and the editor merge get the same edit on both sides THEN each returns that text once with conflict `false`', () => {
    expect({ handOff: mergeKeepingText(BASE, SAME, SAME), editor: mergeEditorKeepingText(BASE, SAME, SAME) })
      .toEqual({ handOff: { content: SAME, conflict: false }, editor: { content: SAME, conflict: false } });
  });

  it('4: WHEN the two sides made different edits of a note longer than MERGE_MAX_CHARS THEN the result is still the conflict block of both versions', () => {
    const base = 'x'.repeat(60_000);
    const local = `${base}\nlocal line`;
    const remote = `${base}\nremote line`;
    expect(mergeEditorReturn(base, local, remote)).toEqual({ content: conflictBlock(local, remote), conflict: true });
  });
});
