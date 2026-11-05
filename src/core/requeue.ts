import type { Store } from 'redux';
import type * as A from '@vendor/state/action-types';
import type { EntityId, Note } from '@vendor/types';
import { mendWrite, type State } from './store';
import { notesAreEqual } from '@vendor/state/selectors';
import { heldBase, mergeKeepingText } from './held-lines';
import { mendOwn } from './editor-conflict-merge';
import { publishProblem } from './problem-signal';
import { sanitizeForTerminal } from './sanitize';
import { holdId, keepUnsent, markHandedOff, releaseAll } from './held-unsynced';
import { isUnsyncedCopy, type UnsyncedRecord } from './unsynced';
import { tagHashOf } from '@vendor/utils/tag-hash';
import type { TagName } from '@vendor/types';

export interface GhostReader {
  get(id: string): Promise<{ data?: Partial<Note> }>;
}

/**
 * #562: the ghost is the server's copy and may hold tags or systemTags that are not a list ({} after a remote
 * edit of a null field, a number, a string, null, absent). Both entry points read such a field as the
 * empty list, as the store does (fillTags), so one such note does not abandon the re-send of the others.
 */
const mendTags = (d: Partial<Note>): Partial<Note> => ({ ...d, tags: Array.isArray(d.tags) ? d.tags : [], systemTags: Array.isArray(d.systemTags) ? d.systemTags : [] });
const mendGhost = (ghosts: GhostReader): GhostReader => ({
  get: async (id) => {
    const r = await ghosts.get(id);
    const d = r.data;
    return d ? { ...r, data: mendTags(d) } : r;
  },
});

