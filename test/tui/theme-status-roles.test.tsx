import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { noticeColor } from '../../src/tui/notice';
import { theme } from '../../src/tui/theme';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const dir = resolve(process.cwd(), 'src/tui');

// Every .ts/.tsx file directly in src/tui, except theme.ts itself.
const files = readdirSync(dir)
  .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && f !== 'theme.ts')
  .map((f) => join(dir, f));

const colorNames = ['red', 'green', 'yellow', 'gray', 'cyan', 'blue', 'magenta'];

describe('theme-status-roles', () => {
  it('1: WHEN every file in `files` is read THEN none contains the text `color="`.', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    for (const file of files) {
      const content = read(file);
      expect(content, file).not.toContain('color="');
    }
  });

  it("2: WHEN every file in `files` is read THEN none contains `'red'`, `'green'`, `'yellow'`, `'gray'`, `'cyan'`, `'blue'` or `'magenta'` in quotes.", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    for (const file of files) {
      const content = read(file);
      for (const name of colorNames) {
        expect(content, `${file} contains '${name}'`).not.toContain(`'${name}'`);
        expect(content, `${file} contains "${name}"`).not.toContain(`"${name}"`);
      }
    }
  });

  it('3: WHEN Root.tsx, Login.tsx, Prompt.tsx, StatusBar.tsx and notice.ts are read THEN each contains `theme.`, and `noticeColor` returns `theme.error.color` for an error notice and `theme.success.color` otherwise.', () => {
    for (const name of ['Root.tsx', 'Login.tsx', 'Prompt.tsx', 'StatusBar.tsx', 'notice.ts']) {
      expect(read(resolve(dir, name)), name).toContain('theme.');
    }
    expect(noticeColor({ message: 'editor failed', isError: true })).toBe(theme.error.color);
    expect(noticeColor({ message: 'New note saved', isError: false })).toBe(theme.success.color);
  });
});
