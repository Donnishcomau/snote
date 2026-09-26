import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { copyToClipboard } from '../../src/core/clipboard.js';

function makeCatCmd(outFile: string): string[] {
  return ['sh', '-c', 'cat > "$0"', outFile];
}

describe('copyToClipboard', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'snote-clip-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1: WHEN copyToClipboard('http://simp.ly/p/abc123', cat) is called THEN it returns true and the content of outFile, read as utf8, is exactly 'http://simp.ly/p/abc123' (no added newline)", () => {
    const outFile = join(tmpDir, 'out1.txt');
    const cat = makeCatCmd(outFile);
    const result = copyToClipboard('http://simp.ly/p/abc123', cat);
    expect(result).toBe(true);
    expect(readFileSync(outFile, 'utf-8')).toBe('http://simp.ly/p/abc123');
  });

  it("2: WHEN copyToClipboard('two\\nlines é', cat) is called THEN it returns true and the file content is exactly 'two\\nlines é'", () => {
    const outFile = join(tmpDir, 'out2.txt');
    const cat = makeCatCmd(outFile);
    const result = copyToClipboard('two\nlines é', cat);
    expect(result).toBe(true);
    expect(readFileSync(outFile, 'utf-8')).toBe('two\nlines é');
  });

  it("3: WHEN copyToClipboard('x', ['snote-no-such-command']) is called THEN the call returns false (it must not throw: no try in the test)", () => {
    const result = copyToClipboard('x', ['snote-no-such-command']);
    expect(result).toBe(false);
  });

  it("4: WHEN copyToClipboard('x', ['sh', '-c', 'exit 3']) is called THEN it returns false", () => {
    const result = copyToClipboard('x', ['sh', '-c', 'exit 3']);
    expect(result).toBe(false);
  });

  it("5: WHEN copyToClipboard('', cat) is called THEN it returns false and outFile still does not exist (nothing was spawned)", () => {
    const outFile = join(tmpDir, 'out5.txt');
    const cat = makeCatCmd(outFile);
    const result = copyToClipboard('', cat);
    expect(result).toBe(false);
    expect(existsSync(outFile)).toBe(false);
  });

  it("6: WHEN copyToClipboard('x', []) is called THEN it returns false", () => {
    const result = copyToClipboard('x', []);
    expect(result).toBe(false);
  });
});
