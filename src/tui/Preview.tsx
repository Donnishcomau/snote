import { Box, Text } from 'ink';
import React from 'react';
import removeMarkdown from 'remove-markdown';

import type { Note } from '@vendor/types';
import noteTitleAndPreview from '@vendor/utils/note-utils';
import { wrapLines } from '../core/wrap';
import { sanitizeForTerminal } from '../core/sanitize';
import { Divider } from './Divider';
import { PaneHeading } from './PaneHeading';
import isEmailTag from '@vendor/utils/is-email-tag';
import { theme } from './theme';

export function previewColWidth(width: number): number {
  return Math.min(Math.floor(width * 0.6) - 1, 100);
}

interface PreviewProps {
  note: Note | null;
  width: number;
  height: number;
  rendered?: boolean;
  cursorLine?: number | null;
  focused?: boolean;
  inTrash?: boolean;
}

/**
 * Check if a note has the markdown tag.
 */
function isMarkdownNote(note: Note): boolean {
  return note.systemTags.includes('markdown');
}

/**
 * Preview pane - shows note content (raw text or rendered markdown).
 */
export function Preview({ note, width, height, rendered = false, cursorLine, focused, inTrash = false }: PreviewProps): React.JSX.Element {
  // Reserve 1 line for header, 1 for status bar
  const previewHeight = height - 2;
  const colWidth = previewColWidth(width);

  if (!note) {
    return (
      <Box flexDirection="row">
        <Divider height={previewHeight} />
        <Box
          flexDirection="column"
          height={previewHeight}
          width={colWidth}
        >
          <PaneHeading label="Preview" focused={focused} />
          <Box flexDirection="column">
            <Text>Select a note to preview</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  const title = sanitizeForTerminal(noteTitleAndPreview(note).title);
  const content = sanitizeForTerminal(note.content || '');

  // When cursorLine is provided, use raw content with gutter; otherwise use rendered or raw as before
  let displayContent: string;
  let processedLines: { text: string; isHeading: boolean }[] = [];
  if (typeof cursorLine === 'number') {
    displayContent = content;
  } else if (rendered && isMarkdownNote(note)) {
    processedLines = [];
    content.split('\n').forEach(raw => {
      const headingMatch = raw.match(/^#{1,6}\s+(.*)$/);
      if (headingMatch) {
        processedLines.push({ text: removeMarkdown(headingMatch[1]), isHeading: true });
        return;
      }
      const checklistMatch = raw.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
      if (checklistMatch) {
        processedLines.push({
          text: (checklistMatch[1] === ' ' ? '☐ ' : '☑ ') + removeMarkdown(checklistMatch[2]),
          isHeading: false,
        });
        return;
      }
      const bulletMatch = raw.match(/^[-*]\s+(.*)$/);
      if (bulletMatch) {
        processedLines.push({ text: '• ' + removeMarkdown(bulletMatch[1]), isHeading: false });
        return;
      }
      processedLines.push({ text: removeMarkdown(raw), isHeading: false });
    });
    displayContent = processedLines.map(p => p.text).join('\n');
  } else {
    displayContent = content;
  }

  // Drop the leading body line when it equals the title and we're not in
  // checklist-cursor mode (T239).
  let bodyContent: string;
  let bodyHeadingFlags: boolean[] = [];
  if (typeof cursorLine !== 'number') {
    const nl = displayContent.indexOf('\n');
    const firstLine = nl === -1 ? displayContent : displayContent.slice(0, nl);
    if (firstLine === title) {
      bodyContent = nl === -1 ? '' : displayContent.slice(nl + 1);
      bodyHeadingFlags = processedLines.length > 1 ? processedLines.slice(1).map(p => p.isHeading) : [];
    } else {
      bodyContent = displayContent;
      bodyHeadingFlags = processedLines.map(p => p.isHeading);
    }
  } else {
    bodyContent = displayContent;
    bodyHeadingFlags = processedLines.map(p => p.isHeading);
  }
  const rows = wrapLines(bodyContent, colWidth);

  // Determine which row index in `rows` has line === cursorLine
  let cursorRowIndex: number | null = null;
  if (typeof cursorLine === 'number') {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].line === cursorLine) {
        cursorRowIndex = i;
        break;
      }
    }
  }

  // Display only: strip terminal control sequences, like title/content above.
  // OMARCHY: boundary cast
  const shownTags = note.tags.filter((t) => !isEmailTag(t)).map((t) => sanitizeForTerminal(t) as unknown as Note['tags'][number]);

  const avail = shownTags.length > 0 ? previewHeight - 3 : previewHeight - 2;
  let start = 0;
  let gutterRows: (string | null)[] = [];

  if (cursorRowIndex !== null && cursorRowIndex !== undefined) {
    const at = cursorRowIndex;
    start = at < avail ? 0 : at - avail + 1;
    gutterRows = rows.map((r, i) => {
      if (i - start < 0) return null; // won't be rendered
      if (r.line === cursorLine) return '>';
      return ' ';
    });
  }

  const visibleRows = rows.slice(start, start + avail);

  const titleText = <PaneHeading label={'Preview: ' + title} focused={focused} />;

  return (
    <Box flexDirection="row">
      <Divider height={previewHeight} />
      <Box
        flexDirection="column"
        height={previewHeight}
        width={colWidth}
      >
        {titleText}
        {shownTags.length > 0 ? (
          <Text>{shownTags.map((t) => '#' + t).join(' ')}</Text>
        ) : null}
        {inTrash ? (
          <Text> </Text>
        ) : (
          <Text><Text {...theme.accent}>g</Text> add tag</Text>
        )}
        <Box flexDirection="column">
          {visibleRows.map((row, idx) => {
            const gutter = gutterRows[start + idx] ?? '';
            const rowText = row.text || ' ';
            const isHeading = bodyHeadingFlags[row.line] ?? false;
            // OMARCHY: boundary cast — T255 colourises the checklist glyph inside
            // the single-row <Text> so Ink emits a reset before the glyph.
            const uncheckedMatch = rowText.match(/^(☐)(\s*)(.*)$/);
            const checkedMatch = rowText.match(/^(☑)(\s*)(.*)$/);
            let inner: string | React.JSX.Element;
            if (uncheckedMatch || checkedMatch) {
              const match = uncheckedMatch || checkedMatch;
              const isUnchecked = !!uncheckedMatch;
              const trailing = match[2] + match[3];
              inner = (
                <>
                  {' '}
                  <Text {...(isUnchecked ? theme.muted : theme.success)}>{match[1]}</Text>
                  {trailing}
                </>
              );
            } else {
              inner = rowText;
            }
            return (
              <Text key={idx} bold={isHeading} wrap="truncate">
                {gutter}{inner}
              </Text>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

export default Preview;
