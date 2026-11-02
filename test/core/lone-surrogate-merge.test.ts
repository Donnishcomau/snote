/**
 * a lone surrogate (an astral character cut in half) on either side of a
 * merge made `mergeEditorReturn` throw URIError (the sync library's `diff_toDelta`
 * runs `encodeURI`), crashing the editor close, losing an inline save and crashing
 * the start-up hand-off. Probes: sp283-prebuild/sur.txt and sur2.txt.
 *
 * Rules (the oracle below): R1 nothing remote: our edit, a lone half of ours made U+FFFD;
 * R2 nothing local: the text of the other device, as it is; R3 a lone half in the base or the
 * text of the other device: both versions, ours mended; R4 else a real merge, whole and sendable.
 */
import { describe, it, expect, vi } from 'vitest';
import { diff } from 'simperium/lib/simperium/util/change';

import { conflictBlock, MERGE_MAX_CHARS, mergeEditorReturn } from '../../src/core/editor-conflict-merge';
import { mergeEditorKeepingText, mergeKeepingText } from '../../src/core/held-lines';
import { onProblem } from '../../src/core/problem-signal';
import { requeueUnsynced, type GhostReader } from '../../src/core/requeue';
import { makeStore } from '../../src/core/store';
import { editSelectedNote, saveInlineEdit } from '../../src/tui/app-actions';
import { makeNote } from '../tui/fixtures';
import type { EntityId, Note } from '@vendor/types';

const NOTICE = 'A change from another device could not be merged automatically - both versions were kept.';
const HI = '\uD83D'; // the first half of 😀
const LO = '\uDE00'; // the second half of 😀
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const FFFD = '�';

let seed = 285;
/** mulberry32: a seeded generator, so a failure names its inputs. */
const rnd = (n: number): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
};
const PIECES = ['a', 'b', ' ', '\n', '漢', '😀', '😀', '😁', HI, LO];
const piece = (): string => PIECES[rnd(PIECES.length)];
const text = (n: number): string => Array.from({ length: n }, piece).join('');
/** An edit at any UTF-16 offset, so an astral character is often cut in half. */
const edit = (t: string): string => {
  const at = rnd(t.length + 1);
  return t.slice(0, at) + (rnd(2) === 0 ? text(1 + rnd(3)) : '') + t.slice(at + rnd(4));
};
const mend = (t: string): string => t.replace(new RegExp(LONE.source, 'g'), FFFD);
type Case = { base: string; local: string; current: string };
const cases = (n: number): Case[] =>
  Array.from({ length: n }, () => {
    const base = text(2 + rnd(8));
    return { base, local: edit(base), current: edit(base) };
  });
const show = (c: Case, got: unknown): string => JSON.stringify({ ...c, got });

/**
 * What a merge must give. `kind` says which rule applies: nothing remote (the mended
 * local side), no local edit (the server's text, as it is), a lone half in the base
 * or the server's text (both versions, our side mended), else a real merge (checked
 * only for being whole and sendable).
 */
function expected(c: Case): { kind: 'local' | 'remote' | 'both' | 'merge'; content?: string } {
  const own = c.local === c.base ? c.local : mend(c.local); // an edit we send is mended; an untouched note stays as it is
  if (c.current === c.base) return { kind: 'local', content: own };
  if (c.local === c.base) return { kind: 'remote', content: c.current };
  if (LONE.test(c.base) || LONE.test(c.current)) return { kind: 'both', content: conflictBlock(own, c.current) };
  return { kind: 'merge' };
}
/** The sync library's own step for an edit: the diff from what the server holds (`current`) to the new text. */
function sendable(current: string, content: string): boolean {
  try {
    diff({ content: current }, { content });
    return true;
  } catch {
    return false;
  }
}
/** The problems found with one result; empty when the result is right. */
function faults(c: Case, content: string, notices: number): string[] {
  const want = expected(c);
  const out: string[] = [];
  if (want.content !== undefined && content !== want.content) out.push('content');
  if (want.kind === 'merge' && LONE.test(content)) out.push('lone half left');
  if (!sendable(c.current, content)) out.push('the sync diff throws');
  if (want.kind === 'both' && notices !== 1) out.push(`notice shown ${notices} times`);
  if ((want.kind === 'local' || want.kind === 'remote') && notices !== 0) out.push('notice without a conflict');
  return out;
}
const noteStore = (content: string) => {
  const id = 'n1' as unknown as EntityId;
  const store = makeStore({ stubClient: {} });
  store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: id, note: { ...makeNote('n1', content), systemTags: [], tags: [] } } as never);
  return { store, id };
};
const contentOf = (store: ReturnType<typeof makeStore>, id: EntityId): string => store.getState().data.notes.get(id)?.content ?? '';

