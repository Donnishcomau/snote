/**
 * the export file name and folder, shown in the `w` prompt before
 * anything is written (the writing itself, `exportNote` in export-note.ts,
 * loads only when an export is confirmed).
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { INVISIBLE_FORMAT } from './invisible';

/** Upstream FILENAME_LENGTH (to-zip.ts line 6). */
const FILENAME_LENGTH = 40;

/**
 * #637: every control (Unicode Cc) and format character (Cf: bidi marks,
 * zero-width characters, U+FEFF, U+2060, the soft hyphen, tag characters)
 * plus the line/paragraph separators, U+200D/ZWJ included (it can make a
 * name look like another extension), so an emoji sequence is refused in a
 * typed name and loses its joiners in a suggested one; the variation
 * selectors are not Cf and stay. No exported path holds one: the typed path
 * is refused (export-note.ts exportTarget), a suggested name loses them.
 * proof: test/core/export-path.test.ts
 */
export const UNSAFE_PATH = new RegExp(`\\p{Cc}|${INVISIBLE_FORMAT.source}`, 'u'); // #663: the shared list

/**
 * Characters upstream's sanitize-filename forbids (done by hand here),
 * plus UNSAFE_PATH.
 * proof: test/core/bidi-strip.test.ts
 */
const INVALID_CHARS = new RegExp(`[\\/\\\\?<>:*|"]|${UNSAFE_PATH.source}`, 'gu');

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
