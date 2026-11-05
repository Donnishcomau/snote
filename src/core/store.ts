import './browser-shim';

import { createStore, combineReducers, applyMiddleware, Store, type Middleware } from 'redux';

import dataReducer from '@vendor/state/data/reducer';
import uiReducer from '@vendor/state/ui/reducer';
import settingsReducer from '@vendor/state/settings/reducer';
import simperiumReducer, {
  initialState as simperiumInitialState,
  type SimperiumState,
} from './simperium-reducer';
import { takeHandedOff } from './held-unsynced';
import { initSimperium } from '@vendor/state/simperium/middleware';
import { installSimperiumVersionFix } from './simperium-version-fix';
import { installSimperiumReconnectFix } from './simperium-reconnect-fix';
import { installSimperiumStaleDeleteFix } from './simperium-stale-delete-fix';
import { installSimperiumRemovedNoteFix } from './simperium-removed-note-fix';
import { installSimperiumAuthWatchdog } from './simperium-auth-watchdog';
import { installStaleReconnect } from './stale-reconnect';
import { installSimperiumRevisionCacheFix } from './simperium-revision-cache-fix';
import { installSimperiumLocalQueueFix } from './simperium-local-queue-fix';
// #85 — the sync socket sends a User-Agent and closes refused connections.
import { snoteSocketOptions, startConnectSession } from './websocket-provider';
// a force-sync step that fails shows on the notice line instead of vanishing.
import { problemText, publishProblem } from './problem-signal';

import type * as A from '@vendor/state/action-types';
import type * as T from '@vendor/types';

/**
 * Root state shape matching the vendored Simplenote app structure.
 */
export interface State {
  data: ReturnType<typeof dataReducer>;
  ui: ReturnType<typeof uiReducer>;
  settings: ReturnType<typeof settingsReducer>;
  // Simperium connection state (minimal for headless use)
  simperium: SimperiumState & {
    ghosts: [Map<string, string | undefined>, Map<string, Map<string, unknown>>];
  };
  // Browser state (stubbed for Node)
  browser: {
    windowWidth: number;
    windowHeight: number;
    systemTheme: 'light' | 'dark';
  };
}

/**
 * Sync configuration for the store.
 */
export interface SyncConfig {
  appId: string;
  token: string;
  username: string;
  // onClient hands the constructed sync client back to src/core (T80)
  clientOptions?: { url?: string; onClient?: (client: unknown) => void };
  ghostStoreProvider?: (bucket: { name: string }) => unknown;
  // Added for test configuration
  noteEditDelayMs?: number;
  // Added for the auth watchdog
  authWatchdogMs?: number;
  // #625: how long a stale status lasts before snote reconnects (tests shorten it)
  staleReconnectMs?: number;
  // Added for logout callback testing
  onLogout?: () => void;
}

/**
 * Options for creating the store.
 */
interface StoreOptions {
  /** Stub client for testing - if provided, simperium middleware is skipped */
  stubClient?: unknown;
  /** Sync configuration - if provided, wires up simperium middleware */
  sync?: SyncConfig;
  /** Preloaded state from disk - used to restore persisted data */
  preloadedState?: Partial<State>;
}

/**
 * Root reducer combining all vendored reducers.
 */
const baseReducer = combineReducers<State>({
  data: dataReducer,
  ui: uiReducer,
  settings: settingsReducer,
  simperium: simperiumReducer,
  browser: (
    state = { windowWidth: 1024, windowHeight: 768, systemTheme: 'light' as const }
  ) => state,
});

/**
 * guard the root reducer against nameless tags.
 *
 * The sync middleware feeds `TAG_BUCKET_UPDATE` / `REMOTE_TAG_UPDATE`
 * straight from the wire into the vendored tag reducer, which stores
 * `action.tag` verbatim. When the sync library re-queues a tag whose ghost
 * is unknown locally (a tag only attached to a locally created note), the
 * bucket answers with no data at all and an entry without a name lands in
 * `data.tags` — the crash on the second start. Drop any tag action whose
 * payload has no non-empty string name.
 */
