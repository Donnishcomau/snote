// OMARCHY: boundary cast — the vendored simperium util module is untyped JS;
// reuse its own diff/transform/apply primitives rather than reimplementing them.
import { diff, transform, apply } from 'simperium/lib/simperium/util/change';

type Patch = Record<string, unknown>;

/**
 * merge what the external editor returned against a remote change that
 * landed in the store while the editor was open, so neither side is silently
 * dropped by EDIT_NOTE's last-write-wins on `content`.
 */
export const conflictBlock = (local: string, current: string): string => `${local}\n\n--- conflicting change from another device ---\n${current}`;

/**
 * #329: above this many characters in any of the three texts the character
 * merge is not tried (it took 11.6 s on 389 KB and doubled a 789 KB note):
 * both versions are kept, with the notice.
 */
export const MERGE_MAX_CHARS = 50_000;

/**
 * #329: false when a character merge came back far longer or shorter than its
 * two edits allow (the 789 KB result held both texts in full, unflagged).
 */
export function wholeMerge(base: string, local: string, current: string, merged: string): boolean {
  const expected = current.length + local.length - base.length;
  return Math.abs(merged.length - expected) <= Math.max(1024, Math.max(base.length, local.length, current.length) / 4);
}

/**
 * #285: a lone surrogate (half of an astral character) cannot go through the sync
 * library's diff: it throws on a low half and drops a high one. The side we send
 * (the edit; not the base it is compared with) has its halves made U+FFFD; the
 * server's text is kept as it is.
 * proof: test/core/lone-surrogate-merge.test.ts
 */
export const mendOwn = (base: string, own: string): string =>
  own === base ? own : own.replace(/\p{Cs}/gu, '\uFFFD');

export function mergeEditorReturn(
  base: string,
  edited: string,
  current: string,
  maxChars: number = MERGE_MAX_CHARS, // test seam; the product uses MERGE_MAX_CHARS
): { content: string; conflict: boolean } {
  const local = mendOwn(base, edited);
  // nothing remote arrived while the editor was open: keep the local edit
  if (current === base) {
    return { content: local, conflict: false };
  }

  // no local edit to lose: the remote version wins cleanly
  if (local === base) {
    return { content: current, conflict: false };
  }

  // #347: both sides made the same edit: it is kept once (a lone half in the base keeps both, #285)
  if (local === current && !/\p{Cs}/u.test(base)) {
    return { content: current, conflict: false };
  }

  if (Math.max(base.length, local.length, current.length) > maxChars || /\p{Cs}/u.test(`${base} ${current}`)) {
    return { content: conflictBlock(local, current), conflict: true };
  }

  const b = { content: base };
  const l = { content: local };
  const c = { content: current };

  const localDiff = diff(b, l) as Patch;
  const remoteDiff = diff(b, c) as Patch;

  let merged: { content?: string } | undefined;
  try {
    const transformed = transform(localDiff, remoteDiff, b);
    if (transformed && Object.keys(transformed).length > 0) {
      merged = apply(transformed, c) as { content?: string };
    }
  } catch {
    merged = undefined;
  }

  if (merged && typeof merged.content === 'string' && wholeMerge(base, local, current, merged.content)) {
    return { content: merged.content, conflict: false };
  }

  // unmergeable conflict (transform came back empty): keep both versions
  return {
    content: conflictBlock(local, current),
    conflict: true,
  };
}
