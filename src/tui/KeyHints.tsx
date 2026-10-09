import { Box, Text } from 'ink';
import React from 'react';
import { theme } from './theme';

type HintEntry = { key: string; label: string };

export const LIST_HINTS: HintEntry[] = [
  { key: '?', label: 'Help' },
  { key: 'n', label: 'New' },
  { key: 'e', label: 'Edit' },
  { key: 'g', label: 'Add tag' },
  { key: '/', label: 'Search' },
  { key: 'q', label: 'Quit' },
  { key: 'Tab', label: 'Tags' },
];

export const TAGS_HINTS: HintEntry[] = [
  { key: 'j/k', label: 'Move' },
  { key: 'Enter', label: 'Select' },
  { key: 'R', label: 'Rename' },
  { key: 'x', label: 'Delete' },
  { key: 'Escape', label: 'Back' },
];

export const TRASH_HINTS: HintEntry[] = [
  { key: 'u', label: 'Restore' },
  { key: 'D', label: 'Delete' },
  { key: 'E', label: 'Empty' },
  { key: 'T', label: 'Back' },
];

const EDITING_HINTS: HintEntry[] = [
  { key: 'Enter', label: 'Confirm' },
  { key: 'Escape', label: 'Cancel' },
];

export function hintsForContext(ctx: 'list' | 'tags' | 'trash' | 'editing'): HintEntry[] {
  if (ctx === 'tags') return TAGS_HINTS;
  if (ctx === 'trash') return TRASH_HINTS;
  if (ctx === 'editing') return EDITING_HINTS;
  return LIST_HINTS;
}

export function visibleHints(entries: HintEntry[], width: number): HintEntry[] {
  let list = [...entries];
  while (list.length > 0) {
    const lineLen = list.map(e => e.key + ' ' + e.label).join('  ').length;
    if (lineLen <= width) break;
    list = list.slice(0, -1);
  }
  return list;
}

interface KeyHintsProps {
  context: 'list' | 'tags' | 'trash' | 'editing';
  width: number;
}

export function KeyHints({ context, width }: KeyHintsProps): React.JSX.Element {
  const hints = visibleHints(hintsForContext(context), width);
  return (
    <Box>
      {hints.map((h, i) => (
        <React.Fragment key={h.key}>
          {i > 0 && <Text>  </Text>}
          <Text {...theme.accent}>{h.key}</Text>
          <Text> {h.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}

export default KeyHints;
