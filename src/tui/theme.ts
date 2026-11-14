export const theme = {
  heading: { bold: true },
  headingFocused: { bold: true, inverse: true },
  muted: { dimColor: true },
  accent: { color: 'blue' },
  selection: { bold: true, inverse: true },
  error: { color: 'red' },
  warning: { color: 'yellow' },
  success: { color: 'green' },
  link: { color: 'blue', underline: true },
  code: { color: 'yellow' },
} as const;

// Issue 721: markdown headings, level 1 blue (the accent, as before), 2 magenta, 3 to 6 cyan (named ANSI
// colours; kept out of `theme`, whose keys are pinned).
export const headingTheme = {
  heading1: { color: 'blue', bold: true },
  heading2: { color: 'magenta', bold: true },
  heading3: { color: 'cyan', bold: true },
} as const;

/** Issue 721: the style of a heading of `level` (1 to 6). */
export function headingStyle(level: number): (typeof headingTheme)[keyof typeof headingTheme] {
  return level <= 1 ? headingTheme.heading1 : level === 2 ? headingTheme.heading2 : headingTheme.heading3;
}
