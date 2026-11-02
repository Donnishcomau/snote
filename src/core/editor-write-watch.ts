/**
 * #97: while the external editor is open, each write of its draft file (`:w`)
 * becomes the note's text. Only the one draft file of the session is read,
 * through readDraft (passed in by editor.ts): one descriptor opened with
 * O_NOFOLLOW, so a symlink put in its place, or anything that is not a regular
 * file, is not read.
 * proof: test/core/editor-write-watch.test.tsx
 * Loaded by a dynamic import when the editor opens, so it is not part of the
 * start; it imports no snote module, so no start module moves into a shared chunk.
 */
import { watch } from 'node:fs';
import { basename, dirname } from 'node:path';

import type { readDraft } from './editor-drafts';

/** How long the draft must stay quiet after a change before it is read (ms). */
export const WRITE_SETTLE_MS = 150;

/**
 * Watch `file` and call `onWrite(text)` once per settled write whose text is
 * not empty and differs from the last text seen (`initial` at first).
 * Returns stop(): it ends the watch and gives the last text handed on.
 * a settled read of the same text again (an identical `:w`) is not a write, but it moves the
 * draft's file time, so `onSame(text)` hears of it (editor.ts renews the sidecar).
 */
export function watchDraftWrites(
  file: string,
  initial: string,
  read: typeof readDraft,
  onWrite: (text: string) => void,
  onSettled?: () => void, // test seam: called after each settled read
  onSame?: (text: string) => void,
): () => string {
  let last = initial;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const name = basename(file);
  const settle = (): void => {
    timer = undefined;
    const got = read(file);
    if (got !== null && 'text' in got && got.text.trim() !== '') {
      if (got.text === last) {
        try {
          onSame?.(got.text);
        } catch {
          // the sidecar keeps its older file time: the draft may come back as a second note, never lost
        }
      } else {
        last = got.text;
        try {
          onWrite(got.text);
        } catch {
          // D5: a write that could not be handed on is skipped; the close path still stores the file
        }
      }
    }
    onSettled?.();
  };
  const settleNow = (): void => {
    if (timer === undefined) return;
    clearTimeout(timer);
    settle();
  };
  live.add(settleNow);
  const watcher = watch(dirname(file), (_event, changed) => {
    if (changed !== null && changed !== name) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(settle, WRITE_SETTLE_MS);
  });
  watcher.on('error', () => watcher.close());
  watcher.unref();
  timer = setTimeout(settle, WRITE_SETTLE_MS); // a write made before the watch began is read too
  return () => {
    live.delete(settleNow);
    if (timer !== undefined) clearTimeout(timer);
    watcher.close();
    return last;
  };
}

// #478: the watchers that are running; each entry settles its own pending read at once.
const live = new Set<() => void>();

/**
 * #478: the quit step calls this before it hands changes to the server: every running watcher whose
 * settle wait has not ended reads its draft now, as that wait would have, so an identical `:w` renews
 * the sidecar and a real one reaches the note before the last save. Does nothing with no editor open.
 * proof: test/core/editor-write-quit.test.tsx
 */
export function settleDraftWrites(): void {
  for (const settleNow of [...live]) {
    try {
      settleNow();
    } catch {
      // the draft stays on disk: the next start finds it, as after a kill
    }
  }
}
