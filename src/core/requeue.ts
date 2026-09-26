import type { Store } from 'redux';
import type * as A from '@vendor/state/action-types';
import type { EntityId, Note } from '@vendor/types';
import type { State } from './store';
import { notesAreEqual } from '@vendor/state/selectors';
import { mergeEditorReturn } from './editor-conflict-merge';

export interface GhostReader {
  get(id: string): Promise<{ data?: Partial<Note> }>;
}

export async function unsyncedNoteIds(
  notes: Map<EntityId, Note>,
  ghosts: GhostReader
): Promise<EntityId[]> {
  const result: EntityId[] = [];

  for (const [id, note] of notes) {
    const g = (await ghosts.get(id)).data;

    // Never confirmed by server — no ghost data
    if (!g || !(g as Note).modificationDate) {
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
export function offlineEditIncluded(base: string, local: string, current: string): boolean {
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
export function rebaseOfflineEdit(base: Partial<Note>, local: Note, current: Partial<Note>): Note {
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
 * (`rebaseOfflineEdit`) and are sent once. Notes the server has never confirmed
 * (no ghost) are sent immediately as before.
 */
export async function requeueUnsynced(
  store: Store<State, A.ActionType>,
  ghosts: GhostReader,
  whenCaughtUp?: () => Promise<void>
): Promise<EntityId[]> {
  const ids = await unsyncedNoteIds(store.getState().data.notes, ghosts);
  const held: Array<{ id: EntityId; base: Partial<Note>; local: Note }> = [];

  for (const id of ids) {
    const note = store.getState().data.notes.get(id);
    if (!note) continue;

    const base = (await ghosts.get(id)).data;
    if (whenCaughtUp && base && (base as Note).modificationDate) {
      held.push({ id, base, local: note });
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
    for (const { id, base, local: heldLocal } of held) {
      const current = (await ghosts.get(id)).data ?? base;
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
  }

  return ids;
}
