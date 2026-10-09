import type { Store } from 'redux';
import type * as A from '@vendor/state/action-types';
import type { EntityId, Note } from '@vendor/types';
import type { State } from './store';
import { notesAreEqual } from '@vendor/state/selectors';
import { mergeEditorReturn } from './editor-conflict-merge';
import { holdId, releaseAll } from './held-unsynced';
import { isUnsyncedCopy, type UnsyncedRecord } from './unsynced';

export interface GhostReader {
  get(id: string): Promise<{ data?: Partial<Note> }>;
}

export async function unsyncedNoteIds(
  notes: Map<EntityId, Note>,
  ghosts: GhostReader,
  unsynced: UnsyncedRecord = {}
): Promise<EntityId[]> {
  const result: EntityId[] = [];

  for (const [id, note] of notes) {
    const g = (await ghosts.get(id)).data;

    // Never confirmed by server — no ghost data
    if (!g || !(g as Note).modificationDate) {
      result.push(id);
      continue;
    }

    // T493 — the record says this note holds a change the server never
    // confirmed: it goes whatever the dates say, as long as it differs
    // from the ghost (a copy the server already holds needs no re-send).
    if (isUnsyncedCopy(unsynced, id, note) && !noteFieldsEqual(note, g as Note)) {
      result.push(id);
      continue;
    }

    // Ghost exists: only re-sync when local note differs from ghost AND is newer
    if (!notesAreEqual(note, g as Note) && note.modificationDate > (g as Note).modificationDate) {
      result.push(id);
    }
  }

  return result;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const asSet = (items: readonly unknown[]): Set<unknown> => new Set(items);

/**
 * T479 — true when the note fields worth syncing (content, deleted, tags,
 * systemTags; tags compared as sets) are the same on both copies. Unlike the
 * sync library's `notesAreEqual` this ignores the dates, so "differs" no
 * longer collapses into the newer-date check.
 */
function noteFieldsEqual(a: Note, b: Partial<Note>): boolean {
  return (
    a.content === b.content &&
    !!a.deleted === !!b.deleted &&
    asSet(a.tags).size === asSet(b.tags ?? []).size &&
    [...a.tags].every((tag) => asSet(b.tags ?? []).has(tag)) &&
    asSet(a.systemTags).size === asSet(b.systemTags ?? []).size &&
    [...a.systemTags].every((tag) => asSet(b.systemTags ?? []).has(tag))
  );
}

function lineCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of text.split('\n')) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

/**
 * True when `current` already holds the content change the offline edit made to
 * `base`: every line it added is present at least as often, and every line it
 * removed is present no more often. The sync library's own catch-up rebase often
 * delivers the offline edit before `requeueUnsynced` runs; merging it again then
 * duplicates it.
 */
function offlineEditIncluded(base: string, local: string, current: string): boolean {
  const b = lineCounts(base);
  const l = lineCounts(local);
  const c = lineCounts(current);
  for (const line of new Set([...b.keys(), ...l.keys()])) {
    const inBase = b.get(line) ?? 0;
    const inLocal = l.get(line) ?? 0;
    const inCurrent = c.get(line) ?? 0;
    if (inLocal > inBase && inCurrent < inLocal) return false;
    if (inLocal < inBase && inCurrent > inLocal) return false;
  }
  return true;
}

/**
 * T314 — the note to send for an edit made while snote was closed, given what it
 * was last synced as (`base`), what this client has (`local`) and what the server
 * holds now (`current`). Content is merged three-way (both sides kept on a
 * same-line conflict); every other field keeps the offline change when there was
 * one and otherwise takes the server's value.
 */
function rebaseOfflineEdit(base: Partial<Note>, local: Note, current: Partial<Note>): Note {
  const merged: Record<string, unknown> = { ...current };
  for (const key of Object.keys(local)) {
    if (key === 'content') continue;
    const k = key as keyof Note;
    if (!same(local[k], base[k])) merged[key] = local[k];
  }
  merged.content = mergeEditorReturn(
    String(base.content ?? ''),
    String(local.content ?? ''),
    String(current.content ?? '')
  ).content;
  merged.modificationDate = Math.max(Number(local.modificationDate) || 0, Date.now() / 1000);
  return merged as unknown as Note;
}

