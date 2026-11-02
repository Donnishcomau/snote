/**
 * sync-7 property: across seeded random edits of small notes, a line
 * the offline edit inserted that the server copy did not touch (the server
 * holds it exactly as often as the base) is never counted as already held, so
 * the hand-off always sends it. Seeded, so every run checks the same cases.
 */
import { heldBase } from '../../src/core/held-lines';

const ALPHABET = ['a', 'b', 'c', '', ' ', 'X'];

function counts(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const line of text.split('\n')) m.set(line, (m.get(line) ?? 0) + 1);
  return m;
}

describe('heldBase property', () => {
  it('1: WHEN 8000 seeded random base, offline and server notes (seed `12345`) are checked THEN no offline-inserted line the server did not touch is counted as held: `0` cases', () => {
    let seed = 12345;
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
    for (let it = 0; it < 8000; it++) {
      const base = mutate(['a', 'b', 'c'], 2 + rnd(3));
      const b = base.join('\n');
      const o = mutate(base, 1 + rnd(2)).join('\n');
      const c = mutate(base, rnd(3)).join('\n');
      if (o === b) continue;
      const B = counts(b);
      const O = counts(o);
      const C = counts(c);
      const H = counts(heldBase(b, o, c));
      for (const [line, n] of O) {
        const nb = B.get(line) ?? 0;
        if (n > nb && (C.get(line) ?? 0) === nb && (H.get(line) ?? 0) > nb) bad.push(JSON.stringify({ b, o, c }));
      }
    }
    expect(bad.length).toBe(0);
  });
});
