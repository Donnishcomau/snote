// Per-store registry of note ids that requeue is currently holding.
//
// Holds are tracked per store object via a WeakMap, so a hold on one store
// is invisible to another store, nothing is process-wide, and the registry
// never keeps a store object alive.

const held = new WeakMap<object, Set<string>>();

export function holdId(store: object, id: string): void {
  const ids = held.get(store);
  if (ids) {
    ids.add(id);
  } else {
    held.set(store, new Set([id]));
  }
}

export function releaseId(store: object, id: string): void {
  held.get(store)?.delete(id);
}

export function releaseAll(store: object): void {
  held.delete(store);
  handedOff.delete((store as { getState?: object }).getState ?? store);
}

export function isHeld(store: object, id: string): boolean {
  return held.get(store)?.has(id) ?? false;
}

// #657b: per store, the held notes whose start-up hand-off already ran inside the
// catch-up, with the server copy the library then writes into the store, once as its bucket's
// object (NOTE_BUCKET_UPDATE) and once as the app's note (REMOTE_NOTE_UPDATE). Keyed by the
// store's getState, the one function the store and its middleware share; cleared by releaseAll.
const HANDED_OFF_TYPES = ['NOTE_BUCKET_UPDATE', 'REMOTE_NOTE_UPDATE'];
const handedOff = new WeakMap<object, Map<string, { content: string; types: string[] }>>();

export function markHandedOff(getState: object, id: string, serverContent: string): void {
  const ids = handedOff.get(getState) ?? new Map<string, { content: string; types: string[] }>();
  ids.set(id, { content: serverContent, types: [...HANDED_OFF_TYPES] });
  handedOff.set(getState, ids);
}

/** True once per action type for the server copy that follows a hand-off: that copy must not replace the hand-off's result. */
export function takeHandedOff(getState: object, type: string, id: string, content: unknown): boolean {
  const mark = handedOff.get(getState)?.get(id);
  if (!mark || mark.content !== content || !mark.types.includes(type)) return false;
  mark.types = mark.types.filter((t) => t !== type);
  return true;
}

/** (#707): the unsent notes of a store: its pending notes plus the held ids its start-up hand-off has not yet sent. */
export function unsentCount(store: { getState(): { simperium: { pendingNotes: Record<string, unknown> } } }): number {
  const pending = store.getState().simperium.pendingNotes;
  let n = Object.keys(pending).length;
  for (const id of [...(held.get(store) ?? []), ...(unsent.get(store) ?? [])]) if (!(id in pending)) n++;
  return n;
}

// the held ids a hand-off that threw did not send. An id leaves once a later local change of it is
// pending (that send carries the edit; pendingNotes counts it until the server confirms) or its note is gone.
const unsent = new WeakMap<object, string[]>();
type KeepStore = {
  getState(): { simperium: { pendingNotes: Record<string, unknown> }; data: { notes: { has(id: string): boolean } } };
  subscribe(listener: () => void): () => void;
};
/** true while a thrown hand-off still counts this id as unsent; the stale-delete reconcile spares it. */
export function isUnsent(store: object, id: string): boolean {
  return unsent.get(store)?.includes(id) ?? false;
}
export function keepUnsent(store: KeepStore, ids: string[]): void {
  unsent.set(store, ids);
  const stop = store.subscribe(() => {
    const { simperium, data } = store.getState();
    const left = (unsent.get(store) ?? []).filter((id) => !(id in simperium.pendingNotes) && data.notes.has(id));
    unsent.set(store, left);
    if (left.length === 0) stop();
  });
}
