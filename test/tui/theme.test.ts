/**
 * T351: the theme module defines every text style the TUI uses, as semantic
 * roles with literal final values. Named ANSI colours only.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { theme } from '../../src/tui/theme';

const INK_PLAIN_NAMES = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'gray',
];

const ALLOWED_KEYS = ['color', 'bold', 'dimColor', 'inverse', 'underline'];

function isInkColorName(value: string): boolean {
  if (INK_PLAIN_NAMES.includes(value)) return true;
  return INK_PLAIN_NAMES.some((name) => value === `${name}Bright`);
}

describe('T351 theme roles', () => {
  it("1: WHEN `theme` is imported THEN `Object.keys(theme).sort()` equals `['accent', 'error', 'heading', 'headingFocused', 'muted', 'selection', 'success', 'warning']`", () => {
    expect(Object.keys(theme).sort()).toEqual([
      'accent',
      'error',
      'heading',
      'headingFocused',
      'muted',
      'selection',
      'success',
      'warning',
    ]);
  });

  it("2: WHEN every role of `theme` is read THEN its keys are only `color`, `bold`, `dimColor`, `inverse`, `underline`, and each `color` is one of Ink's nine plain names or a `...Bright` name", () => {
    for (const role of Object.values(theme)) {
      for (const key of Object.keys(role)) {
        expect(ALLOWED_KEYS).toContain(key);
      }
      if ('color' in role) {
        expect(isInkColorName(role.color)).toBe(true);
      }
    }
  });

  it("3: WHEN the roles are compared THEN `muted` equals `{ dimColor: true }`, `accent` `{ color: 'blue' }`, `heading` `{ bold: true }`, and `headingFocused` and `selection` `{ bold: true, inverse: true }`", () => {
    expect(theme.muted).toEqual({ dimColor: true });
    expect(theme.accent).toEqual({ color: 'blue' });
    expect(theme.heading).toEqual({ bold: true });
    expect(theme.headingFocused).toEqual({ bold: true, inverse: true });
    expect(theme.selection).toEqual({ bold: true, inverse: true });
  });

  it("4: WHEN `src/tui/theme.ts` is read and `node scripts/lint-ansi.mjs` is run THEN the file has no `gray`, no `#` hex colour and no `rgb(`, and the script exits `0` with stdout containing `ansi ok`", () => {
    const source = readFileSync('src/tui/theme.ts', 'utf8');
    expect(source).not.toContain('gray');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(source).not.toContain('rgb(');
    const run = spawnSync(process.execPath, ['scripts/lint-ansi.mjs'], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('ansi ok');
  });

  it("5: WHEN `src/tui/PaneHeading.tsx` is read THEN it contains `theme.heading` and `theme.headingFocused` and contains neither `bold` nor `inverse`", () => {
    const source = readFileSync('src/tui/PaneHeading.tsx', 'utf8');
    expect(source).toContain('theme.heading');
    expect(source).toContain('theme.headingFocused');
    expect(source).not.toContain('bold');
    expect(source).not.toContain('inverse');
  });
});
