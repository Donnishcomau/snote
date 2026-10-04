import { Box, Text } from 'ink';
import React from 'react';

import type { Note } from '@vendor/types';
import { noteRow } from '../core/note-row';
import { PaneHeading } from './PaneHeading';
import { theme } from './theme';

export function listColWidth(width: number): number {
  return Math.min(Math.floor(width * 0.4), 60);
}

/**
 * True when a pinned/unpinned boundary exists at note index i:
 * note i-1 is pinned and note i is not.
 */
function isBoundary(notes: Note[], i: number): boolean {
  return (
    i > 0 &&
    notes[i - 1].systemTags.includes('pinned') &&
    !notes[i].systemTags.includes('pinned')
  );
}

interface NoteListProps {
  notes: Note[];
  selectedIndex: number;
  width: number;
  height: number;
  query?: string;
  focused?: boolean;
}

/**
 * Note list pane - shows list of notes with title and preview.
 */
export function NoteList({
  notes,
  selectedIndex,
  width,
  height,
  query,
  focused = false,
}: NoteListProps): React.JSX.Element {
  // Reserve 1 line for header, 1 for status bar
  const listHeight = height - 2;
  const colWidth = listColWidth(width);
  // The box below the header gets one line less than listHeight; the rule
  // line of the boundary counts toward the same budget, which is why the
  // first unpinned block loses its blank separator below the rule.
  const bodyHeight = listHeight - 1;

  // Each note takes exactly 4 lines
  const perNote = 4;
  // A dim rule row separates the pinned notes from the rest; reserve a
  // line for it whenever such a boundary exists anywhere in the list.
  const boundaryExists = notes.some((_, i) => isBoundary(notes, i));
  const visibleCount = Math.max(
    1,
    Math.floor((listHeight - (boundaryExists ? 1 : 0)) / perNote),
  );

  // Scroll so selected note stays in view
  const maxStart = Math.max(0, notes.length - visibleCount);
  let visibleStart = Math.min(
    Math.max(0, selectedIndex - Math.floor(visibleCount / 2)),
    maxStart,
  );
  const visibleEnd = Math.min(notes.length, visibleStart + visibleCount);

  return (
    <Box flexDirection="column" height={listHeight} width={colWidth}>
      {/* Header */}
      <PaneHeading label="Notes" focused={focused} />

      {/* Note items */}
      <Box flexDirection="column" height={bodyHeight}>
        {notes.slice(visibleStart, visibleEnd).map((note, idx) => {
          const actualIndex = visibleStart + idx;
          const isSelected = actualIndex === selectedIndex;
          const { title, marker, previewLines } = noteRow(note, colWidth, query);

          const lines: React.ReactNode[] = [];

          // Non-selectable dim rule at the pinned/unpinned boundary,
          // drawn as the first line of the first unpinned note's block.
          if (isBoundary(notes, actualIndex)) {
            lines.push(
              <Text key={`rule-${idx}`} wrap="truncate" {...theme.muted}>
                {'─'.repeat(colWidth - 2)}
              </Text>,
            );
          }

          // Title line with marker
          lines.push(
            <Box key={`title-${idx}`}>
              {isSelected ? <Text bold inverse>{'>'}</Text> : <Text>{' '}</Text>}
              <Text bold={isSelected} inverse={isSelected}>{title}{marker}</Text>
            </Box>,
          );

          // Up to two dim preview lines, indented by 2 spaces
          for (let p = 0; p < previewLines.length; p++) {
            lines.push(
              <Box key={`preview-${idx}-${p}`} marginLeft={2}>
                <Text>{previewLines[p]}</Text>
              </Box>,
            );
          }

          // Exactly one blank line after every note's title+preview
          lines.push(<Text key={`blank-${idx}`}> </Text>);

          return <Box flexDirection="column" key={idx}>{lines}</Box>;
        })}
      </Box>
    </Box>
  );
}

export default NoteList;
