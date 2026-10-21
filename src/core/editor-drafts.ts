/**
 * #65: the editor's file is a draft that outlives a failed editor or a crash.
 *
 * Every editor session writes its file into a folder of its own under the
 * open account's `<dataDir>/drafts` (0700, the file 0600), so a draft never
 * crosses accounts and is read only under that account's instance lock.
 * The folder is removed only once the note is saved to disk; whatever is
 * left at the next start of that account comes back as a new note, unless
 * the file is larger than MAX_DRAFT_BYTES: that one stays on disk, unread.
 */
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from 'redux';

import type { State } from './store';
import { afterNextSave } from './persistence';
import { secureMkdir, secureWriteFileSync } from './secure-fs';
import type { EntityId } from '@vendor/types';

/**
 * #89: the largest draft recoverDrafts loads, in bytes (1 MiB). snote has no
 * note size limit of its own; this bounds what one start reads into memory
 * from a file in the drafts folder.
 */
export const MAX_DRAFT_BYTES = 1_048_576;

/**
 * #89: the sidecar of an edit of an EXISTING note, `source.json` in the same
 * per-session draft folder (0600). Format version 1, fixed once released:
 * `{"v":1,"noteId":"<id>","sha256":"<sha256 hex of the note text when the edit began>"}`.
 * Every later version must keep reading v1. Older versions read only the
 * `.md` file and ignore it. Missing, unreadable, oversized, a symlink, another
 * `v` or any invalid field: no sidecar, and the draft comes back as a new note.
 */
export const SOURCE_FILE = 'source.json';
const SOURCE_MAX_BYTES = 4096;
const NOTE_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;
const SHA256_SHAPE = /^[0-9a-f]{64}$/;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** Write the sidecar for an edit of note *noteId* whose text is *text*; a failure only means no sidecar. */
export function writeSource(folder: string, noteId: string, text: string): void {
  try {
    secureWriteFileSync(join(folder, SOURCE_FILE), JSON.stringify({ v: 1, noteId, sha256: sha256(text) }));
  } catch {
    // no sidecar: the draft is restored as a new note
  }
}

function readSource(folder: string): { noteId: string; sha256: string } | null {
  const read = readDraft(join(folder, SOURCE_FILE), SOURCE_MAX_BYTES);
  if (read === null || !('text' in read)) return null;
  try {
    const j: unknown = JSON.parse(read.text);
    if (typeof j !== 'object' || j === null) return null;
    const { v, noteId, sha256: hash } = j as Record<string, unknown>;
    if (v !== 1 || typeof noteId !== 'string' || typeof hash !== 'string') return null;
    return NOTE_ID_SHAPE.test(noteId) && SHA256_SHAPE.test(hash) ? { noteId, sha256: hash } : null;
  } catch {
    return null;
  }
}

/** A draft over MAX_DRAFT_BYTES that recoverDrafts left on disk, unread. */
export interface TooLargeDraft {
  folder: string;
  bytes: number;
}

// The open account's drafts folder, set by buildStore.
let accountDrafts: string | null = null;

/** buildStore sets `<dataDir>/drafts` for the account it opens; null clears it. */
export function setDraftsDir(dir: string | null): void {
  accountDrafts = dir;
}

/**
 * The drafts folder: the open account's `<dataDir>/drafts`. Before any
 * account is open (tests only) it is `<XDG_STATE_HOME or HOME/.local/state>/snote/drafts`.
 */
export function draftsDir(env: NodeJS.ProcessEnv = process.env): string {
  if (accountDrafts !== null) return accountDrafts;
  const state = env.XDG_STATE_HOME ? env.XDG_STATE_HOME : join(env.HOME ?? '', '.local', 'state');
  return join(state, 'snote', 'drafts');
}

