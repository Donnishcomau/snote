import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const lines = readFileSync('.gitignore', 'utf8').split('\n');

describe('.gitignore — secrets', () => {
  it('1: contains .env, .env.* and !.env.example in order', () => {
    const envIdx = lines.indexOf('.env');
    const envDotStarIdx = lines.indexOf('.env.*');
    const envExampleIdx = lines.indexOf('!.env.example');
    expect(envIdx).toBeGreaterThan(-1);
    expect(envDotStarIdx).toBeGreaterThan(-1);
    expect(envExampleIdx).toBeGreaterThan(-1);
    expect(envIdx).toBeLessThan(envDotStarIdx);
    expect(envDotStarIdx).toBeLessThan(envExampleIdx);
  });

  it('2: first entries, skipping each export-drop marker and its next line, are node_modules/, dist/, *.tgz; and entries 3-4 are the marker and .loop/', () => {
    const kept: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === '# export: drop next line') { i++; continue; }
      kept.push(lines[i]);
    }
    expect(kept.slice(0, 3)).toEqual(['node_modules/', 'dist/', '*.tgz']);
    // export: drop next line
    expect([lines[2], lines[3]]).toEqual(['# export: drop next line', '.loop/']);
  });

  it('3: git check-ignore -q .env exits 0', () => {
    expect(() => {
      execFileSync('git', ['check-ignore', '-q', '.env'], { cwd: '.' });
    }).not.toThrow();
  });

  it('4: git check-ignore -q .env.local exits 0', () => {
    expect(() => {
      execFileSync('git', ['check-ignore', '-q', '.env.local'], { cwd: '.' });
    }).not.toThrow();
  });

  it('5: git check-ignore -q .env.example throws with status 1', () => {
    let caught: unknown;
    try {
      execFileSync('git', ['check-ignore', '-q', '.env.example'], { cwd: '.' });
    } catch (e: unknown) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(1);
  });
});
