/**
 * (#105), which parts of an offline edit the server copy
 * already holds, read by line position, not by line counts. Used by the
 * start-up hand-off (`requeue.ts`): the parts already held are not merged a
 * second time, and nothing the server holds is read as held unless its lines
 * line up.
 */

import { conflictBlock, mendOwn, mergeEditorReturn } from './editor-conflict-merge';
import { lineCounts } from './line-inclusion';
import { editNote } from '@vendor/state/data/actions';
import type { EntityId } from '@vendor/types';

// Above this many line pairs the alignment is skipped and nothing is held:
// the hand-off then merges as before (at worst a doubled line, never a loss).
const MAX_PAIRS = 4_000_000;

/**
 * For each line of `a`, the index of the line of `b` it is aligned with in a
 * longest common subsequence, or -1. `preferA` picks which side gives way on
 * a tie, so two calls show whether an alignment is ambiguous.
 */
function align(a: string[], b: string[], preferA: boolean): Int32Array | undefined {
  const map = new Int32Array(a.length).fill(-1);
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) {
    map[lo] = lo;
    lo++;
  }
  let ea = a.length;
  let eb = b.length;
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
    map[ea] = eb;
  }
  const n = ea - lo;
  const k = eb - lo;
  if (n === 0 || k === 0) return map;
  if (n * k > MAX_PAIRS) return undefined;
  const w = k + 1;
  const t = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = k - 1; j >= 0; j--) {
      t[i * w + j] = a[lo + i] === b[lo + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < k) {
    if (a[lo + i] === b[lo + j]) {
      map[lo + i] = lo + j;
      i++;
      j++;
    } else {
      const down = t[(i + 1) * w + j];
      const right = t[i * w + j + 1];
      if (down > right || (down === right && !preferA)) i++;
      else j++;
    }
  }
  return map;
}

/** Both tie-breaks, so a line counts as aligned only when it is aligned to the same line either way. */
function alignSure(a: string[], b: string[]): Int32Array | undefined {
  const x = align(a, b, true);
  const y = align(a, b, false);
  if (!x || !y) return undefined;
  return x.map((v, i) => (v === y[i] ? v : -1));
}

/**
 * The base text with the parts of the offline edit (`base` to `edited`) that
 * `current` already holds applied: an inserted line counts as held when it is
 * aligned with a line of `current` that is not itself the copy of a base
 * line, and `current` inserted nothing else at that place; a deleted base
 * line when `current` has no line aligned with it and every line inserted in
 * its place is held; an ambiguous alignment never counts. The result equals
 * `edited` when `current` holds the whole edit, and `base` when it holds none.
 */
export function heldBase(base: string, edited: string, current: string): string {
  const b = base.split('\n');
  const e = edited.split('\n');
  const c = current.split('\n');
  const be = alignSure(b, e);
  const bc = alignSure(b, c);
  const ec = alignSure(e, c);
  if (!be || !bc || !ec) return base;
  // one line of `current` counts once: a line it holds as a base line
  // is never also the copy of a line the offline edit inserted.
  const usedByBase = new Set<number>();
  for (const y of bc) if (y !== -1) usedByBase.add(y);
  const aligned = new Set(ec);
  const out: string[] = [];
  let next = 0;
  let lastKept = -1;
  let removed: number[] = [];
  for (let i = 0; i <= b.length; i++) {
    if (i < b.length && be[i] === -1) {
      removed.push(i);
      continue;
    }
    const end = i < b.length ? be[i] : e.length;
    const added: string[] = [];
    let allHeld = true;
    // #115 — the lines `current` has at this place (between the base lines on
    // either side): an insert counts as held only when every one of them lines
    // up with the offline copy, so two independent inserts of the same line (a
    // blank line) are not read as one.
    // Only when both neighbours are aligned: past a base line `current` dropped,
    // its lines there may replace that line rather than add to this place.
    const left = lastKept === -1 ? -1 : bc[lastKept];
    const right = i === b.length ? c.length : bc[i];
    let otherInsert = false;
    if ((left !== -1 || lastKept === -1) && right !== -1) for (let y = left + 1; y < right; y++) otherInsert ||= !aligned.has(y);
    for (let x = next; x < end; x++) {
      if (ec[x] !== -1 && !usedByBase.has(ec[x]) && !otherInsert) added.push(e[x]);
      else allHeld = false;
    }
    // A removal counts only when what replaced it is held too: a line both
    // sides replaced differently stays a conflict for the merge.
    for (const r of removed) if (!allHeld || bc[r] !== -1) out.push(b[r]);
    out.push(...added);
    removed = [];
    if (i < b.length) {
      out.push(b[i]);
      next = end + 1;
      lastKept = i;
    }
  }
  return out.join('\n');
}

/**
 * #115 — true when `merged` lost a change: fewer copies of a line than all
 * three copies hold plus what each side added to `base` (lost text), or more
 * copies than are left after one side removed some and the other kept them
 * (an undone removal,).
 */