/**
 * T85 — re-queue notes whose local copy is newer than the last sync.
 *
 * T313/T314 — a note that WAS synced before and changed while snote was closed is
 * not sent straight away: sending it before the server's catch-up reply is applied
 * carries a stale source version, which the real service rejects twice and the
 * sync library then drops silently (`1 pending` forever). When `whenCaughtUp` is
 * given, those notes wait for it, are rebased onto the server's current version
 * (`rebaseOfflineEdit`) and are sent once.
 *
 * T444 — with a corrupt ghost file the local ghost has NO data for any note,
 * so every saved note looks like the "never confirmed" case. Sent before the
 * full re-index, an offline edit gets overwritten with the server's copy and
 * is lost. So with `whenCaughtUp` given, those notes wait for the catch-up too:
 * afterwards, if the ghost now holds the note (the server has it), the local
 * copy goes only when its content differs from the ghost's AND it is newer —
 * no re-send of notes the server already has; if the ghost still has no data
 * (a note created offline), it is sent as before.
 */
export async function requeueUnsynced(
  store: Store<State, A.ActionType>,
  ghosts: GhostReader,
  whenCaughtUp?: () => Promise<void>,
  unsynced: UnsyncedRecord = {}
): Promise<EntityId[]> {
  const notes = store.getState().data.notes;
  const ids = await unsyncedNoteIds(notes, ghosts, unsynced);
  const held: Array<{ id: EntityId; base: Partial<Note>; local: Note; hadGhost: boolean }> = [];

  for (const id of ids) {
    const note = store.getState().data.notes.get(id);
    if (!note) continue;

    const base = (await ghosts.get(id)).data;
    if (whenCaughtUp) {
      // T444 — a note whose ghost has no data (a corrupt ghost file, or one the
      // server has never confirmed) is held for the catch-up too: dispatched
      // before the full re-index it would be overwritten with the server's copy.
      // T499 — record the id in the store's hold registry while it waits: the
      // catch-up lands before a re-index completes yet dispatches nothing until
      // after it, so `pendingNotes` is still empty when the stale-delete diff
      // runs, and without this hold the diff would delete the note for the
      // 10-14 ms before the hand-off below re-imports it (F141).
      holdId(store, id);
      held.push({
        id,
        base: base ?? {},
        local: note,
        hadGhost: Boolean(base && (base as Note).modificationDate),
      });
      continue;
    }

    store.dispatch({
      type: 'IMPORT_NOTE_WITH_ID',
      noteId: id,
      note,
    } as A.ActionType);
  }

  if (held.length > 0 && whenCaughtUp) {
    await whenCaughtUp();
    try {
      for (const { id, base, local: heldLocal, hadGhost } of held) {
        const current = (await ghosts.get(id)).data ?? base;
        if (!hadGhost) {
          // T444 — decided only from the ghost as it is after the catch-up.
          if ((current as Note).modificationDate) {
            // The server holds this note (the re-index wrote its ghost): send the
            // local copy only when its content, deleted flag, tags or system tags
            // differ (dates ignored) and it is newer; otherwise nothing.
            if (
              !noteFieldsEqual(heldLocal, current as Note) &&
              heldLocal.modificationDate > (current as Note).modificationDate
            ) {
              store.dispatch({
                type: 'IMPORT_NOTE_WITH_ID',
                noteId: id,
                note: heldLocal,
              } as A.ActionType);
            }
          } else {
            // Still no ghost data: a note created offline — send it as before.
            store.dispatch({
              type: 'IMPORT_NOTE_WITH_ID',
              noteId: id,
              note: heldLocal,
            } as A.ActionType);
          }
          continue;
        }
        // When the catch-up left this note holding content that is neither the held
        // offline copy nor the server's, it has already moved on: the sync library
        // rebased the offline edit onto the other device's change itself (and queued
        // the result), or an edit made in this session while we waited was sent.
        // Merging and sending it again would apply the offline edit twice. Only a
        // note still at the offline copy, or overwritten with the server's version
        // (a same-line conflict, a full re-index), needs the merge here.
        const now = store.getState().data.notes.get(id);
        if (!now) continue;
        if (now.content !== heldLocal.content && now.content !== current.content) continue;
        if (
          heldLocal.content !== String(base.content ?? '') &&
          offlineEditIncluded(String(base.content ?? ''), heldLocal.content, String(current.content ?? ''))
        )
          continue;
        const note = rebaseOfflineEdit(base, heldLocal, current);
        if (same({ ...note, modificationDate: 0 }, { ...current, modificationDate: 0 })) continue;
        store.dispatch({
          type: 'IMPORT_NOTE_WITH_ID',
          noteId: id,
          note,
        } as A.ActionType);
      }
    } finally {
      // T499 — every hold's hand-off has now run: release them for this store so
      // a LATER re-index diffs the ids like any other note (if the server really
      // dropped one, it goes then). The current re-index's `'index'` event has
      // already been reconciled while these holds were set.
      // T501 — in `finally`, so a throw inside the hand-off releases the holds
      // too instead of keeping them for the whole session (F143); the error
      // itself is not swallowed here and still reaches the caller.
      releaseAll(store);
    }
  }

  return ids;
}
