import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const RENDER_FILES = [
  'test/tui/osc-editor.test.tsx',
  'test/tui/hostile-layer2.test.tsx',
  'test/core/output-guard-v2.test.tsx',
];

describe('ci-interactive', () => {
  it('1: WHEN test/tui/osc-editor.test.tsx, test/tui/hostile-layer2.test.tsx and test/core/output-guard-v2.test.tsx are read THEN each contains `interactive: true`.', () => {
    for (const file of RENDER_FILES) {
      expect(read(file)).toContain('interactive: true');
    }
  });

  it('2: WHEN those three files are read THEN each still contains `render(` and `exitOnCtrlC: false`.', () => {
    for (const file of RENDER_FILES) {
      const content = read(file);
      expect(content).toContain('render(');
      expect(content).toContain('exitOnCtrlC: false');
    }
  });
});
