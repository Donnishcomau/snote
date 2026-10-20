/**
 * #65: the editor's file is a draft that outlives a failed editor or a crash.
 *
 * Every editor session writes its file into a folder of its own under the
 * open account's `<dataDir>/drafts` (0700, the file 0600), so a draft never
 * crosses accounts and is read only under that account's instance lock.
 * The folder is removed only once the note is saved to disk; whatever is
 * left at the next start of that account comes back as a new note.
 */
import { lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from 'redux';

import type { State } from './store';
import { afterNextSave } from './persistence';
import { secureMkdir } from './secure-fs';
import type { EntityId } from '@vendor/types';

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
 * are not drafts): a symlink is never followed. Returns the
 * number of notes restored.
 */
export function recoverDrafts(store: Store<State>, dir: string = draftsDir()): number {
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
    let texts: string[];
    try {
      if (!isRealDir(folder)) continue;
      texts = readdirSync(folder)
        .filter((f) => f.endsWith('.md') && lstatSync(join(folder, f)).isFile())
        .map((f) => readFileSync(join(folder, f), 'utf-8'));
    } catch {
      continue;
    }
    const notes = [...store.getState().data.notes.values()].map((n) => n.content);
    const fresh = texts.filter((t) => t.trim() !== '' && !notes.includes(t));
    for (const content of fresh) {
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId: crypto.randomUUID() as EntityId,
        note: { content, systemTags: [], tags: [] },
      } as never);
    }
    count += fresh.length;
    if (fresh.length > 0) restored.push(folder);
    else if (texts.length > 0) removeDrafts([folder]);
  }
  if (restored.length > 0) afterNextSave(() => removeDrafts(restored));
  return count;
}
