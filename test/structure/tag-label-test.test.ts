import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const caseTwo = (): string => {
  const text = fs.readFileSync(path.resolve(process.cwd(), 'test/tui/tag-real-name.test.tsx'), 'utf8');
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith("  it('2:") || l.startsWith('  it("2:'));
  expect(start).toBeGreaterThanOrEqual(0);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('  it('));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join('\n');
};

describe('tag label test (T485)', () => {
  it('1: WHEN test/tui/tag-real-name.test.tsx is read THEN the text of its case 2 (from the line starting `  it(` whose title starts with `2:` to the next line starting `  it(`) contains `tag: ab`, `waitForFrame` and `\\r`', () => {
    const body = caseTwo();
    expect(body).toContain('tag: ab');
    expect(body).toContain('waitForFrame');
    expect(body).toContain('\\r');
  });

  it('2: WHEN that case-2 text is read THEN it does not contain `setTimeout(`', () => {
    const body = caseTwo();
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain('setTimeout(');
  });
});
