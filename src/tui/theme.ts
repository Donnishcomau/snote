export const theme = {
  heading: { bold: true },
  headingFocused: { bold: true, inverse: true },
  muted: { dimColor: true },
  accent: { color: 'blue' },
  selection: { bold: true, inverse: true },
  error: { color: 'red' },
  warning: { color: 'yellow' },
  success: { color: 'green' },
} as const;

export type ThemeRole = keyof typeof theme;
