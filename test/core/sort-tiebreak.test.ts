import { describe, it, expect } from 'vitest';
import { sortEntries } from '../../src/tui/app-model';
import { makeNote } from '../../test/tui/fixtures';

describe('sort tiebreak', () => {
  it('1: WHEN sortEntries sorts 3 notes b1, a1 and c1 that all have modificationDate 1000 under the modificationDate mode THEN the returned ids are exactly [a1, b1, c1]', () => {
    const n1 = makeNote('b1', 'content', { modificationDate: 1000 });
    const n2 = makeNote('a1', 'content', { modificationDate: 1000 });
    const n3 = makeNote('c1', 'content', { modificationDate: 1000 });
    const entries = [
      { id: 'b1' as never, note: n1 },
      { id: 'a1' as never, note: n2 },
      { id: 'c1' as never, note: n3 },
    ];
    const result = sortEntries(entries, 'modificationDate', false, false);
    expect(result.map((e) => e.id)).toEqual(['a1', 'b1', 'c1']);
  });

  it('2: WHEN the same 3 tied notes are sorted with sortReversed true THEN the returned ids are still exactly [a1, b1, c1], because the tie-break is applied before the reversal', () => {
    const n1 = makeNote('b1', 'content', { modificationDate: 1000 });
    const n2 = makeNote('a1', 'content', { modificationDate: 1000 });
    const n3 = makeNote('c1', 'content', { modificationDate: 1000 });
    const entries = [
      { id: 'b1' as never, note: n1 },
      { id: 'a1' as never, note: n2 },
      { id: 'c1' as never, note: n3 },
    ];
    const result = sortEntries(entries, 'modificationDate', true, false);
    expect(result.map((e) => e.id)).toEqual(['a1', 'b1', 'c1']);
  });

  it('3: WHEN 2 notes z1 (modificationDate 2000) and a1 (modificationDate 1000) are sorted under modificationDate THEN the returned ids are exactly [z1, a1], proving the tie-break did not override a real difference', () => {
    const n1 = makeNote('z1', 'content', { modificationDate: 2000 });
    const n2 = makeNote('a1', 'content', { modificationDate: 1000 });
    const entries = [
      { id: 'z1' as never, note: n1 },
      { id: 'a1' as never, note: n2 },
    ];
    const result = sortEntries(entries, 'modificationDate', false, false);
    expect(result.map((e) => e.id)).toEqual(['z1', 'a1']);
  });

  it('4: WHEN the same 3 tied notes are sorted twice in a row from two differently ordered input arrays THEN both calls return the identical id order [a1, b1, c1]', () => {
    const n1 = makeNote('b1', 'content', { modificationDate: 1000 });
    const n2 = makeNote('a1', 'content', { modificationDate: 1000 });
    const n3 = makeNote('c1', 'content', { modificationDate: 1000 });
    const entries1 = [
      { id: 'b1' as never, note: n1 },
      { id: 'a1' as never, note: n2 },
      { id: 'c1' as never, note: n3 },
    ];
    const entries2 = [
      { id: 'c1' as never, note: n3 },
      { id: 'b1' as never, note: n1 },
      { id: 'a1' as never, note: n2 },
    ];
    const result1 = sortEntries(entries1, 'modificationDate', false, false);
    const result2 = sortEntries(entries2, 'modificationDate', false, false);
    expect(result1.map((e) => e.id)).toEqual(['a1', 'b1', 'c1']);
    expect(result2.map((e) => e.id)).toEqual(['a1', 'b1', 'c1']);
  });
});
