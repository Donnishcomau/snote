/**
 * the export file name and folder, shown in the `w` prompt before
 * anything is written (the writing itself, `exportNote` in export-note.ts,
 * loads only when an export is confirmed).
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/** Upstream FILENAME_LENGTH (to-zip.ts line 6). */
const FILENAME_LENGTH = 40;

/**
 * Characters upstream's sanitize-filename forbids (done by hand here),
 * plus the bidi controls, zero-width characters and line/paragraph
 * separators `sanitizeForTerminal` drops (U+200D/ZWJ stays allowed:
 * emoji such as the family emoji need it).
 * proof: test/core/bidi-strip.test.ts
 */
const INVALID_CHARS =
  /[\/\\?<>:*|"\u0000-\u001f\u007f-\u009f\u200B\u200C\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]/g;

/**
 * Export file name (no extension) for a note's content: the first non-blank
 * line, trimmed, with a leading markdown heading marker dropped from the
 * name only, invalid filename characters removed and truncated to
 * FILENAME_LENGTH; 'untitled' when there is no non-blank line.
 */
export function exportFileName(content: string): string {
  const raw = (content ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
  if (raw === undefined) return 'untitled';
  const cleaned = raw
    .replace(/^#\s+/, '')
    .replace(INVALID_CHARS, '')
    .slice(0, FILENAME_LENGTH);
  return cleaned === '' ? 'untitled' : cleaned;
}

/**
 * Where exports land: $XDG_DOCUMENTS_DIR, else ~/Documents.
 */
export function documentsDir(env: Record<string, string | undefined> = process.env): string {
  const xdg = env.XDG_DOCUMENTS_DIR;
  if (xdg && xdg.trim() !== '') return xdg;
  return join(homedir(), 'Documents');
}
