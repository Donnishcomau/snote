import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const filePath = new URL('../core/editor.test.ts', import.meta.url);
const fileContent = readFileSync(filePath, 'utf-8');

describe('stable-editor', () => {
  it('1: WHEN the file is read THEN it contains process.env.TMPDIR = own and expect(readdirSync(own)).toEqual([])', () => {
    expect(fileContent).toContain('process.env.TMPDIR = own');
    expect(fileContent).toContain("expect(readdirSync(own)).toEqual([])");
  });

  it('2: WHEN the file is read THEN it does not contain startsWith(snoute-) and does not contain before.has(', () => {
    expect(fileContent).not.toContain("startsWith('snote-')");
    expect(fileContent).not.toContain('before.has(');
  });

  it('3: WHEN the file is read THEN it contains finally at least 2 times and the text delete process.env.TMPDIR', () => {
    const finallyMatches = fileContent.match(/finally/g);
    expect(finallyMatches !== null && finallyMatches.length >= 2).toBe(true);
    expect(fileContent).toContain('delete process.env.TMPDIR');
  });

  it('4: WHEN the it( cases are counted THEN there are exactly 3 and the title WHEN the call has finished THEN no snote- directory created by it remains in os.tmpdir() is still there', () => {
    const itMatches = fileContent.match(/it\(/g);
    expect(itMatches).not.toBeNull();
    expect(itMatches!.length).toEqual(3);
    expect(fileContent).toContain(
      'WHEN the call has finished THEN no snote- directory created by it remains in os.tmpdir()',
    );
  });
});
