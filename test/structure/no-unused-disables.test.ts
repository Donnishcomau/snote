import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

const FILES = [
  'test/core/blog-url.test.tsx',
  'test/core/export-note.test.tsx',
  'test/tui/blog-confirm.test.tsx',
  'test/tui/blog-send-key.test.tsx',
  'test/tui/blog-send-repeat.test.tsx',
  'test/tui/blog-status.test.tsx',
  'test/tui/list-export-and-lock.test.tsx',
  'test/packaging/barwidget-tooltip.test.ts',
  'test/packaging/barwidget-update.test.ts',
];

describe('unused eslint disables (T451)', () => {
  it('1: WHEN the 9 files listed in the brief are read THEN none contains `eslint-disable`', () => {
    expect(FILES).toHaveLength(9);
    for (const f of FILES) {
      const text = read(f);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain('eslint-disable');
    }
  });

  it('2: WHEN package.json is parsed THEN `scripts.lint` is exactly `eslint --max-warnings 0 src test vendor`', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.lint).toBe('eslint --max-warnings 0 src test vendor');
  });
});
