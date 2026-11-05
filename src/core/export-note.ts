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

import { homedir } from 'node:os';
import { extname, isAbsolute, join } from 'node:path';
import { secureExclusiveCreate } from './secure-fs';

import type { Note } from '@vendor/types';

import { documentsDir, exportFileName, UNSAFE_PATH } from './export-name';

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
export async function exportNote(note: Note, dir: string, name = `${exportFileName(note.content ?? '')}.md`): Promise<string> {
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length);
  const text = exportText(note);
  for (let n = 1; ; n++) {
    const path = join(dir, n === 1 ? name : `${base} ${n}${ext}`);
    try {
      secureExclusiveCreate(path, text, 0o666);
      return path;
    } catch (err) {
      // OMARCHY: boundary cast — the only retryable failure is EEXIST.
      if ((err as NodeError).code !== 'EEXIST') throw err;
    }
  }
}

/**
 * #637: the folder and file name the `w` prompt's typed path names, split
 * at the typed text's last `/` (not after a normalise, so `sub/..` is not
 * read as a file named after the parent). Only a leading `~` or `~/` is the
 * home folder; a relative folder sits in the documents folder; an empty name
 * takes the suggested one; a name with no extension gets `.md`, and a name
 * that is only an extension (`.md`) is refused like `.` and `..`. The typed
 * folder is the user's choice, `..` included: the safety is the exclusive
 * create in exportNote, not this function.
 * proof: test/core/export-path.test.ts
 */
export function exportTarget(typed: string, suggested: string, docs: string, home: string): { dir: string; name: string } | { error: string } {
  const v = typed.trim() === '~' ? '~/' : typed.trim();
  if (UNSAFE_PATH.test(v)) return { error: 'the path has a character snote cannot write' };
  const cut = v.lastIndexOf('/');
  const folder = v.slice(0, cut + 1);
  const raw = v.slice(cut + 1);
  if (raw === '.' || raw === '..') return { error: 'type a file name' };
  if (/^\.[^.]+$/.test(raw)) return { error: 'type a file name' }; // only an extension (`.md`): no stem to name the file
  const dir = folder.startsWith('~/') ? join(home, folder.slice(2)) : isAbsolute(folder) ? folder : join(docs, folder);
  return { dir, name: raw === '' ? suggested : extname(raw) === '' ? `${raw}.md` : raw };
}

/**
 * #637: export the note to the typed path; an existing file is kept (exportNote).
 * A failure rejects with one fixed text (the folder resolved), not Node's
 * own message.
 */
export async function exportTo(note: Note, typed: string): Promise<string> {
  const t = exportTarget(typed, `${exportFileName(note.content ?? '')}.md`, documentsDir(), homedir());
  if ('error' in t) throw new Error(t.error);
  try {
    return await exportNote(note, t.dir, t.name);
  } catch (err) {
    // OMARCHY: boundary cast — the errno picks the fixed text.
    const code = (err as NodeError).code;
    if (code === undefined) throw err; // snote's own fixed text (a short write), no path in it
    if (code === 'ENOENT') throw new Error(`folder does not exist: ${t.dir}`);
    if (code === 'ENOTDIR') throw new Error(`not a folder: ${t.dir}`);
    throw new Error(code === 'ENAMETOOLONG' ? 'the file name is too long' : 'could not write the file');
  }
}
