/**
 * sync-8 (#115,) property: across seeded random edits of
 * small notes, the start-up hand-off's merge (the held parts applied, then
 * `mergeKeepingText`) never drops a line one side added that the other side
 * did not touch: the result holds it at least as often as that side does.
 * Seeded, so every run checks the same cases.
 */
import { heldBase, mergeKeepingText } from '../../src/core/held-lines';

const ALPHABET = ['a', 'b', 'c', '', ' ', 'X'];

function counts(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const line of text.split('\n')) m.set(line, (m.get(line) ?? 0) + 1);
  return m;
}

describe('hand-off merge property (#115)', () => {
  it('1: WHEN 2500 seeded random base, offline and server notes (seed `54321`) are merged as the hand-off does THEN no line one side added and the other did not touch is dropped: `0` cases', () => {
    let seed = 54321;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const mutate = (lines: string[], k: number): string[] => {
      const out = [...lines];
      for (let t = 0; t < k; t++) {
        const op = rnd(4);
        if (op === 0) out.splice(rnd(out.length + 1), 0, ALPHABET[rnd(ALPHABET.length)]);
        else if (op === 1 && out.length > 1) out.splice(rnd(out.length), 1);
        else if (op === 2 && out.length > 1) {
          const [x] = out.splice(rnd(out.length), 1);
          out.splice(rnd(out.length + 1), 0, x);
        } else if (out.length) out.splice(rnd(out.length + 1), 0, out[rnd(out.length)]);
      }
      return out;
    };
    const bad: string[] = [];
    for (let it = 0; it < 2500; it++) {
      const base = mutate(['a', 'b', 'c'], 2 + rnd(3));
      const b = base.join('\n');
      const o = mutate(base, 1 + rnd(2)).join('\n');
      const c = mutate(base, rnd(3)).join('\n');
      if (o === b) continue;
      const r = counts(mergeKeepingText(heldBase(b, o, c), o, c).content);
      const B = counts(b);
      const O = counts(o);
      const C = counts(c);
      for (const line of new Set([...O.keys(), ...C.keys()])) {
        const nb = B.get(line) ?? 0;
        const no = O.get(line) ?? 0;
        const nc = C.get(line) ?? 0;
        const nr = r.get(line) ?? 0;
        if ((no > nb && nc === nb && nr < no) || (nc > nb && no === nb && nr < nc)) bad.push(JSON.stringify({ b, o, c }));
      }
    }
    expect(bad).toEqual([]);
  });
});
