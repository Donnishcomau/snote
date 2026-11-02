/**
 * the editor-close and inline-save merge keeps both versions when the two
 * devices changed the same characters or one deleted a line the other edited,
 * instead of silently taking the local side. Probes come from the security review.
 */
import { describe, it, expect } from 'vitest';

import { conflictBlock } from '../../src/core/editor-conflict-merge';
import { mergeEditorKeepingText } from '../../src/core/held-lines';
import { makeStore } from '../../src/core/store';
import { editSelectedNote, saveInlineEdit } from '../../src/tui/app-actions';
import type { EntityId } from '@vendor/types';

const NOTICE = 'A change from another device could not be merged automatically - both versions were kept.';
const line = (i: number, tag: string): string => `line ${i} ${tag} lorem ipsum dolor sit amet\n`;
/** The probe note of `n` lines: every 7th line changed here (`L`), every 11th on another device (`R`). */
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
/** `n` lines; `l(i)` and `r(i)` say which lines are changed here (`L`) and on the other device (`R`). */
function dense(n: number, l: (i: number) => boolean, r: (i: number) => boolean): { base: string; local: string; remote: string } {
  let base = '';
  let local = '';
  let remote = '';
  for (let i = 0; i < n; i++) {
    base += line(i, 'b');
    local += line(i, l(i) ? 'L' : 'b');
    remote += line(i, r(i) ? 'R' : 'b');
  }
  return { base, local, remote };
}
const SAME = { base: 'title\nthe cat sat\nend', local: 'title\nthe dog sat\nend', remote: 'title\nthe cow sat\nend' };

function noteStore(content: string): { store: ReturnType<typeof makeStore>; id: EntityId } {
  const id = 'n1' as unknown as EntityId;
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'CREATE_NOTE_WITH_ID', noteId: id, note: { content, systemTags: [], tags: [] } } as never);
  return { store, id };
}

