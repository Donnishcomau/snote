import type { Note } from '@vendor/types';
import noteTitleAndPreview from '@vendor/utils/note-utils';
import { wrapLines } from './wrap';
import { sanitizeForTerminal } from './sanitize';
import { cellWidth } from './cells';

type NoteRow = { title: string; marker: string; previewLines: string[] };

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * #139: terminal cells of a title. A title of wide (2-cell) characters is
 * half as many characters as cells, so the truncation trigger must measure
 * cells, not `length` — otherwise CJK titles run past the row width.
 */
function displayCells(s: string): number {
  let cells = 0;
  for (const { segment } of segmenter.segment(s)) cells += cellWidth(segment);
  return cells;
}

export function noteRow(note: Note, width: number, query?: string): NoteRow {
  const { title: rawTitle, preview: rawPreview } = noteTitleAndPreview(note, query);
  const title = sanitizeForTerminal(rawTitle);
  const preview = sanitizeForTerminal(rawPreview);

  // #139: cut by display width, not character count (wrapLines already breaks
  // on cell boundaries, so no wide character is ever split in half).
  const truncatedTitle =
    displayCells(title) > width - 2
      ? wrapLines(title, width - 4)[0].text + '..'
      : title;

  // Pinned notes no longer carry a trailing ` *` marker: since the
  // pinned group shows as a block above a rule, so the marker is redundant.
  // NoteRow keeps the field and NoteList still renders it (always empty).
  const marker = '';

  const rows = wrapLines(preview, width - 4);
  const previewLines = rows
    .slice(0, 2)
    .map(r => r.text)
    .filter(t => t !== '');

  return { title: truncatedTitle, marker, previewLines };
}
