import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('stable-root', () => {
  it("1: WHEN the file is read THEN it contains `waitFor(` and contains no `setTimeout(r, 50))` immediately before a line containing `expect(`.", () => {
    const content = read('test/tui/root.test.tsx');
    expect(content).toContain('waitFor(');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().includes('expect(')) {
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        expect(prevLine).not.toContain('setTimeout(r, 50))');
      }
    }
  });

  it("2: WHEN the file is read THEN it still contains `toContain('Root note')`, `not.toBeNull()` and `6` occurrences of `it('` or `it(\"`.", () => {
    const content = read('test/tui/root.test.tsx');
    expect(content).toContain("toContain('Root note')");
    expect(content).toContain('not.toBeNull()');
    const matches = content.match(/it\(['"]/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(6);
  });

  it("3: WHEN the file is read THEN it contains no `.skip`, no `.only` and no `toBeTruthy()`.", () => {
    const content = read('test/tui/root.test.tsx');
    expect(content).not.toContain('.skip');
    expect(content).not.toContain('.only');
    expect(content).not.toContain('toBeTruthy()');
  });

  it("4: WHEN the helper line is read THEN it contains `1500` and `10`.", () => {
    const content = read('test/tui/root.test.tsx');
    expect(content).toContain('1500');
    expect(content).toContain('10');
  });
});
