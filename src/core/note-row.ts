import type { Note } from '@vendor/types';
import noteTitleAndPreview from '@vendor/utils/note-utils';
import { wrapLines } from './wrap';
import { sanitizeForTerminal } from './sanitize';

export type NoteRow = { title: string; marker: string; previewLines: string[] };

export function noteRow(note: Note, width: number, query?: string): NoteRow {
  const { title: rawTitle, preview: rawPreview } = noteTitleAndPreview(note, query);
  const title = sanitizeForTerminal(rawTitle);
  const preview = sanitizeForTerminal(rawPreview);

  const truncatedTitle =
    title.length > width - 2
      ? wrapLines(title, width - 4)[0].text + '..'
      : title;

  const marker = note.systemTags.includes('pinned') ? ' *' : '';

  const rows = wrapLines(preview, width - 2);
  const previewLines = rows
    .slice(0, 2)
    .map(r => r.text)
    .filter(t => t !== '');

  return { title: truncatedTitle, marker, previewLines };
}
