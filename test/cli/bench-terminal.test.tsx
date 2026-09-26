import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { writeBenchState, runBench } from '../../src/cli/bench';

describe('bench-terminal', () => {
  let tmpDir: string;
  let emptyDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = '';
    if (emptyDir) fs.rmSync(emptyDir, { recursive: true, force: true });
    emptyDir = '';
  });

  it('1: WHEN src/cli/bench.tsx is read THEN it does not contain ink-testing-library, and it contains rows = 40 and columns = 120', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'cli', 'bench.tsx'),
      'utf8'
    );
    expect(src).not.toContain('ink-testing-library');
    expect(src).toContain('rows = 40');
    expect(src).toContain('columns = 120');
  });

  it('2: WHEN runBench(dir, onFrame) resolves for the 200 notes THEN onFrame was called exactly 1 time with a string that contains "200 notes" and "Preview: Note 199 title"', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-t170-2-'));
    writeBenchState(tmpDir, 200);

    const onFrame = vi.fn();
    const r = await runBench(tmpDir, onFrame);

    expect(r.notes).toBe(200);
    expect(onFrame).toHaveBeenCalledTimes(1);
    const frame = onFrame.mock.calls[0][0] as string;
    expect(frame).toContain('200 notes');
    expect(frame).toContain('Preview: Note 199 title');
  });

  it('3: WHEN that frame is split into lines THEN no line is longer than 120 characters and at least 1 line is longer than 100 characters', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-t170-3-'));
    writeBenchState(tmpDir, 200);

    const onFrame = vi.fn();
    await runBench(tmpDir, onFrame);

    const frame = onFrame.mock.calls[0][0] as string;
    const lines = frame.split('\n');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(120);
    }
    expect(lines.some((l) => l.length > 100)).toBe(true);
  });

  it('4: WHEN runBench(dir) is called without a second argument THEN it resolves with notes 200 and matches 2', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-t170-4-'));
    writeBenchState(tmpDir, 200);

    const r = await runBench(tmpDir);

    expect(r.notes).toBe(200);
    expect(r.matches).toBe(2);
  });

  it('5: WHEN runBench(emptyDir) is called for an empty temp dir with an onFrame spy THEN it rejects with "no state.json" and the spy was called 0 times', async () => {
    emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-bench-t170-5-'));

    const onFrame = vi.fn();
    await expect(runBench(emptyDir, onFrame)).rejects.toThrow('no state.json');
    expect(onFrame).toHaveBeenCalledTimes(0);
  });
});