describe('a lone surrogate on either side of a merge never throws and never loses the text', () => {
  it('1: WHEN `2000` seeded merges of texts holding astral characters cut in half run on mergeEditorReturn THEN none throws, `conflict` is `true` for both versions and `false` when nothing is remote or nothing is local, as rules R1 to R4 say, and every result passes the sync library diff from the text of the other device', () => {
    const bad: string[] = [];
    let blocks = 0;
    for (const c of cases(2000)) {
      let r: { content: string; conflict: boolean };
      try {
        r = mergeEditorReturn(c.base, c.local, c.current);
      } catch (e) {
        bad.push(show(c, String(e)));
        continue;
      }
      const kind = expected(c).kind;
      const f = faults(c, r.content, kind === 'both' ? 1 : 0);
      if (kind === 'both' && !r.conflict) f.push('no conflict flag');
      if ((kind === 'local' || kind === 'remote') && r.conflict) f.push('a conflict flag without a conflict');
      if (kind === 'both') blocks++;
      if (f.length > 0) bad.push(show(c, { f, r }));
    }
    expect({ bad, blocksSeen: blocks > 200 }).toEqual({ bad: [], blocksSeen: true });
  });

  it('2: WHEN `300` seeded astral-cut edits come back from the external editor after another device edited THEN nothing is thrown, the note holds what R1 to R4 give, and the notice is shown `1` time for both versions and `0` times otherwise', async () => {
    const bad: string[] = [];
    for (const c of cases(300)) {
      const { store, id } = noteStore(c.base);
      const noticeCalls: string[] = [];
      const sent: string[] = [];
      let back = false; // #97 (97d): true once the editor is done and the terminal is handed back
      const spy = { ...store, dispatch: (a: { type: string; changes?: { content?: string } }) => { if (a.type === 'EDIT_NOTE') sent.push(a.changes?.content ?? ''); return store.dispatch(a as never); } } as unknown as typeof store;
      editSelectedNote({
        store: spy,
        selectedEntry: { id, note: store.getState().data.notes.get(id)! },
        setRawMode: (m) => { back = m; },
        runEditor: async () => {
          store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: id, note: { ...store.getState().data.notes.get(id)!, content: c.current } } as never);
          sent.length = 0;
          return c.local;
        },
        onEditorError: (m) => noticeCalls.push(m),
      });
      // #97 (97d): a return equal to the last text written (here the base: no local edit, R2) dispatches nothing
      await vi.waitFor(() => expect({ back, sent: sent.length }).toEqual({ back: true, sent: c.local === c.base ? 0 : 1 }), { timeout: 2000, interval: 1 });
      const f = faults(c, contentOf(store, id), noticeCalls.filter((m) => m === NOTICE).length);
      if (f.length > 0) bad.push(show(c, { f, content: contentOf(store, id) }));
    }
    expect(bad).toEqual([]);
  });

  it('3: WHEN `300` seeded astral-cut buffers are saved by the inline editor after another device edited THEN nothing is thrown, the note holds what R1 to R4 give, and the notice is shown `1` time for both versions and `0` times otherwise', () => {
    const bad: string[] = [];
    for (const c of cases(300)) {
      const { store, id } = noteStore(c.base);
      store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: id, note: { ...store.getState().data.notes.get(id)!, content: c.current } } as never);
      const noticeCalls: string[] = [];
      try {
        saveInlineEdit({ store, selectedEntry: { id, note: store.getState().data.notes.get(id)! }, base: c.base, local: c.local, onEditorError: (m) => noticeCalls.push(m) });
      } catch (e) {
        bad.push(show(c, String(e)));
        continue;
      }
      const f = faults(c, contentOf(store, id), noticeCalls.filter((m) => m === NOTICE).length);
      if (f.length > 0) bad.push(show(c, { f, content: contentOf(store, id) }));
    }
    expect(bad).toEqual([]);
  });

  it('4: WHEN `300` seeded astral-cut offline edits meet a changed server copy at start-up (requeueUnsynced) THEN nothing is thrown, the note passes the sync diff, holds no lone half except in the text of the other device, and at most `1` notice is published', async () => {
    const bad: string[] = [];
    let ran = 0;
    let withLone = 0;
    for (const c of cases(300)) {
      if (c.local === c.base) continue; // an unedited note is not re-queued
      ran++;
      if (LONE.test(c.local) || LONE.test(c.base) || LONE.test(c.current)) withLone++;
      const store = makeStore({ stubClient: {} });
      const id = 'n1' as unknown as EntityId;
      store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: id, note: makeNote('n1', c.local, { modificationDate: 2000 }) } as never);
      let caughtUp = false;
      const ghosts: GhostReader = {
        get: () => Promise.resolve({ data: makeNote('n1', caughtUp ? c.current : c.base, { modificationDate: caughtUp ? 1500 : 1000 }) as Partial<Note> }),
      };
      const seen: string[] = [];
      const off = onProblem((m) => seen.push(m));
      try {
        await requeueUnsynced(store, ghosts, async () => { caughtUp = true; });
      } catch (e) {
        bad.push(show(c, String(e)));
        continue;
      } finally {
        off();
      }
      const content = contentOf(store, id);
      const f: string[] = [];
      if (!sendable(c.current, content)) f.push('the sync diff throws');
      if (content !== c.current && LONE.test(content.split('\n\n--- conflicting change from another device ---')[0])) f.push('a lone half that is not in the text of the other device');
      if (seen.filter((m) => m.startsWith('kept both versions of ')).length > 1) f.push('more than one notice');
      if (f.length > 0) bad.push(show(c, { f, content }));
    }
    expect({ bad, ran: ran > 200, withLone: withLone > 150 }).toEqual({ bad: [], ran: true, withLone: true });
  });

  it('5: WHEN base `title\\nthe cat sat\\nend` is edited here to `title L\\nthe cat sat\\nend` and another device ends the note with a lone low half `\\uDE00` THEN mergeEditorReturn, mergeKeepingText and mergeEditorKeepingText return `conflict` `true` and the local text, the separator line and the text of the other device, whole', () => {
    const base = 'title\nthe cat sat\nend';
    const local = 'title L\nthe cat sat\nend';
    const remote = `title\nthe cat sat\nend ${LO}`;
    const want = { content: conflictBlock(local, remote), conflict: true };
    expect([mergeEditorReturn(base, local, remote), mergeKeepingText(base, local, remote), mergeEditorKeepingText(base, local, remote)]).toEqual([want, want, want]);
  });

  it('6: WHEN our edit ends with a lone low half `\\uDE00` and another device changed the title THEN `conflict` is `false` and the content is the other title with the end `\\uFFFD`', () => {
    expect(mergeEditorReturn('title\nthe cat sat\nend', `title\nthe cat sat\nend ${LO}`, 'title R\nthe cat sat\nend')).toEqual({
      content: `title R\nthe cat sat\nend ${FFFD}`,
      conflict: false,
    });
  });

  it('7: WHEN nothing came from the other device and our edit adds a lone half THEN the content is the edit with `\\uFFFD` and `conflict` is `false`, and WHEN the note already holds a lone half and we did not touch it THEN the content is the text of the other device as it is', () => {
    expect(mergeEditorReturn('ab', `a${LO}b`, 'ab')).toEqual({ content: `a${FFFD}b`, conflict: false });
    const base = `a${HI}b`;
    expect(mergeEditorReturn(base, base, `a${HI}b c`)).toEqual({ content: `a${HI}b c`, conflict: false });
  });

  it('8: WHEN a note over `50000` characters holds a lone half on each side, up to `1048576` characters, THEN the merge returns both versions with `conflict` `true` and does not throw', () => {
    const big = (tag: string) => `${'x'.repeat(50_001)}${HI}${tag}`;
    const huge = `${HI}y`.repeat(524_288);
    for (const [b, l, c] of [['x', big('L'), big('R')], ['x', huge, 'x' + huge.slice(1)]]) {
      const r = mergeEditorReturn(b, l, c);
      expect({ conflict: r.conflict, whole: r.content === conflictBlock(mend(l), c) }).toEqual({ conflict: true, whole: true });
    }
  });

  it('9: WHEN the base holds a lone low half `\\uDE00` that the other device removed (base `x\\uDE00 a`, other `x a`) and our edit appends ` b` THEN mergeEditorReturn, mergeKeepingText and mergeEditorKeepingText return `conflict` `true` and conflictBlock of our edit with `\\uFFFD` and the other device\'s text `x a`, whole', () => {
    const base = `x${LO} a`;
    const remote = 'x a';
    const local = `${base} b`;
    const want = { content: conflictBlock('x� a b', remote), conflict: true };
    expect([mergeEditorReturn(base, local, remote), mergeKeepingText(base, local, remote), mergeEditorKeepingText(base, local, remote)]).toEqual([want, want, want]);
  });

  it('10: WHEN the base holds a lone high half from the server (`a\\uD800b`), nothing came from the other device and our edit appends `c` THEN the content is `a\\uFFFDbc` with `conflict` `false`; and WHEN our edit completes the pair (`a\\uD800\\uDC00b`) THEN the content keeps the whole character `a\\u{10000}b`, not U+FFFD', () => {
    const base = 'a\uD800b';
    expect(mergeEditorReturn(base, `${base}c`, base)).toEqual({ content: 'a�bc', conflict: false });
    const r = mergeEditorReturn(base, 'a𐀀b', base);
    expect({ r, same: r.content === 'a\u{10000}b', mended: r.content.includes(FFFD) }).toEqual({ r: { content: 'a\u{10000}b', conflict: false }, same: true, mended: false });
  });

  it('11: WHEN every text of the merge is `49999`, `50000` and `50001` characters long (MERGE_MAX_CHARS is `50000`; build base `x`.repeat(n), the other device\'s text `y` plus its tail, ours = base cut at n-1 plus `\\uDE00`) and a lone low half is on our side only, or on the other device\'s side only THEN nothing throws, our side never keeps the raw half, the other device\'s text ends the block whole, and `conflict` is `false` for our half at `49999` and `50000` and `true` at `50001` or for the other device\'s half', () => {
    const got: Record<string, unknown> = {};
    for (const n of [49999, 50000, 50001]) {
      const base = 'x'.repeat(n);
      const other = 'y' + base.slice(1);
      const ours = base.slice(0, n - 1) + LO;
      expect(MERGE_MAX_CHARS).toBe(50000);
      // our half only: the other device changed the first character
      const a = mergeEditorReturn(base, ours, other);
      const aBlock = a.conflict ? a.content === conflictBlock(mend(ours), other) && a.content.endsWith(other) : true;
      got[`ours ${n}`] = { conflict: a.conflict, rawHalf: LONE.test(a.content), sendable: sendable(other, a.content), aBlock };
      // the other device's half only: ours changed the first character
      const otherHalf = base.slice(0, n - 1) + LO;
      const b = mergeEditorReturn(base, other, otherHalf);
      got[`other ${n}`] = { conflict: b.conflict, whole: b.content === conflictBlock(other, otherHalf) && b.content.endsWith(otherHalf), sendable: sendable(otherHalf, b.content) };
    }
    const mine = (conflict: boolean) => ({ conflict, rawHalf: false, sendable: true, aBlock: true });
    const theirs = { conflict: true, whole: true, sendable: true };
    expect(got).toEqual({
      'ours 49999': mine(false),
      'other 49999': theirs,
      'ours 50000': mine(false),
      'other 50000': theirs,
      'ours 50001': mine(true),
      'other 50001': theirs,
    });
  });
});
