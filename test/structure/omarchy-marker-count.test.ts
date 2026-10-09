import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('omarchy-marker-count', () => {
  it('1: WHEN src/cli/main.tsx is read THEN exactly `3` lines contain `OMARCHY`, and no line containing `guardOutputStream` or `T402` contains `OMARCHY`.', () => {
    const lines = read('src/cli/main.tsx').split('\n');
    const markerLines = lines.filter((l) => l.includes('OMARCHY'));
    expect(markerLines.length).toBe(3);
    for (const line of lines) {
      if (line.includes('guardOutputStream') || line.includes('T402')) {
        expect(line).not.toContain('OMARCHY');
      }
    }
  });

  it('2: WHEN src/cli/main.tsx is read THEN it still contains `guardOutputStream(process.stdout)` and `isScreenReaderEnabled: false`.', () => {
    const content = read('src/cli/main.tsx');
    expect(content).toContain('guardOutputStream(process.stdout)');
    expect(content).toContain('isScreenReaderEnabled: false');
  });
});
