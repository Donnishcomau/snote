import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { theme } from '../../src/tui/theme';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('dead declarations are gone', () => {
  it('1: WHEN src/core/auth.ts is read THEN it contains none of `LoginCodeResult`, `LoginTokenResult` and `PasswordLoginResult`.', () => {
    const src = read('src/core/auth.ts');
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toContain('LoginCodeResult');
    expect(src).not.toContain('LoginTokenResult');
    expect(src).not.toContain('PasswordLoginResult');
  });

  it('2: WHEN src/tui/theme.ts is read THEN it does not contain `ThemeRole`, and `Object.keys(theme).sort()` equals the list it had before this task.', () => {
    const src = read('src/tui/theme.ts');
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toContain('ThemeRole');
    expect(Object.keys(theme).sort()).toEqual([
      'accent', 'code', 'error', 'heading', 'headingFocused',
      'link', 'muted', 'selection', 'success', 'warning',
    ]);
  });
});
