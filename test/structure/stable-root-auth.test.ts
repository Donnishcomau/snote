import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const filePath = path.join(__dirname, '..', 'tui', 'root-auth.test.tsx');
const content = fs.readFileSync(filePath, 'utf8');

describe('T177 stable-root-auth structure checks', () => {
  it('1: WHEN the file is read THEN it contains const waitFor exactly 1 time and contains no throw new Error', () => {
    const waitForMatches = (content.match(/const waitFor/g) || []).length;
    expect(waitForMatches).toBe(1);
    expect(content).not.toContain('throw new Error');
  });

  it('2: WHEN the file is read THEN it contains await waitFor( exactly 1 time', () => {
    const waitForCalls = (content.match(/await waitFor\(/g) || []).length;
    expect(waitForCalls).toBe(1);
  });

  it('3: WHEN the file is read THEN it contains setTimeout(r, 50) exactly 0 times and waitForFrame( at least 20 times', () => {
    const sleepMatches = (content.match(/setTimeout\(r, 50\)/g) || []).length;
    expect(sleepMatches).toBe(0);
    const frameWaits = (content.match(/waitForFrame\(/g) || []).length;
    expect(frameWaits).toBeGreaterThanOrEqual(20);
  });

  it('4: WHEN the file is read THEN it contains no stdin.emit( and no stdin.read(', () => {
    expect(content).not.toContain('stdin.emit(');
    expect(content).not.toContain('stdin.read(');
  });

  it('5: WHEN the file is read THEN it contains 6 occurrences of  it( and no .skip and no .only', () => {
    const itMatches = (content.match(/  it\(/g) || []).length;
    expect(itMatches).toBe(6);
    expect(content).not.toContain('.skip');
    expect(content).not.toContain('.only');
  });
});
