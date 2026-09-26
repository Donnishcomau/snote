import { Box, Text } from 'ink';
import React from 'react';

import type { Note } from '@vendor/types';
import { noteRow } from '../core/note-row';

export function listColWidth(width: number): number {
  return Math.min(Math.floor(width * 0.4), 60);
}

interface NoteListProps {
  notes: Note[];
  selectedIndex: number;
  width: number;
  height: number;
  query?: string;
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
}: NoteListProps): React.JSX.Element {
  // Reserve 1 line for header, 1 for status bar
  const listHeight = height - 2;
  const colWidth = listColWidth(width);

  // Each note takes exactly 4 lines
  const perNote = 4;
  const visibleCount = Math.max(1, Math.floor(listHeight / perNote));

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
      <Text>Notes</Text>

      {/* Note items */}
      <Box flexDirection="column">
        {notes.slice(visibleStart, visibleEnd).map((note, idx) => {
          const actualIndex = visibleStart + idx;
          const isSelected = actualIndex === selectedIndex;
          const { title, marker, previewLines } = noteRow(note, colWidth, query);

          const lines: React.ReactNode[] = [];

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