const rootReducer = (
  state: State | undefined,
  action: A.ActionType
): State => {
  if (action.type === 'TAG_BUCKET_UPDATE' || action.type === 'REMOTE_TAG_UPDATE') {
    const tag = (action as { tag?: { name?: unknown } }).tag;
    if (!tag || typeof tag.name !== 'string' || tag.name === '') {
      return state as State;
    }
  }
  const next = baseReducer(state, action);
  // a note's versions are held only while its history is open, for
  // one note at most.
  const wasOpen = state?.ui?.showRevisions === true;
  if (wasOpen && !next.ui?.showRevisions && (next.data?.noteRevisions?.size ?? 0) > 0) {
    return { ...next, data: { ...next.data, noteRevisions: new Map() } };
  }
  if (action.type === 'LOAD_REVISIONS') {
    if (wasOpen && state?.ui?.openedNote !== action.noteId) {
      return { ...next, data: { ...next.data, noteRevisions: state!.data.noteRevisions } };
    }
    if (next.data.noteRevisions.size > 1) {
      const keep = next.data.noteRevisions.get(action.noteId)!;
      return { ...next, data: { ...next.data, noteRevisions: new Map([[action.noteId, keep]]) } };
    }
  }
  return next;
};

/**
 * #558: a note from another Simplenote client (or the API) may arrive without tags or
 * systemTags, or with null for either (a remote edit of a null field arrives as {}); every screen, reducer and search reads them as
 * arrays. The store holds [] for an absent one, set at the mend seam below and in the preloaded notes.
 * The ghost keeps the server's copy; requeue compares both as sets, so nothing is sent.
 * proof: test/tui/note-shape-render.test.tsx
 */
const fillTags = <N extends { tags?: unknown; systemTags?: unknown }>(n: N): N =>
  Array.isArray(n.tags) && Array.isArray(n.systemTags)
    ? n
    : { ...n, tags: Array.isArray(n.tags) ? n.tags : [], systemTags: Array.isArray(n.systemTags) ? n.systemTags : [] };

/**
 * #333: the one seam where note text reaches the store. A lone surrogate cannot go
 * through the sync library's diff, so a lone half in the text we write becomes U+FFFD;
 * a tail equal to the note's current text (the other device's text) is kept as it is.
 * proof: test/core/lone-surrogate-writers.test.ts
 */
export const mendWrite = (cur: string, t: string): string => {
  const n = t.endsWith(cur) ? t.length - cur.length : t.length;
  return t.slice(0, n).replace(/\p{Cs}/gu, '�') + t.slice(n);
};
const mendMiddleware: Middleware<object, State> = (api) => (next) => (action0) => {
  const action = (action0 as { note?: object }).note ? { ...action0, note: fillTags((action0 as { note: object }).note) } : action0;
  const a = action as { type: string; noteId: string; changes?: { content?: string }; note?: { content?: string } };
  // #657b: the server copy behind a held note's hand-off stays out of the store (requeue.ts)
  if (takeHandedOff(api.getState, a.type, a.noteId, a.note?.content)) return action;
  const key = a.changes ? 'changes' : 'note';
  const text = a[key]?.content;
  if (/^(EDIT|CREATE|IMPORT|RESTORE)_NOTE/.test(a.type) && typeof text === 'string') {
    const content = mendWrite(api.getState().data.notes.get(a.noteId as never)?.content ?? '', text);
    if (content !== text) return next({ ...a, [key]: { ...a[key], content } });
  }
  return next(action);
};

/**
 * Creates a headless Redux store for the snote CLI.
 *
 * @param opts - Store options (sync config for Simperium)
 * @returns Configured Redux store with optional stopSync method
 */
