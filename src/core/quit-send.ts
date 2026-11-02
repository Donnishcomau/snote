// #401 — the quit step: hand every pending note change to the server at
// once, then wait (bounded) for the acknowledgements before main stops the
// trackers. main loads this module lazily at quit, so it imports nothing:
// a module shared with the start set would split a new start chunk.
// proof: test/integration/quit-send.test.ts

export const QUIT_SEND_MS = 4000;

// The catch-up record buildStore sets on its store (main.tsx, the line after
// the owed-ack settle). The same Symbol.for key is written there.
const CATCH_UP = Symbol.for('snote.noteCatchUpApplied');

interface QuitStore {
  getState(): {
    simperium: { connectionStatus: string; pendingNotes: Record<string, 'dirty' | 'sent'> };
  };
  subscribe(listener: () => void): () => void;
  client?: unknown;
}

type NoteBucket = { name?: string; touch?: (id: string) => unknown };

function pendingOf(store: QuitStore): Record<string, 'dirty' | 'sent'> {
  return store.getState().simperium.pendingNotes;
}

function connected(store: QuitStore): boolean {
  const online = (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false;
  return online && store.getState().simperium.connectionStatus === 'green';
}

/**
 * Resolve to the number of notes still pending when the step stops: at
 * once with nothing pending, without a send when the note channel is not
 * connected or this store's catch-up is not applied, else when every note
 * is acknowledged, the connection drops, or `boundMs` has passed. Never
 * rejects. proof: test/integration/quit-send.test.ts
 */
export function sendBeforeQuit(store: QuitStore, boundMs: number = QUIT_SEND_MS): Promise<number> {
  const count = (): number => {
    try {
      return Object.keys(pendingOf(store)).length;
    } catch {
      return 0;
    }
  };
  try {
    if (count() === 0) return Promise.resolve(0);
    const applied = (store as unknown as Record<symbol, unknown>)[CATCH_UP] === true;
    if (!applied || !connected(store)) return Promise.resolve(count());
    const buckets = ((store.client ?? {}) as { buckets?: NoteBucket[] }).buckets ?? [];
    const notes = buckets.find((b) => b?.name === 'note');
    const pending = pendingOf(store);
    // A 'sent' change is on the wire and waits for its acknowledgement; only
    // the changes still inside their edit delay are handed over now.
    for (const id of Object.keys(pending)) {
      if (pending[id] !== 'dirty') continue;
      try {
        void Promise.resolve(notes?.touch?.(id)).catch(() => {});
      } catch {
        /* the next start sends it */
      }
    }
  } catch {
    return Promise.resolve(count());
  }
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      try {
        unsubscribe?.();
      } catch {
        /* nothing left to stop */
      }
      resolve(count());
    };
    // The library marks a change acknowledged before it saves the change
    // version; the last acknowledgement ends the wait one turn later, so
    // that save is on disk before main stops the trackers.
    const check = (): void => {
      try {
        if (count() === 0) setTimeout(finish, 0);
        else if (!connected(store)) finish();
      } catch {
        finish();
      }
    };
    const timer = setTimeout(finish, Math.max(0, boundMs));
    const poll = setInterval(check, 100);
    try {
      unsubscribe = store.subscribe(check);
    } catch {
      /* the poll still ends the wait */
    }
    check();
  });
}

/** The one line main prints when a quit leaves changes unsent; '' for 0. */
export function unsentLine(unsent: number): string {
  if (unsent <= 0) return '';
  if (unsent === 1) {
    return '1 change not sent yet: it is kept on this computer and sent the next time snote starts';
  }
  return `${unsent} changes not sent yet: they are kept on this computer and sent the next time snote starts`;
}