/** True when *p* is a real folder (lstat: a symlink is not one). */
function isRealDir(p: string): boolean {
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Create the drafts folder (0700) and return it. A drafts folder that
 * exists but is not a real folder (a symlink) is refused: nothing is written.
 */
export function ensureDraftsDir(): string {
  const dir = draftsDir();
  let exists = true;
  try {
    lstatSync(dir);
  } catch {
    exists = false;
  }
  if (exists && !isRealDir(dir)) throw new Error('drafts folder is not a folder: ' + dir);
  secureMkdir(dir);
  return dir;
}

type DraftRead = { text: string } | { tooLarge: number } | { unreadable: true } | null;

/**
 * Read one draft through ONE file descriptor: open it (a symlink is refused,
 * ELOOP; O_NONBLOCK so a named pipe cannot hang the start), fstat that
 * descriptor, and read only what that check allowed. Null = not a draft (a
 * symlink or not a regular file); unreadable = a regular file that could not
 * be read (its folder is kept). There is no second lookup of the path
 * between the check and the read.
 */
function readDraft(path: string, cap: number = MAX_DRAFT_BYTES): DraftRead {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch {
    // the open failed: a symlink (O_NOFOLLOW) is not a draft; anything else could not be read
    const st = lstatSync(path, { throwIfNoEntry: false });
    return st && !st.isSymbolicLink() ? { unreadable: true } : null;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return null;
    if (st.size > cap) return { tooLarge: st.size };
    const buf = Buffer.alloc(st.size + 1);
    const n = readSync(fd, buf, 0, buf.length, 0);
    if (n > st.size) return { tooLarge: n }; // the file grew after the check
    return { text: buf.toString('utf-8', 0, n) };
  } catch {
    return { unreadable: true };
  } finally {
    closeSync(fd);
  }
}

/**
 * Remove draft folders. A folder that cannot be removed stays: the next
 * start removes it once its text is found in a note.
 */
export function removeDrafts(folders: string[]): void {
  for (const folder of folders) {
    try {
      rmSync(folder, { recursive: true, force: true });
    } catch {
      // left for the next start
    }
  }
}

/**
 * At start-up: every draft whose text no note holds becomes a new note (an
 * existing note is never changed); its folder is removed after the next
 * save to disk. A draft that is empty or equal to a note is removed at once.
 * Only regular `.md` files are read (the editor's own swap or backup files
 * are not drafts): a file over MAX_DRAFT_BYTES
 * is not loaded and its folder is never removed; it is added to *tooLarge*
 * when given. A folder with one draft and a valid sidecar whose note still
 * holds the text the edit began with gets the draft as that note's text (one
 * note, no second one); when the note changed, was deleted or is missing, the
 * draft comes back as a new note and *report.changed* counts it. Returns the
 * number of notes restored.
 */
export function recoverDrafts(
  store: Store<State>,
  dir: string = draftsDir(),
  tooLarge?: TooLargeDraft[],
  report?: { changed: number },
): number {
  if (!isRealDir(dir)) return 0;
  let folders: string[];
  try {
    folders = readdirSync(dir).filter((n) => n.startsWith('snote-'));
  } catch {
    return 0;
  }
  const restored: string[] = [];
  let count = 0;
  for (const name of folders) {
    const folder = join(dir, name);
    const texts: string[] = [];
    let kept = 0;
    try {
      if (!isRealDir(folder)) continue;
      for (const f of readdirSync(folder).filter((n) => n.endsWith('.md'))) {
        const draft = readDraft(join(folder, f));
        if (draft === null) continue;
        if ('text' in draft) texts.push(draft.text);
        else {
          kept++; // removal is folder-wide: a draft left unread keeps its folder
          if ('tooLarge' in draft) tooLarge?.push({ folder, bytes: draft.tooLarge });
        }
      }
    } catch {
      continue;
    }
    const notes = [...store.getState().data.notes.values()].map((n) => n.content);
    const fresh = texts.filter((t) => t.trim() !== '' && !notes.includes(t));
    const source = fresh.length === 1 && texts.length === 1 && kept === 0 ? readSource(folder) : null;
    const target = source ? store.getState().data.notes.get(source.noteId as EntityId) : undefined;
    if (source && target && !target.deleted && sha256(target.content ?? '') === source.sha256) {
      store.dispatch({ type: 'EDIT_NOTE', noteId: source.noteId, changes: { content: fresh[0] } } as never);
    } else {
      if (source && report) report.changed++;
      for (const content of fresh) {
        store.dispatch({
          type: 'CREATE_NOTE_WITH_ID',
          noteId: crypto.randomUUID() as EntityId,
          note: { content, systemTags: [], tags: [] },
        } as never);
      }
    }
    count += fresh.length;
    // a folder holding an oversized or unreadable draft is never queued for removal: removal is folder-wide
    if (fresh.length > 0 && kept === 0) restored.push(folder);
    else if (texts.length > 0 && kept === 0) removeDrafts([folder]);
  }
  if (restored.length > 0) afterNextSave(() => removeDrafts(restored));
  return count;
}

/**
 * #89: the one notice for a start's recovery, or null when nothing came back
 * and nothing was left. Shown in the info style (publishInfo).
 */
export function recoveryNotice(restored: number, tooLarge: TooLargeDraft[], changed: number = 0): string | null {
  const parts: string[] = [];
  const plain = restored - changed;
  if (plain > 0) parts.push(`Restored ${plain} ${plain === 1 ? 'note' : 'notes'} from an unfinished editor session`);
  if (changed > 0) parts.push(`Restored ${changed} ${changed === 1 ? 'note as a new note' : 'notes as new notes'}: the original changed meanwhile`);
  if (tooLarge.length === 1) {
    parts.push(`Draft too large to restore (${Math.ceil(tooLarge[0].bytes / 1024)} KB), kept on disk: ${tooLarge[0].folder}`);
  } else if (tooLarge.length > 1) {
    parts.push(`${tooLarge.length} drafts too large to restore, kept on disk in ${draftsDir()}`);
  }
  return parts.length > 0 ? parts.join('. ') : null;
}
