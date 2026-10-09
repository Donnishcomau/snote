/**
 * T377: the theme gains `link` and `code` roles for the Preview markdown task.
 */
import { describe, expect, it } from 'vitest';

import { theme } from '../../src/tui/theme';

describe('T377 theme link and code roles', () => {
  it("1: WHEN `theme` is imported THEN `theme.link` equals `{ color: 'blue', underline: true }`", () => {
    expect(theme.link).toEqual({ color: 'blue', underline: true });
  });

  it("2: WHEN `theme` is imported THEN `theme.code` equals `{ color: 'yellow' }`", () => {
    expect(theme.code).toEqual({ color: 'yellow' });
  });

  it("3: WHEN `Object.keys(theme).sort()` is read THEN it equals `['accent', 'code', 'error', 'heading', 'headingFocused', 'link', 'muted', 'selection', 'success', 'warning']`", () => {
    expect(Object.keys(theme).sort()).toEqual([
      'accent',
      'code',
      'error',
      'heading',
      'headingFocused',
      'link',
      'muted',
      'selection',
      'success',
      'warning',
    ]);
  });

  it("4: WHEN the roles `accent`, `muted`, `heading`, `selection` and `success` are read THEN they equal `{ color: 'blue' }`, `{ dimColor: true }`, `{ bold: true }`, `{ bold: true, inverse: true }` and `{ color: 'green' }`", () => {
    expect(theme.accent).toEqual({ color: 'blue' });
    expect(theme.muted).toEqual({ dimColor: true });
    expect(theme.heading).toEqual({ bold: true });
    expect(theme.selection).toEqual({ bold: true, inverse: true });
    expect(theme.success).toEqual({ color: 'green' });
  });
});
