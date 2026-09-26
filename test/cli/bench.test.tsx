import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  writeBenchState,
  runBench,
  failures,
  THRESHOLDS,
} from '../../src/cli/bench';

describe('bench', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = '';
  });

  it('1: WHEN writeBenchState(dir, 200) has run THEN the dir holds only state.json, the loaded data.notes.size is 200, and the note bench-42 has a content starting with "Note 42 title\\needle42 " and the modificationDate 1700000042', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-t17-1-'));
    writeBenchState(tmpDir, 200);

    const files = fs.readdirSync(tmpDir);
    expect(files).toEqual(['state.json']);

    const { loadState } = await import('../../src/core/persistence');
    const loaded = loadState(tmpDir);
    const notes = (loaded!.data as any).notes as Map<string, unknown>;
    expect(notes.size).toBe(200);

    const note42 = notes.get('bench-42') as { content: string; modificationDate: number };
    expect(note42.content.startsWith('Note 42 title\nneedle42 ')).toBe(true);
    expect(note42.modificationDate).toBe(1700000042);
  });

  it('2: WHEN runBench(dir) resolves for those 200 notes THEN notes is 200, matches is 2, startMs and rssMb are finite numbers above 0 and searchMs is a finite number of at least 0', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-t17-2-'));
    writeBenchState(tmpDir, 200);

    const r = await runBench(tmpDir);

    expect(r.notes).toBe(200);
    expect(r.matches).toBe(2);
    expect(r.startMs).toBeGreaterThan(0);
    expect(Number.isFinite(r.startMs)).toBe(true);
    expect(r.rssMb).toBeGreaterThan(0);
    expect(Number.isFinite(r.rssMb)).toBe(true);
    expect(r.searchMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.searchMs)).toBe(true);
  });

  it('3: WHEN runBench(dir) is called for an empty temp dir THEN the promise rejects with an error containing "no state.json"', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-t17-3-'));

    await expect(runBench(tmpDir)).rejects.toThrow('no state.json');
  });

  it('4: WHEN failures gets { notes: 1, matches: 1, startMs: 149.9, searchMs: 49.9, rssMb: 119.9 } THEN it returns an array of length 0', async () => {
    const r = { notes: 1, matches: 1, startMs: 149.9, searchMs: 49.9, rssMb: 119.9 };
    const result = failures(r);
    expect(result).toHaveLength(0);
  });

  it('5: WHEN failures gets { notes: 1, matches: 1, startMs: 150, searchMs: 50, rssMb: 120 } THEN it returns exactly "start 150 ms >= 150 ms", "search 50 ms >= 50 ms", "rss 120 MB >= 120 MB" in that order', async () => {
    const r = { notes: 1, matches: 1, startMs: 150, searchMs: 50, rssMb: 120 };
    const result = failures(r);
    expect(result).toEqual([
      'start 150 ms >= 150 ms',
      'search 50 ms >= 50 ms',
      'rss 120 MB >= 120 MB',
    ]);
  });

  it('6: WHEN failures gets { notes: 1, matches: 1, startMs: 10, searchMs: 70.5, rssMb: 80 } THEN it returns 1 string "search 70.5 ms >= 50 ms"; and THRESHOLDS equals { startMs: 150, searchMs: 50, rssMb: 120 }', async () => {
    const r = { notes: 1, matches: 1, startMs: 10, searchMs: 70.5, rssMb: 80 };
    const result = failures(r);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('search 70.5 ms >= 50 ms');
    expect(THRESHOLDS).toEqual({ startMs: 150, searchMs: 50, rssMb: 120 });
  });
});
