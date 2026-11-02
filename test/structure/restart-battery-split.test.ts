/**
 * #369a: the restart battery is split over five files so the suite can spread
 * its 70 scenarios over workers and shards. This pins the set: no id lost, none
 * run twice, each file small, and the assertions unchanged.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', 'integration');
const FILES = [
  'restart-battery-kept.test.ts',
  'restart-battery-kept-2.test.ts',
  'restart-battery-kept-3.test.ts',
  'restart-battery-kept-4.test.ts',
  'restart-battery-kept-5.test.ts',
];
const OTHER_DEVICE = ['P3-other-device-pin', 'late-catch-up-other-device-pin'];

// The 68 ids of the KEPT list of restart-battery-kept.test.ts on bda987b4.
const FROZEN = [
  'O1-unpin',
  'O2-unpin',
  'O3-restore',
  'O4-untag',
  'crash-before-save-edit',
  'crash-before-save-trash',
  'P6-ahead-copy-clean-stop',
  'P8-ahead-copy-pin-crash',
  'P6-ahead-copy-clean-stop-reindex',
  'P8-ahead-copy-pin-crash-reindex',
  'Q9-pin-400',
  'Q9-pin-1500',
  'Q9-trash-400',
  'Q9-tag-400',
  'Q8-pin-0',
  'Q8-trash-0',
  'Q8-tag-0',
  'DBL-quit-before-ack',
  'kill-inline-50',
  'kill-inline-300',
  'kill-external-300',
  'kill-never-got-it-300',
  'kill-hold-300',
  'kill-inline-900',
  'P4-offline-pin',
  'P5-two-offline-then-pin',
  'DBL-restart-pin',
  'DBL-restart-edit',
  'DBL-restart-trash',
  'late-catch-up-edit',
  'late-catch-up-pin',
  'P2-delete-forever',
  'forever-late-echo',
  'forever-reindex',
  'forever-late-reindex',
  'tombstone-resend-reindex',
  'Q1-pin',
  'two-saves',
  'two-saves-reindex',
  'count-neutral-move',
  'count-neutral-move-reindex',
  'count-neutral-blank',
  'count-neutral-blank-reindex',
  'offline-move',
  'offline-move-reindex',
  'coincident-line-reindex',
  'coincident-blank-reindex',
  'delete-moved-reindex',
  'delete-moved-down-reindex',
  'REPDEL-reindex',
  'dup-line-reindex',
  'dup-blank-reindex',
  'delete-moved',
  'delete-moved-down',
  'coincident-line',
  'MOVEAPP',
  'MOVEAPP-reindex',
  'CONFLICT-hostile-title',
  'P6-ahead-copy-late',
  'move-edit-append',
  'move-edit-append-reindex',
  'space-move',
  'space-move-reindex',
  'repdel-first',
  'repdel-first-reindex',
  'repdel-last',
  'repdel-last-reindex',
  'HOLD-session-edit',
];

const read = (f: string): string => readFileSync(join(DIR, f), 'utf8');

/** The quoted ids of the list opened by `opener` (a `const KEPT = [` or `of [` form). */
function idsAfter(src: string, opener: string): string[] {
  const start = src.indexOf(opener);
  if (start < 0) return [];
  const end = src.indexOf(']', start + opener.length);
  const block = src.slice(start + opener.length, end);
  const out: string[] = [];
  for (const line of block.split('\n')) {
    if (line.trim().startsWith('//')) continue;
    for (const m of line.matchAll(/'([^']+)'/g)) out.push(m[1]);
  }
  return out;
}

const kept = (f: string): string[] => idsAfter(read(f), 'const KEPT = [');
const other = (f: string): string[] => idsAfter(read(f), 'of [');

describe('restart battery split (#369a)', () => {
  it('1: WHEN the KEPT lists of the five restart-battery-kept*.test.ts files are joined THEN they equal, as a multiset, the frozen list of the `68` ids of the base KEPT list written in the new test, so no id is missing and none appears twice', () => {
    expect(FROZEN.length).toBe(68);
    const joined = FILES.flatMap(kept).sort();
    expect(joined).toEqual([...FROZEN].sort());
  });

  it('2: WHEN the five files are read THEN `P3-other-device-pin` and `late-catch-up-other-device-pin` each appear in exactly one file, in an `of [` loop whose body holds `expect(o.pending).toBe(0)`', () => {
    const holders = FILES.filter((f) => other(f).length > 0);
    expect(holders.length).toBe(1);
    expect(other(holders[0]).sort()).toEqual([...OTHER_DEVICE].sort());
    expect(FILES.flatMap(other).length).toBe(2);
    expect(read(holders[0])).toContain('expect(o.pending).toBe(0)');
    for (const id of OTHER_DEVICE) {
      expect(FILES.filter((f) => read(f).includes(`'${id}'`)).length).toBe(1);
    }
  });

  it('3: WHEN each of the five files is read THEN it lists at most `15` scenario ids and at least `10`', () => {
    for (const f of FILES) {
      const n = kept(f).length + other(f).length;
      expect({ f, ok: n <= 15 && n >= 10, n }).toMatchObject({ f, ok: true });
    }
  });

  it('4: WHEN each file that has a KEPT list is read THEN it contains `toMatchObject({ id, verdict: \'KEPT\' })` and `45000`', () => {
    const withList = FILES.filter((f) => kept(f).length > 0);
    expect(withList.length).toBe(5);
    for (const f of withList) {
      const src = read(f);
      expect(src).toContain("toMatchObject({ id, verdict: 'KEPT' })");
      expect(src).toContain('45000');
    }
  });
});
