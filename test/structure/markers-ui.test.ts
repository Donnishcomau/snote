import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('markers-ui', () => {
  it('1: WHEN src/tui/Login.tsx is read THEN it has more than 100 lines, no line contains OMARCHY, and it still contains passwordLogin, step === \'password\' and // T70', () => {
    const content = read('src/tui/Login.tsx');
    const lines = content.split('\n');
    expect(lines.length).toBeGreaterThan(100);
    for (const line of lines) {
      expect(line).not.toContain('OMARCHY');
    }
    expect(content).toContain('passwordLogin');
    expect(content).toContain("step === 'password'");
    expect(content).toContain('// T70');
  });

  it('2: WHEN src/cli/main.tsx is read THEN it has more than 100 lines and every line that contains OMARCHY contains OMARCHY: boundary cast; at least 1 such line is left', () => {
    const content = read('src/cli/main.tsx');
    const lines = content.split('\n');
    expect(lines.length).toBeGreaterThan(100);
    for (const line of lines) {
      if (line.includes('OMARCHY')) {
        expect(line).toContain('OMARCHY: boundary cast');
      }
    }
    const boundaryLines = lines.filter((l) => l.includes('OMARCHY: boundary cast'));
    expect(boundaryLines.length).toBeGreaterThanOrEqual(1);
  });

  it('3: WHEN src/cli/main.tsx is read THEN it still contains export function buildStore(, requeueUnsynced(, persistOnChange(store, await waitUntilExit() and stopSaving();', () => {
    const content = read('src/cli/main.tsx');
    expect(content).toContain('export function buildStore(');
    expect(content).toContain('requeueUnsynced(');
    expect(content).toContain('persistOnChange(store');
    expect(content).toContain('await waitUntilExit()');
    expect(content).toContain('stopSaving();');
  });

  it('4: WHEN vendor/simplenote/state/simperium/middleware.ts is read THEN it still contains // OMARCHY:', () => {
    const content = read('vendor/simplenote/state/simperium/middleware.ts');
    expect(content).toContain('// OMARCHY:');
  });
});