export function mergeLoses(base: string, local: string, remote: string, merged: string): boolean {
  if (local === remote) return merged !== local; // #347: the same edit on both sides is kept once
  const [b, l, r, m] = [base, local, remote, merged].map(lineCounts);
  for (const line of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
    const [nb, nl, nr, nm] = [b, l, r, m].map((c) => c.get(line) ?? 0);
    if (nm < Math.min(nb, nl, nr) + Math.max(0, nl - nb) + Math.max(0, nr - nb)) return true;
    if (nl < nb !== nr < nb && nm > nl + nr - nb) return true;
  }
  return false;
}

/**
 * #115 — a line-level three-way merge: between the base lines both sides kept,
 * a stretch only one side changed takes that side, two equal changes or two
 * pure inserts at one place are both kept, and anything else is an overlap
 * (undefined). Each side's tie-break is tried both ways; the first merge with
 * no overlap wins.
 */
export function mergeLines(base: string, local: string, remote: string): string | undefined {
  const b = base.split('\n');
  const l = local.split('\n');
  const r = remote.split('\n');
  // Each side's tie-break both ways: (true, true), (true, false), (false, true), (false, false).
  for (let k = 0; k < 4; k++) {
    const bl = align(b, l, k < 2);
    const br = align(b, r, k % 2 === 0);
    if (!bl || !br) return undefined;
    // One more entry at the end: the stretch after the last base line.
    const ends = [[...bl, l.length], [...br, r.length]];
    const out: string[] = [];
    let at = [0, 0, 0];
    for (let i = 0; i <= b.length; i++) {
      const [le, re] = [ends[0][i], ends[1][i]];
      if (le === -1 || re === -1) continue;
      const B = b.slice(at[0], i).join('\n');
      const L = l.slice(at[1], le);
      const R = r.slice(at[2], re);
      const Lj = L.join('\n');
      const Rj = R.join('\n');
      if (Lj === B) out.push(...R);
      else if (Rj === B || Lj === Rj) out.push(...L);
      else if (at[0] === i) out.push(...L, ...R);
      else break;
      if (i < b.length) out.push(b[i]);
      at = [i + 1, le + 1, re + 1];
      if (i === b.length) return out.join('\n');
    }
  }
  return undefined;
}

/**
 * #115 — the hand-off's content merge, never with a change lost: the
 * character merge when `mergeLoses` finds nothing, else the line merge, else
 * both versions in one note (the conflict block, `conflict: true`).
 */
export function mergeKeepingText(base: string, edited: string, current: string): { content: string; conflict: boolean } {
  const local = mendOwn(base, edited);
  const char = mergeEditorReturn(base, local, current);
  if (char.conflict || !mergeLoses(base, local, current, char.content)) return char;
  const lines = mergeLines(base, local, current);
  return lines === undefined ? { content: conflictBlock(local, current), conflict: true } : { content: lines, conflict: false };
}

/**
 * #283 — the editor's merge, never with a change lost: the character merge when
 * `mergeLoses` finds nothing, else both versions in one note (no line merge, which is slow).
 */
export function mergeEditorKeepingText(base: string, edited: string, current: string): { content: string; conflict: boolean } {
  const local = mendOwn(base, edited);
  const char = mergeEditorReturn(base, local, current);
  return char.conflict || !mergeLoses(base, local, current, char.content) ? char : { content: conflictBlock(local, current), conflict: true };
}

/**
 * #97: the external editor's writes while it is open. write(text) merges the
 * text like the editor's return, through the same loss check (#283; base: the
 * last text written) and stores the result as the note's text; base() is that
 * last text, for the merge at close; conflicted() is true once a write's merge
 * kept both versions (the close shows the notice).
 */
export function noteWriter(
  store: { getState(): { data: { notes: Map<EntityId, { content?: string }> } }; dispatch(action: ReturnType<typeof editNote>): unknown },
  noteId: EntityId,
  initial: string,
): { write(text: string): void; base(): string; conflicted(): boolean } {
  let base = initial;
  let conflict = false;
  return {
    write(text: string): void {
      const current = store.getState().data.notes.get(noteId)?.content ?? '';
      const merged = mergeEditorKeepingText(base, text, current);
      try {
        store.dispatch(editNote(noteId, { content: merged.content }));
      } catch (err) {
        // #475: an error after the reducer applied the edit (a middleware or subscriber) still leaves the note holding the write; base follows it
        if (store.getState().data.notes.get(noteId)?.content === merged.content) {
          base = text; // #475
          conflict = conflict || merged.conflict;
        }
        throw err;
      }
      base = text; // #439: only once the note holds the write (a dispatch that throws before the reducer leaves base as it was)
      if (merged.conflict) conflict = true;
    },
    base: () => base,
    conflicted: () => conflict,
  };
}
