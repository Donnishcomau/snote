/**
 * export the selected note to a Markdown file.
 *
 * Naming and the tags block follow upstream Automattic/simplenote-electron
 * lib/utils/export/to-zip.ts: first non-blank trimmed line as the filename
 * (invalid characters removed, 'untitled' when none, FILENAME_LENGTH cap),
 * tags appended as `\n\nTags:\n  a, b`. `sanitize-filename` is not a
 * dependency here, so invalid characters are stripped by hand.
 * proof: test/core/export-note.test.tsx
 */

import { join } from 'node:path';
import { secureExclusiveCreate } from './secure-fs';

import type { Note } from '@vendor/types';

import { exportFileName } from './export-name';

export { documentsDir, exportFileName } from './export-name';

// OMARCHY: boundary cast — ECONN/EEXIST-ish errno on a rejected write.
interface NodeError {
  code?: string;
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
 * Write the note into `dir` under a free path: `<name>.md`, then
 * `<name> 2.md`, `<name> 3.md`, ... — an existing file is never
 * overwritten. G4: the file is created exclusively (`flag: 'wx'`),
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
      secureExclusiveCreate(path, text, 0o666);
      return path;
    } catch (err) {
      // OMARCHY: boundary cast — the only retryable failure is EEXIST.
      if ((err as NodeError).code !== 'EEXIST') throw err;
    }
  }
}
