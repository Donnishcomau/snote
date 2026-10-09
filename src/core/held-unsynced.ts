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
}

export function isHeld(store: object, id: string): boolean {
  return held.get(store)?.has(id) ?? false;
}
