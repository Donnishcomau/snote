import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Key } from 'ink';

import { getKeyLog, recordKeyEvent, resetKeyLog } from '../../src/tui/app-keys';

describe('key ring module', () => {
  it('1: WHEN src/tui/key-ring.ts is read THEN it contains `export function recordKeyEvent(`, `export function getKeyLog(` and `export function resetKeyLog(`', () => {
    const src = readFileSync(join(__dirname, '../../src/tui/key-ring.ts'), 'utf8');
    expect(src).toContain('export function recordKeyEvent(');
    expect(src).toContain('export function getKeyLog(');
    expect(src).toContain('export function resetKeyLog(');
  });

  it("2: WHEN src/tui/app-keys.ts is read THEN it does not contain `export function recordKeyEvent(` or `let keyLog`, contains `from './key-ring'`, and has fewer than `290` lines", () => {
    const src = readFileSync(join(__dirname, '../../src/tui/app-keys.ts'), 'utf8');
    expect(src).not.toContain('export function recordKeyEvent(');
    expect(src).not.toContain('let keyLog');
    expect(src).toContain("from './key-ring'");
    expect(src.split('\n').length).toBeLessThan(290);
  });

  it("3: WHEN `recordKeyEvent('j', {} as Key, false)` and `recordKeyEvent('x', {} as Key, true)` are imported from `src/tui/app-keys` and called after `resetKeyLog()` THEN `getKeyLog().map(e => e.input)` equals `['j', '<text>']`", () => {
    resetKeyLog();
    recordKeyEvent('j', {} as Key, false);
    recordKeyEvent('x', {} as Key, true);
    expect(getKeyLog().map((e) => e.input)).toEqual(['j', '<text>']);
  });
});