export async function unsyncedNoteIds(
  notes: Map<EntityId, Note>,
  ghosts: GhostReader,
  unsynced: UnsyncedRecord = {}
): Promise<EntityId[]> {
  ghosts = mendGhost(ghosts);
  const result: EntityId[] = [];

  for (const [id, note] of notes) {
    const g = (await ghosts.get(id)).data;

    // Never confirmed by server — no ghost data
    if (!g || !(g as Note).modificationDate) {
      result.push(id);
      continue;
    }

    // the record says this note holds a change the server never
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

/** R1 — the note fields that are tag lists; `rebaseOfflineEdit` merges them as sets. */
const SET_FIELDS = new Set(['tags', 'systemTags']);

/** A tag's identity is Simplenote's tag hash (case and Unicode form). */
const tagKey = (item: string): string => tagHashOf(item as TagName);

/** True when the tag has a tag hash (a lone surrogate makes `tagHashOf` throw). */
const hashable = (item: string): boolean => {
  try {
    tagKey(item);
    return true;
  } catch {
    return false;
  }
};

/** The string entries of a tag list that have a tag hash; anything else (a hostile or broken server list) is dropped. */
const tagList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && hashable(item)) : [];

/**
 * `into` with the change from `from` to `to` applied, comparing by `tagKey`:
 * items `to` dropped leave, items it added join at the end, and no tag is
 * listed twice.
 */
function mergeSet(into: unknown, from: unknown, to: unknown): string[] {
  const a = tagList(from).map(tagKey);
  const b = tagList(to).map(tagKey);
  const seen: string[] = [];
  const out: string[] = [];
  for (const item of tagList(into)) {
    const key = tagKey(item);
    if ((a.includes(key) && !b.includes(key)) || seen.includes(key)) continue;
    seen.push(key);
    out.push(item);
  }
  for (const item of tagList(to)) {
    const key = tagKey(item);
    if (a.includes(key) || seen.includes(key)) continue;
    seen.push(key);
    out.push(item);
  }
  return out;
}

/**
 * R1 — `into` with the tags the user changed in this session applied, per
 * tag: a tag in `now` that neither the held copy nor the server copy has joins;
 * a tag both copies have that `now` dropped leaves. Every other tag stays.
 */
function sessionSet(into: unknown, held: unknown, server: unknown, now: unknown): string[] {
  const h = tagList(held).map(tagKey);
  const s = tagList(server).map(tagKey);
  const n = tagList(now).map(tagKey);
  const out = tagList(into).filter((item) => {
    const key = tagKey(item);
    return n.includes(key) || !h.includes(key) || !s.includes(key);
  });
  const seen = out.map(tagKey);
  for (const item of tagList(now)) {
    const key = tagKey(item);
    if (h.includes(key) || s.includes(key) || seen.includes(key)) continue;
    seen.push(key);
    out.push(item);
  }
  return out;
}

/**
 * R1 — `note` with what the user changed in this session: a field whose
 * store copy at the hand-off (`now`) differs from both the held offline copy and
 * the server copy was set in this session and wins (tag lists per tag,
 * `sessionSet`). A store copy overwritten with the server copy is not a
 * session change. Content keeps its own rule (the hand-off skips a note whose
 * content moved on).
 *
 * Only a store copy newer than both copies holds a session change: a user
 * action stamps the note with this machine's time, while an older server
 * version still in the store (a remote change landing during the hand-off)
 * is older than the server copy and must not undo another device's change.
 */
function withSessionChanges(note: Note, held: Note, current: Partial<Note>, now: Note): Note {
  const newest = Math.max(Number(held.modificationDate) || 0, Number(current.modificationDate) || 0);
  if (!(Number(now.modificationDate) > newest)) return note;
  const merged: Record<string, unknown> = { ...note };
  for (const key of Object.keys(held)) {
    if (key === 'content' || key === 'modificationDate') continue;
    const k = key as keyof Note;
    if (SET_FIELDS.has(key)) merged[key] = sessionSet(merged[key], held[k], current[k], now[k]);
    else if (!same(now[k], held[k]) && !same(now[k], current[k])) merged[key] = now[k];
  }
  return merged as unknown as Note;
}

/**
 * true when the note fields worth syncing (content, deleted, tags,
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

/**
 * the note to send for an edit made while snote was closed, given what it
 * was last synced as (`base`), what this client has (`local`) and what the server
 * holds now (`current`). Content is merged three-way (both sides kept on a
 * same-line conflict); every other field keeps the offline change when there was
 * one and otherwise takes the server's value.
 *
 * R1 — `tags` and `systemTags` are merged as sets instead: the server's
 * list, plus what the offline copy added to `base`, minus what it removed, so a
 * tag another device set while snote was closed is kept.
 */
function rebaseOfflineEdit(base: Partial<Note>, local: Note, current: Partial<Note>, notify = true): Note {
  const merged: Record<string, unknown> = { ...current };
  for (const key of Object.keys(local)) {
    if (key === 'content') continue;
    const k = key as keyof Note;
    if (SET_FIELDS.has(key)) merged[key] = mergeSet(merged[key], base[k], local[k]);
    else if (!same(local[k], base[k])) merged[key] = local[k];
  }
  // #115 — never a lost change (`mergeKeepingText`); a conflict block says so on the notice line, the title sanitised.
  // proof: test/core/merge-keeping-text-property.test.ts
  const kept = mergeKeepingText(String(base.content ?? ''), String(local.content ?? ''), String(current.content ?? ''));
  if (kept.conflict && notify) publishProblem(`kept both versions of ${sanitizeForTerminal(kept.content.split('\n').find((line) => line.trim()) ?? '').trim().slice(0, 60)}`);
  merged.content = kept.content;
  merged.modificationDate = Math.max(Number(local.modificationDate) || 0, Date.now() / 1000);
  return merged as unknown as Note;
}

/** A note held for the start-up hand-off (see `requeueUnsynced`). */
interface Held {
  id: EntityId;
  base: Partial<Note>;
  local: Note;
  hadGhost: boolean;
  /** #657b: the not yet sent hand-off result the network-change hook put in the store */
  mine?: Note;
}

/**
 * The start-up hand-off of one held note against the server copy `current`, with
 * the store copy `now`: the note to send, or null when nothing is to be sent.
 */
function handOff(h: Held, current: Partial<Note>, now: Note | undefined, offlineCopy: Note | undefined, pending: boolean, notify = true): Note | null {
  const { base, local: heldLocal } = h;
  if (!h.hadGhost) {
    // decided only from the ghost as it is after the catch-up.
    if ((current as Note).modificationDate) {
      // The server holds this note (the re-index wrote its ghost): send the
      // local copy only when its content, deleted flag, tags or system tags
      // differ (dates ignored) and it is newer; otherwise nothing.
      return !noteFieldsEqual(heldLocal, current as Note) && heldLocal.modificationDate > (current as Note).modificationDate ? heldLocal : null;
    }
    // Still no ghost data: a note created offline — send it as before.
    return heldLocal;
  }
  // When the catch-up left this note holding content that is neither the held
  // offline copy nor the server's, it has already moved on: the sync library
  // rebased the offline edit onto the other device's change itself (and queued
  // the result), or an edit made in this session while we waited was sent.
  // Merging and sending it again would apply the offline edit twice. Only a
  // note still at the offline copy, or overwritten with the server's version
  // (a same-line conflict, a full re-index), needs the merge here.
  if (!now) return null;
  if (now.content !== heldLocal.content && now.content !== current.content) return null;
  // #28 — the offline edit is the note as loaded from state.json: a held
  // copy read after an edit made at once in this session also carries
  // that edit, which the server does not have yet.
  const offline = String((offlineCopy ?? heldLocal).content ?? '');
  const baseText = String(base.content ?? '');
  const currentText = String(current.content ?? '');
  if (offline !== baseText && heldBase(baseText, offline, currentText) === offline) return null;
  // #27, #20 — the parts of the offline edit the server copy
  // already holds (our own send the server applied before the quit, the
  // library's catch-up rebase; a re-index carries no change ids), read by
  // line position, are not merged in a second time: the merge starts from
  // the base with those parts applied.
  const mergeBase = { ...base, content: heldBase(baseText, String(heldLocal.content ?? ''), currentText) };
  const note = withSessionChanges(rebaseOfflineEdit(mergeBase, heldLocal, current, notify), heldLocal, current, now);
  if (same({ ...note, modificationDate: 0 }, { ...current, modificationDate: 0 })) return null;
  // #337b — the ghost read above can predate the acknowledgement of a change
  // the sync library already sent for this note (a pin, trash or tag pressed
  // after the restart is queued before the catch-up): when the merged note has
  // the store copy's fields, the library carries all of it, and dispatching
  // would only send a modificationDate-only change (a wasted server version).
  if (pending && noteFieldsEqual(note, now)) return null;
  return note;
}

/**
 * T85 — re-queue notes whose local copy is newer than the last sync.
 *
 * a note that WAS synced before and changed while snote was closed is
 * not sent straight away: sending it before the server's catch-up reply is applied
 * carries a stale source version, which the real service rejects twice and the
 * sync library then drops silently (`1 pending` forever). When `whenCaughtUp` is
 * given, those notes wait for it, are rebased onto the server's current version
 * (`rebaseOfflineEdit`) and are sent once.
 *
 * with a corrupt ghost file the local ghost has NO data for any note,
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
  unsynced: UnsyncedRecord = {},
  loadedNotes?: { get(id: EntityId): Note | undefined },
  saveNow?: (state: State) => void
): Promise<EntityId[]> {
  ghosts = mendGhost(ghosts);
  const notes = store.getState().data.notes;
  const ids = await unsyncedNoteIds(notes, ghosts, unsynced);
  const held: Held[] = [];

  for (const id of ids) {
    let note = store.getState().data.notes.get(id);
    if (!note) continue;
    // #333: an unconfirmed copy is mended in the store before anything can send it
    const content = mendOwn('', note.content ?? '');
    if (content !== note.content) {
      note = { ...note, content };
      store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: id, note } as A.ActionType);
    }

    const base = (await ghosts.get(id)).data;
    if (whenCaughtUp) {
      // a note whose ghost has no data (a corrupt ghost file, or one the
      // server has never confirmed) is held for the catch-up too: dispatched
      // before the full re-index it would be overwritten with the server's copy.
      // record the id in the store's hold registry while it waits: the
      // catch-up lands before a re-index completes yet dispatches nothing until
      // after it, so `pendingNotes` is still empty when the stale-delete diff
      // runs, and without this hold the diff would delete the note for the
      // 10-14 ms before the hand-off below re-imports it.
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
    // #115 — while the hand-off holds a note whose store copy is still the held
    // offline copy, the library applies the server's copy as it is instead of
    // rebasing the offline copy itself (its character rebase can drop lines):
    // the hand-off below is then the one merge. A note changed in this session
    // meanwhile is rebased by the library as before.
    // OMARCHY: boundary cast — the simperium client's buckets are untyped.
    const client = (store as { client?: { buckets?: Array<{ name?: string; beforeNetworkChange?(fn: unknown): void }> } }).client;
    const holdBucket = client?.buckets?.find((b) => b?.name === 'note');
    holdBucket?.beforeNetworkChange?.((id: string, data: unknown, base: unknown) => {
      const h = held.find((x) => x.id === id);
      const cur = store.getState().data.notes.get(id as EntityId);
      if (!h || !(same(cur, h.local) || (h.mine && same(cur, h.mine)))) return null;
      // #657b — before the library moves this note's ghost to the server copy,
      // the note the hand-off would make of it goes to state.json and to the store
      // (not yet sent), and the server copy the library then writes is dropped
      // (store.ts): no save, quit or kill finds the server copy in place of the
      // offline edit. The send waits for the catch-up, as before (each change of the
      // catch-up re-merges from the held copies). The copy keeps the held copy's
      // date, the one unsynced.json records, so a restart before the send holds it
      // again whatever the server copy's date; its text is mended as the send's (#333).
      // proof: test/integration/f356-hand-off-before-ghost.test.ts
      h.mine = undefined;
      if (saveNow && data && typeof data === 'object') {
        try {
          const state = store.getState();
          const server = mendTags(data as Partial<Note>);
          const merged = handOff(h, server, h.local, loadedNotes?.get(h.id), false, false); // the notice comes with the send below
          const note = merged && { ...merged, content: mendWrite(String(server.content ?? ''), String(merged.content ?? '')), modificationDate: h.local.modificationDate };
          saveNow({ ...state, data: { ...state.data, notes: new Map(state.data.notes).set(h.id, (note ?? server) as Note) } });
          if (note) {
            store.dispatch({ type: 'REMOTE_NOTE_UPDATE', noteId: h.id, note } as A.ActionType);
            h.mine = store.getState().data.notes.get(h.id);
            markHandedOff(store.getState, h.id, String(server.content ?? ''));
          }
        } catch {
          // state.json could not be written: the server copy goes to the store, as before
        }
      }
      return base;
    });
    await whenCaughtUp();
    let done = 0;
    try {
      for (const h of held) {
        const current = (await ghosts.get(h.id)).data ?? h.base;
        const inStore = store.getState().data.notes.get(h.id);
        // #657b — a store copy the hook above wrote is the held offline copy for this merge
        const now = h.mine && same(inStore, h.mine) ? h.local : inStore;
        const note = handOff(h, current, now, loadedNotes?.get(h.id), Boolean(store.getState().simperium.pendingNotes[h.id]));
        if (note) store.dispatch({ type: 'IMPORT_NOTE_WITH_ID', noteId: h.id, note } as A.ActionType);
        done++;
      }
    } finally {
      keepUnsent(store, held.slice(done).map((h) => h.id)); //; proof: test/integration/f383-hand-off-throw.test.tsx
      // every hold's hand-off has now run: release them for this store so
      // a LATER re-index diffs the ids like any other note (if the server really
      // dropped one, it goes then). The current re-index's `'index'` event has
      // already been reconciled while these holds were set.
      // in `finally`, so a throw inside the hand-off releases the holds
      // too instead of keeping them for the whole session; the error
      // itself is not swallowed here and still reaches the caller.
      releaseAll(store);
      holdBucket?.beforeNetworkChange?.(null);
      // (#707): the status bar and status.json count held notes; a hand-off that sends nothing dispatches nothing, so this no-op action makes them count again; proof: test/integration/f380-held-unsent.test.tsx
      store.dispatch({ type: 'HELD_RELEASED' } as unknown as A.ActionType);
    }
  }

  return ids;
}
