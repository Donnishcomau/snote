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

  it('2: first 4 entries are node_modules/, dist/, .loop/, *.tgz', () => {
    expect(lines[0]).toBe('node_modules/');
    expect(lines[1]).toBe('dist/');
    expect(lines[2]).toBe('.loop/');
    expect(lines[3]).toBe('*.tgz');
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
