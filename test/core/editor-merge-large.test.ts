/**
 * #329: the editor-close merge on a large note. Above MERGE_MAX_CHARS the
 * character merge is not tried: both versions are kept (the conflict block
 * and its notice), in bounded time, so a 789 KB note is no longer doubled
 * silently and a 389 KB note no longer takes 11.6 s. Below the cap the merge
 * runs as before, and a result far off its two edits' length is kept as both
 * versions instead. Sizes come from the security review's probes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { MERGE_MAX_CHARS, conflictBlock, mergeEditorReturn, wholeMerge } from '../../src/core/editor-conflict-merge';
import { makeStore } from '../../src/core/store';
import { editSelectedNote } from '../../src/tui/app-actions';
import type { EntityId } from '@vendor/types';

const NOTICE = 'A change from another device could not be merged automatically - both versions were kept.';
const line = (i: number, tag: string): string => `line ${i} ${tag} lorem ipsum dolor sit amet\n`;
/** The probe's note of `n` lines: every 7th line changed here (`L`), every 11th on another device (`R`). */
function probe(n: number): { base: string; local: string; remote: string } {
  let base = '';
  let local = '';
  let remote = '';
  for (let i = 0; i < n; i++) {
    base += line(i, 'b');
    local += line(i, i % 7 === 0 ? 'L' : 'b');
    remote += line(i, i % 11 === 0 ? 'R' : 'b');
  }
  return { base, local, remote };
}
const count = (text: string, tag: string): number => text.split('\n').filter((l) => l.includes(` ${tag} `)).length;