describe('an overlapping edit from another device is never overwritten silently', () => {
  it('1: WHEN base `title\\nthe cat sat\\nend` is changed to `the dog sat` here and `the cow sat` on another device and merged THEN `conflict` is `true` and the content holds `the dog sat` and `the cow sat`', () => {
    const r = mergeEditorKeepingText(SAME.base, SAME.local, SAME.remote);
    expect({ conflict: r.conflict, dog: r.content.includes('the dog sat'), cow: r.content.includes('the cow sat') }).toEqual({ conflict: true, dog: true, cow: true });
  });

  it('2: WHEN the 46 KB probe note (`1200` lines, below the merge cap) is merged THEN `conflict` is `true` and the content holds all `110` remote lines and `172` local lines', () => {
    const { base, local, remote } = probe(1200);
    const r = mergeEditorKeepingText(base, local, remote);
    expect({ conflict: r.conflict, remote: count(r.content, 'R'), local: count(r.content, 'L') }).toEqual({ conflict: true, remote: 110, local: 172 });
  });

  it('3: WHEN base `a\\nb\\nc` has the line b deleted here and edited to `B2` on another device and merged THEN `conflict` is `true` and the content holds `B2`', () => {
    const r = mergeEditorKeepingText('a\nb\nc', 'a\nc', 'a\nB2\nc');
    expect({ conflict: r.conflict, kept: r.content.includes('B2') }).toEqual({ conflict: true, kept: true });
  });

  it('4: WHEN base `a\\nb\\nc\\nd` has line a changed here and line d on another device THEN the merge is `A\\nb\\nc\\nD` with `conflict` `false`', () => {
    expect(mergeEditorKeepingText('a\nb\nc\nd', 'A\nb\nc\nd', 'a\nb\nc\nD')).toEqual({ content: 'A\nb\nc\nD', conflict: false });
  });

  it('5: WHEN base `T\\nbody` gets a line `L` appended here and `R` on another device THEN `conflict` is `false` and the content holds `L` and `R`', () => {
    const r = mergeEditorKeepingText('T\nbody', 'T\nbody\nL', 'T\nbody\nR');
    expect({ conflict: r.conflict, l: r.content.split('\n').includes('L'), r: r.content.split('\n').includes('R') }).toEqual({ conflict: false, l: true, r: true });
  });

  it('6: WHEN the external editor returns `the dog sat` after another device changed the same word to `the cow sat` THEN the note holds both versions and the notice `A change from another device could not be merged automatically - both versions were kept.` is shown `1` time', async () => {
    const { store, id } = noteStore(SAME.base);
    const notices: string[] = [];
    editSelectedNote({
      store,
      selectedEntry: { id, note: store.getState().data.notes.get(id)! },
      setRawMode: () => {},
      runEditor: async () => {
        store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: SAME.remote } } as never);
        return SAME.local;
      },
      onEditorError: (m) => notices.push(m),
    });
    await expect.poll(() => ({ notices, both: store.getState().data.notes.get(id)?.content === conflictBlock(SAME.local, SAME.remote) }), { timeout: 2000 })
      .toEqual({ notices: [NOTICE], both: true });
  });

  it('7: WHEN the inline editor saves `the dog sat` after another device changed the same word to `the cow sat` THEN the note holds both versions and the notice is shown `1` time', () => {
    const { store, id } = noteStore(SAME.base);
    const notices: string[] = [];
    store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: SAME.remote } } as never);
    saveInlineEdit({ store, selectedEntry: { id, note: store.getState().data.notes.get(id)! }, base: SAME.base, local: SAME.local, onEditorError: (m) => notices.push(m) });
    expect({ notices, both: store.getState().data.notes.get(id)?.content === conflictBlock(SAME.local, SAME.remote) }).toEqual({ notices: [NOTICE], both: true });
  });

  it('8: WHEN base `x\\nthe cat sat\\ny` gets a trailing space here (`the cat sat `) and `the cow sat` on another device THEN `conflict` is `true` and the content is both texts whole', () => {
    const [b, l, r] = ['x\nthe cat sat\ny', 'x\nthe cat sat \ny', 'x\nthe cow sat\ny'];
    expect(mergeEditorKeepingText(b, l, r)).toEqual({ content: conflictBlock(l, r), conflict: true });
  });

  it('9: WHEN base `a\\nb\\nc` is emptied here (``) and `B2` is edited on another device THEN `conflict` is `true` and the content holds `B2`', () => {
    const r = mergeEditorKeepingText('a\nb\nc', '', 'a\nB2\nc');
    expect({ conflict: r.conflict, kept: r.content.includes('B2'), whole: r.content === conflictBlock('', 'a\nB2\nc') }).toEqual({ conflict: true, kept: true, whole: true });
  });

  it('10: WHEN base `a\\r\\n😀 b\\r\\nc` is changed to `😁 b` here and `😂 b` on another device THEN `conflict` is `true` and the content is both texts whole', () => {
    const [b, l, r] = ['a\r\n😀 b\r\nc', 'a\r\n😁 b\r\nc', 'a\r\n😂 b\r\nc'];
    expect(mergeEditorKeepingText(b, l, r)).toEqual({ content: conflictBlock(l, r), conflict: true });
  });

  it('11: WHEN base `a\\nb\\nc\\nd` has line b changed here and line c on another device THEN the merge is `a\\nB\\nC\\nd` with `conflict` `false`', () => {
    expect(mergeEditorKeepingText('a\nb\nc\nd', 'a\nB\nc\nd', 'a\nb\nC\nd')).toEqual({ content: 'a\nB\nC\nd', conflict: false });
  });

  it('12: WHEN `1000` seeded random edits of both sides are merged THEN every result with `conflict` `false` holds each changed line of both sides and every result with `conflict` `true` is both texts whole', () => {
    let s = 283;
    const rnd = (n: number): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
    // no astral characters: a split pair is (a throw), not this lane
    const alph = ['a', ' ', '\t', '\r', '漢', 'é', 'x', ''];
    const edit = (t: string): string => { const at = rnd(t.length + 1); return t.slice(0, at) + alph[rnd(alph.length)] + t.slice(at + rnd(2)); };
    const bad: string[] = [];
    for (let k = 0; k < 1000; k++) {
      const n = 3 + rnd(6);
      const base = Array.from({ length: n }, (_, i) => `L${i} word`);
      const L: (string | null)[] = [...base];
      const R: (string | null)[] = [...base];
      for (let j = 0; j <= rnd(3); j++) { const i = rnd(n); L[i] = rnd(6) === 0 ? null : edit(L[i] ?? base[i]); }
      for (let j = 0; j <= rnd(3); j++) { const i = rnd(n); R[i] = rnd(6) === 0 ? null : edit(R[i] ?? base[i]); }
      const [b, l, r] = [base, L, R].map((a) => a.filter((x) => x !== null).join('\n'));
      const m = mergeEditorKeepingText(b, l, r);
      const lines = m.content.split('\n');
      const ok = m.conflict
        ? m.content === conflictBlock(l, r)
        : base.every((x, i) => (L[i] === x || L[i] === null || lines.includes(L[i]!)) && (R[i] === x || R[i] === null || lines.includes(R[i]!)));
      if (!ok) bad.push(JSON.stringify([b, l, r, m.content]));
    }
    expect(bad).toEqual([]);
  });

  it('13: WHEN the inline editor saves `the dog sat` after another device changed it to `the cow sat` THEN `EDIT_NOTE` is dispatched `1` time with both texts whole', () => {
    const { store, id } = noteStore(SAME.base);
    store.dispatch({ type: 'EDIT_NOTE', noteId: id, changes: { content: SAME.remote } } as never);
    const sent: string[] = [];
    const spy = { ...store, dispatch: (a: { type: string; changes?: { content?: string } }) => { if (a.type === 'EDIT_NOTE') sent.push(a.changes?.content ?? ''); return store.dispatch(a as never); } } as unknown as typeof store;
    saveInlineEdit({ store: spy, selectedEntry: { id, note: store.getState().data.notes.get(id)! }, base: SAME.base, local: SAME.local });
    expect(sent).toEqual([conflictBlock(SAME.local, SAME.remote)]);
  });

  it('14: WHEN the 2560-line note has every 2nd line changed here and every 3rd on another device and is merged THEN the content holds all `1280` changed local lines and all `854` changed remote lines', () => {
    const { base, local, remote } = dense(2560, (i) => i % 2 === 0, (i) => i % 3 === 0);
    const r = mergeEditorKeepingText(base, local, remote);
    expect({ local: count(r.content, 'L'), remote: count(r.content, 'R') }).toEqual({ local: 1280, remote: 854 });
  });

  it('15: WHEN the 2560-line note has every line changed on both sides and is merged THEN the content holds all `2560` changed local lines and all `2560` changed remote lines', () => {
    const { base, local, remote } = dense(2560, () => true, () => true);
    const r = mergeEditorKeepingText(base, local, remote);
    expect({ local: count(r.content, 'L'), remote: count(r.content, 'R') }).toEqual({ local: 2560, remote: 2560 });
  });

  it('16: WHEN each of the shapes (every 2nd/3rd line, every line both sides, a 512-line upper-case block against every 3rd line) is merged at 2560 lines (99 KB, above the merge cap) THEN each merge returns within `4000` ms', () => {
    const upper = (n: number): { base: string; local: string; remote: string } => {
      const d = dense(n, () => false, (i) => i % 3 === 0);
      const lo = Math.floor(n * 0.4);
      return { ...d, local: d.base.split('\n').map((l, i) => (i >= lo && i < lo + 512 ? l.toUpperCase() : l)).join('\n') };
    };
    const slow: string[] = [];
    for (const n of [2560]) {
      const shapes = [dense(n, (i) => i % 2 === 0, (i) => i % 3 === 0), dense(n, () => true, () => true), upper(n)];
      shapes.forEach((s, k) => {
        const t0 = performance.now();
        mergeEditorKeepingText(s.base, s.local, s.remote);
        const ms = Math.round(performance.now() - t0);
        if (ms >= 4000) slow.push(`${n} lines, shape ${k}: ${ms} ms`);
      });
    }
    expect(slow).toEqual([]);
  }, 20_000);
});