export function makeStore(
  opts: StoreOptions = {}
): Store<State, A.ActionType> & {
  stopSync?: () => void;
  forceSync?: () => void;
  // the live sync client once the middleware has built it (tests use it
  // to reach the channel plumbing directly; so do the sync hooks in
  // src/cli/main.tsx (trackOwnEchoes(store.client, ...)), src/core/quit-send.ts,
  // src/core/requeue.ts and the quit in src/tui/Root.tsx)
  client?: unknown;
  // #625: the `r` key's reconnect on a stale connection (see stale-reconnect.ts)
  reconnectIfStale?: () => boolean;
} {
  let middleware = applyMiddleware(mendMiddleware);
  let stopSync: (() => void) | undefined;
  // hold the sync client so forceSync can request missed changes (T80)
  // OMARCHY: boundary cast
  let client: any;

  // about 1 start in 3 the server does not answer the login inits
  // with an auth reply, the socket stays open, and nothing reconnects.
  // `installSimperiumAuthWatchdog` (called in the `onClient` callback
  // passed to `initSimperium` below) re-arms the login watchdog there,
  // before the first 'connect' event has fired.
  const armAuthWatchdog = (c: unknown): void => {
    client = c;
    installSimperiumAuthWatchdog(c, opts.sync?.authWatchdogMs ?? 10000);
  };

  // Wire up simperium middleware if sync config is provided
  if (opts.sync && !opts.stubClient) {
    startConnectSession(); // #649: a new sync session starts with a clean connect state
    // Pass noteEditDelayMs from sync config (defaults to 2000ms in middleware)
    // Use onLogout callback if provided, otherwise use default
    const logoutCallback = opts.sync.onLogout
      ? opts.sync.onLogout
      : () => {
          // default logout - in real app this would clear auth
          if (stopSync) stopSync();
        };
    const syncMiddleware = initSimperium(
      opts.sync.appId,
      logoutCallback,
      opts.sync.token,
      opts.sync.username,
      // pass onClient so the middleware hands us the constructed client (T80)
      { ...snoteSocketOptions, ...opts.sync.clientOptions, onClient: (c) => { client = c; installSimperiumAuthWatchdog(c, opts.sync!.authWatchdogMs ?? 10000); } },
      opts.sync.ghostStoreProvider as ((bucket: { name: string }) => T.JSONSerializable) | undefined,
      opts.sync.noteEditDelayMs
    ) as (api: unknown) => (next: unknown) => (action: unknown) => unknown;
    middleware = applyMiddleware(mendMiddleware, syncMiddleware);
  }

  // a synced store starts with tracking on so it counts pending notes (T82)
  const preloadedBase = (opts.preloadedState || {}) as Partial<State>;
  // #335: no variable holds the start-up notes Map
  preloadedBase.data?.notes?.forEach((n, id, m) => m.set(id, fillTags(n)));
  const preloaded =
    opts.sync && !opts.stubClient && !preloadedBase.simperium
      ? ({ ...preloadedBase, simperium: { ...simperiumInitialState, tracking: true } } as unknown as State)
      : (preloadedBase as unknown as State);
  const enhancedStore = createStore(rootReducer, preloaded, middleware);
  opts = { ...opts, preloadedState: undefined }; // #335: the closures below keep `opts` alive; they must not keep the start-up state

  // Expose stopSync method on store for test cleanup
  const store = enhancedStore as Store<State, A.ActionType> & {
    stopSync?: () => void;
    forceSync?: () => void;
    client?: unknown;
    reconnectIfStale?: () => boolean;
  };
  if (opts.sync && !opts.stubClient) {
    // Note: In a real implementation, we would capture the client reference
    // For now, we dispatch a logout action which triggers client.end() in middleware
    store.stopSync = () => {
      // Dispatch logout to trigger cleanup in middleware
      store.dispatch({ type: 'LOGOUT' } as A.ActionType);
    };

    // forceSync asks the server, on the open connection, for every
    // change newer than each bucket's saved change version, and re-sends
    // every note still stuck in pendingNotes. Never throws,
    // dispatches nothing, and never closes or reopens the connection.
    store.forceSync = () => {
      // one press shows at most one notice. Every step of this press
      // resolves to null (success) or its failure text, and after all have
      // settled a single summary publishes if any step failed.
      const steps: Promise<string | null>[] = [];
      for (const bucket of client?.buckets ?? []) {
        const channel = bucket.channel as
          | {
              store?: { getChangeVersion?: () => Promise<string | undefined> };
              sendChangeVersionRequest?: (cv: string) => void;
            }
          | undefined;
        steps.push(
          Promise.resolve()
            .then(() => channel?.store?.getChangeVersion?.())
            .then((cv) => {
              if (cv) {
                try {
                  channel?.sendChangeVersionRequest?.(cv);
                } catch {
                  /* not connected */
                }
              }
              return null;
            }, (err) => problemText('force sync failed', err))
        );
      }
      // a note stuck in pendingNotes was sent but never acknowledged;
      // touch() re-reads it locally and re-queues a change for it so the
      // press of `r` actually pushes the note to the server.
      // OMARCHY: boundary cast
      const noteBucket: any = (client?.buckets ?? []).find(
        (b: any) => b?.name === 'note'
      );
      const pending = Object.keys(store.getState().simperium.pendingNotes);
      for (const id of pending) {
        try {
          steps.push(
            Promise.resolve(noteBucket?.touch?.(id)).then(
              () => null,
              (err) => problemText('could not re-send a pending note', err)
            )
          );
        } catch {
          /* not connected */
        }
      }
      void Promise.all(steps).then((texts) => {
        const failed = texts.filter((t): t is string => t !== null);
        if (failed.length > 0) {
          publishProblem(
            `force sync: ${failed.length} step(s) failed (${failed[0]})`
          );
        }
      });
    };

    // simperium@1.1.4 leaves a brand-new object's own
    // version echo unresolved ("e:<id>.undefined"), which leaves
    // pendingCount stuck at 1. simperium-version-fix.ts intercepts that
    // send and resolves the listener itself (the .NaN alias did not help).
    installSimperiumVersionFix(client);

    // on reconnect the local-queue flush and the resend of
    // in-flight changes can fire before the catch-up reply's OT rebase
    // has run, so a stale-sv resend can lose the local edit. Defer both
    // until the channel's network queue has drained.
    installSimperiumReconnectFix(client);

    // a full re-index (unknown/expired cv) never diffs the
    // completed index against the notes already stored locally, so a
    // note deleted on the server while this client was offline lingers
    // forever. Reconcile the index on every completed re-index.
    installSimperiumStaleDeleteFix(client, store);

    // a catch-up MODIFY with a mismatched ghost answers late, and
    // the REMOVE queued behind it loses to the reply, re-creating a note
    // the server deleted forever. Drop version replies for removed ids.
    installSimperiumRemovedNoteFix(client);
    installSimperiumRevisionCacheFix(client);
    installSimperiumLocalQueueFix(client);
    // #625: a status stuck at stale, or a resume from sleep, closes the socket once so the client reconnects
    store.reconnectIfStale = installStaleReconnect(client, store, opts.sync.staleReconnectMs);

    // expose the live client so tests can reach the channel plumbing
    // (same object onClient captured during middleware init)
    store.client = client;
  }

  return store;
}

/**
 * re-exported so tests (and nothing in production) can attach the
 * stale-delete reconciliation to an already-live sync client. Same
 * function `makeStore` wires at startup; calling it again on the same
 * client is a no-op per channel.
 */
export { installSimperiumStaleDeleteFix };

export default makeStore;

/**
 * Waits for notes to be loaded in the store.
 *
 * @param store - The Redux store
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns Promise resolving when notes are loaded or rejecting on timeout
 */
export function waitForNotes(
  store: Store<State, A.ActionType>,
  timeoutMs: number = 30000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      const state = store.getState();
      const notes = state.data.notes;

      // Check if notes Map has any entries
      if (notes && notes instanceof Map && notes.size > 0) {
        resolve();
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error('Timeout waiting for notes to load'));
        return;
      }

      // Check again in 100ms
      setTimeout(check, 100);
    };

    check();
  });
}
