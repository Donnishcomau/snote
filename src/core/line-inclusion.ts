/**
 * Line-count inclusion of one text edit in another copy, shared by the
 * start-up hand-off (`requeue.ts`) and the restart echo check
 * (`own-echoes.ts`).
 */

function lineCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of text.split('\n')) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

/** True when every line of `edited` appears in `current` in the same order. */
function inOrder(edited: string, current: string): boolean {
  const have = current.split('\n');
  let at = 0;
  for (const line of edited.split('\n')) {
    while (at < have.length && have[at] !== line) at++;
    if (at === have.length) return false;
    at++;
  }
  return true;
}

/**
 * True when `current` already holds the content change `edited` made to
 * `base`: every line it added is present at least as often, and every line it
 * removed is present no more often. The sync library's own catch-up rebase often
 * delivers an offline edit before `requeueUnsynced` runs; merging it again then
 * duplicates it.
 */
export function editIncluded(base: string, edited: string, current: string): boolean {
  const b = lineCounts(base);
  const l = lineCounts(edited);
  const c = lineCounts(current);
  for (const line of new Set([...b.keys(), ...l.keys()])) {
    const inBase = b.get(line) ?? 0;
    const inEdited = l.get(line) ?? 0;
    const inCurrent = c.get(line) ?? 0;
    if (inEdited > inBase && inCurrent < inEdited) return false;
    if (inEdited < inBase && inCurrent > inEdited) return false;
  }
  return true;
}

/**
 * F236 — true when `current` holds every line of `edited` in the same order
 * and also passes `editIncluded`: `current` is `edited` with lines added, so
 * treating `edited` as already held keeps every line of it. Line counts alone
 * read a moved line, or a repeated line such as a blank one, as held.
 */
export function editIncludedInOrder(base: string, edited: string, current: string): boolean {
  return inOrder(edited, current) && editIncluded(base, edited, current);
}