describe('#329 a large note is merged in bounded time and never doubled silently', () => {
  it('1: WHEN the 789 KB probe note (`20000` lines) is merged THEN `conflict` is `true` and the content is exactly the conflict block of both versions, not the doubled `1577745` characters', () => {
    const { base, local, remote } = probe(20000);
    const r = mergeEditorReturn(base, local, remote);
    expect({ conflict: r.conflict, same: r.content === conflictBlock(local, remote), doubled: r.content.length === 1577745 }).toEqual({ conflict: true, same: true, doubled: false });
  });

  it('2: WHEN the 389 KB probe note (`10000` lines) is merged THEN `conflict` is `true` and the content holds the whole local text and the whole remote text (no loss)', () => {
    const { base, local, remote } = probe(10000);
    const r = mergeEditorReturn(base, local, remote);
    expect({ conflict: r.conflict, local: r.content.includes(local), remote: r.content.includes(remote) }).toEqual({ conflict: true, local: true, remote: true });
  });

  it('3: WHEN the 46 KB probe note (`1200` lines) is merged THEN `conflict` is `false`, the length is `45690` and it holds `172` local lines (below MERGE_MAX_CHARS `50000` the character merge still runs)', () => {
    const { base, local, remote } = probe(1200);
    const r = mergeEditorReturn(base, local, remote);
    expect({ cap: MERGE_MAX_CHARS, conflict: r.conflict, length: r.content.length, local: count(r.content, 'L') }).toEqual({ cap: 50000, conflict: false, length: 45690, local: 172 });
  });

  it('4: WHEN a note of about 1,900 characters is merged with a cap of `500` THEN it is kept as both versions (`conflict` `true`)', () => {
    const { base, local, remote } = probe(50);
    expect(mergeEditorReturn(base, local, remote).conflict).toBe(false);
    const r = mergeEditorReturn(base, local, remote, 500);
    expect({ conflict: r.conflict, same: r.content === conflictBlock(local, remote) }).toEqual({ conflict: true, same: true });
  });

  it('5: WHEN wholeMerge is given a doubled result (the local text followed by the remote text) THEN it is `false`, and for a result the length of its two edits it is `true`', () => {
    const { base, local, remote } = probe(500);
    expect({ doubled: wholeMerge(base, local, remote, local + remote), whole: wholeMerge(base, local, remote, local) }).toEqual({ doubled: false, whole: true });
  });

  it('6: WHEN src/core/editor-conflict-merge.ts is read THEN the character merge result passes `wholeMerge(base, local, current, merged.content)` before it is returned', () => {
    expect(readFileSync('src/core/editor-conflict-merge.ts', 'utf8')).toContain("typeof merged.content === 'string' && wholeMerge(base, local, current, merged.content)");
  });

  it('7: WHEN the external editor returns the 389 KB probe note after another device changed it THEN the note holds both versions and the notice `A change from another device could not be merged automatically - both versions were kept.` is shown `1` time', async () => {
    const { base, local, remote } = probe(10000);
    const id = 'big' as unknown as EntityId;
    const store = makeStore({ stubClient: {} });
    store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: id, note: { content: base, systemTags: [], tags: [] } } as never);
    const notices: string[] = [];
    editSelectedNote({
      store,
      selectedEntry: { id, note: store.getState().data.notes.get(id)! },
      setRawMode: () => {},
      runEditor: async () => {
        store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: remote } } as never); // the other device's change lands while the editor is open
        return local;
      },
      onEditorError: (m) => notices.push(m),
    });
    await expect.poll(() => ({ notices, both: store.getState().data.notes.get(id)?.content === conflictBlock(local, remote) }), { timeout: 2000 })
      .toEqual({ notices: [NOTICE], both: true });
  });

  it('8: WHEN the 789 KB probe note comes back unchanged here and changed on another device THEN the remote text wins with `conflict` `false` (no needless conflict above the cap)', () => {
    const { base, remote } = probe(20000);
    expect(mergeEditorReturn(base, base, remote)).toEqual({ content: remote, conflict: false });
  });

  it('9: WHEN a note of exactly `50000` characters is merged THEN `conflict` is `false`; at `50001` THEN `conflict` is `true` and the content is the conflict block', () => {
    const run = (n: number) => {
      const base = 'b'.repeat(n);
      const local = 'L' + base.slice(1);
      const remote = base.slice(0, -1) + 'R';
      return { r: mergeEditorReturn(base, local, remote), local, remote };
    };
    const at = run(50000);
    const over = run(50001);
    expect({
      atConflict: at.r.conflict,
      atContent: at.r.content === 'L' + 'b'.repeat(49998) + 'R',
      overConflict: over.r.conflict,
      overBlock: over.r.content === conflictBlock(over.local, over.remote),
    }).toEqual({ atConflict: false, atContent: true, overConflict: true, overBlock: true });
  });

  it('10: WHEN a note of `25000` emoji is merged THEN `conflict` is `false`; with `25001` emoji THEN `conflict` is `true`', () => {
    const run = (n: number) => {
      const base = '\u{1F600}'.repeat(n);
      const local = '\u{1F601}' + base.slice(2);
      const remote = base.slice(0, -2) + 'R';
      return { r: mergeEditorReturn(base, local, remote), local, remote };
    };
    const at = run(25000);
    const over = run(25001);
    expect({
      atConflict: at.r.conflict,
      atContent: at.r.content === '\u{1F601}' + '\u{1F600}'.repeat(24998) + 'R',
      overConflict: over.r.conflict,
      overBlock: over.r.content === conflictBlock(over.local, over.remote),
    }).toEqual({ atConflict: false, atContent: true, overConflict: true, overBlock: true });
  });

  it('11: WHEN a CRLF note over the cap and a note over the cap emptied on one side are merged THEN `conflict` is `true` and the content holds both texts whole', () => {
    const crlf = probe(3000);
    const c = (t: string) => t.replace(/\n/g, '\r\n');
    const [cb, cl, cr] = [c(crlf.base), c(crlf.local), c(crlf.remote)];
    const a = mergeEditorReturn(cb, cl, cr);
    const lf = probe(3000);
    const emptyLocal = mergeEditorReturn(lf.base, '', lf.remote);
    const emptyRemote = mergeEditorReturn(lf.base, lf.local, '');
    expect({
      crlf: [a.conflict, a.content === conflictBlock(cl, cr)],
      emptyLocal: [emptyLocal.conflict, emptyLocal.content === conflictBlock('', lf.remote)],
      emptyRemote: [emptyRemote.conflict, emptyRemote.content === conflictBlock(lf.local, '')],
    }).toEqual({ crlf: [true, true], emptyLocal: [true, true], emptyRemote: [true, true] });
  });

  it('12: WHEN only the remote text or only the local text is over `100000` characters THEN `conflict` is `true` and the content is the conflict block', () => {
    const base = 'title\n' + 'small note line\n'.repeat(60);
    const big = 'p'.repeat(100001);
    const r1 = mergeEditorReturn(base, 'LOCAL ' + base, base + big);
    const r2 = mergeEditorReturn(base, base + big, 'REMOTE ' + base);
    expect({
      remoteBig: [r1.conflict, r1.content === conflictBlock('LOCAL ' + base, base + big)],
      localBig: [r2.conflict, r2.content === conflictBlock(base + big, 'REMOTE ' + base)],
    }).toEqual({ remoteBig: [true, true], localBig: [true, true] });
  });
});
