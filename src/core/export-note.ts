/**
 * T298: export the selected note to a Markdown file.
 *
 * Naming and the tags block follow upstream Automattic/simplenote-electron
 * lib/utils/export/to-zip.ts: first non-blank trimmed line as the filename
 * (invalid characters removed, 'untitled' when none, FILENAME_LENGTH cap),
 * tags appended as `\n\nTags:\n  a, b`. `sanitize-filename` is not a
 * dependency here, so invalid characters are stripped by hand.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

import type { Note } from '@vendor/types';

// OMARCHY: boundary cast — ECONN/EEXIST-ish errno on a rejected write.
interface NodeError {
  code?: string;
}

/** Upstream FILENAME_LENGTH (to-zip.ts line 6). */
export const FILENAME_LENGTH = 40;

/** Characters upstream's sanitize-filename forbids (done by hand here). */
const INVALID_CHARS = /[\/\\?<>:*|"\u0000-\u001f]/g;

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
 * The text written to disk: the note's content plus upstream's tags block
 * when the note has tags.
 */
export function exportText(note: Note): string {
  const content = note.content ?? '';
  const tagLines = note.tags ?? [];
  if (tagLines.length === 0) return content;
  return `${content}\n\nTags:\n  ${tagLines.join(', ')}`;
}

/**
 * Where exports land: $XDG_DOCUMENTS_DIR, else ~/Documents.
 */
export function documentsDir(env: Record<string, string | undefined> = process.env): string {
  const xdg = env.XDG_DOCUMENTS_DIR;
  if (xdg && xdg.trim() !== '') return xdg;
  return join(homedir(), 'Documents');
}

/**
 * Write the note into `dir` under a free path: `<name>.md`, then
 * `<name> 2.md`, `<name> 3.md`, ... — an existing file is never
 * overwritten. T306 G4: the file is created exclusively (`flag: 'wx'`),
 * so a symlink (dangling or not) planted at a candidate name makes the
 * write fail EEXIST and the next name is tried instead of being written
 * through. Returns the path written.
 */
export async function exportNote(note: Note, dir: string): Promise<string> {
  const base = exportFileName(note.content ?? '');
  const text = exportText(note);
  for (let n = 1; ; n++) {
    const path = join(dir, n === 1 ? `${base}.md` : `${base} ${n}.md`);
    try {
      await writeFile(path, text, { encoding: 'utf8', flag: 'wx' });
      return path;
    } catch (err) {
      // OMARCHY: boundary cast — the only retryable failure is EEXIST.
      if ((err as NodeError).code !== 'EEXIST') throw err;
    }
  }
}
