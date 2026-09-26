import type * as A from '@vendor/state/action-types';
import type * as T from '@vendor/types';
import type { GhostEntity } from '@vendor/state';

/**
 * Simperium state for managing connection status and ghosts.
 */
export interface SimperiumState {
  connected: boolean;
  syncing: boolean;
  // real connection status reported by the sync engine (T82)
  connectionStatus: T.ConnectionState;
  // only stores that really sync count pending notes (T82)
  tracking: boolean;
  // notes with local changes the server has not confirmed yet (T82)
  pendingNotes: Record<string, 'dirty' | 'sent'>;
  // ghosts[0] = change versions per bucket
  // ghosts[1] = entity ghosts per bucket
  ghosts: [Map<string, string | undefined>, Map<string, Map<string, GhostEntity>>];
}

export const initialState: SimperiumState = {
  connected: false,
  syncing: false,
  connectionStatus: 'red',
  tracking: false,
  pendingNotes: {},
  ghosts: [new Map(), new Map()],
};

// notes with local changes the server has not confirmed yet (T82)
export function pendingCount(state: SimperiumState): number {
  return Object.keys(state.pendingNotes).length;
}

// actions that queue a note for sending (T82)
const LOCAL_NOTE_ACTIONS = new Set([
  'CREATE_NOTE_WITH_ID',
  'EDIT_NOTE',
  'IMPORT_NOTE_WITH_ID',
  'ADD_NOTE_TAG',
  'REMOVE_NOTE_TAG',
  'MARKDOWN_NOTE',
  'PIN_NOTE',
  'PUBLISH_NOTE',
  'RESTORE_NOTE',
  'TRASH_NOTE',
  'RESTORE_NOTE_REVISION',
]);

// actions that remove a note (T82)
const REMOVE_NOTE_ACTIONS = new Set([
  'DELETE_NOTE_FOREVER',
  'REMOTE_NOTE_DELETE_FOREVER',
]);

export default function simperiumReducer(
  state: SimperiumState = initialState,
  action: A.ActionType
): SimperiumState {
  switch (action.type) {
    case 'CHANGE_CONNECTION_STATUS': {
      // only 'green' means connected; return same object when unchanged (T82)
      if (state.connectionStatus === action.status) {
        return state;
      }
      return { ...state, connected: action.status === 'green', connectionStatus: action.status };
    }

    case 'SUBMIT_PENDING_CHANGE': {
      // a change was sent; mark 'sent' only if already pending (T82)
      if (!state.tracking) {
        return state;
      }
      const entityId = action.entityId as string;
      if (!(entityId in state.pendingNotes)) {
        return state;
      }
      return { ...state, pendingNotes: { ...state.pendingNotes, [entityId]: 'sent' } };
    }

    case 'ACKNOWLEDGE_PENDING_CHANGE': {
      // server confirmed; remove only when 'sent' (re-edited stays pending) (T82)
      if (!state.tracking) {
        return state;
      }
      const entityId = action.entityId as string;
      if (state.pendingNotes[entityId] !== 'sent') {
        return state;
      }
      const rest: Record<string, 'dirty' | 'sent'> = {};
      for (const key of Object.keys(state.pendingNotes)) {
        if (key !== entityId) {
          rest[key] = state.pendingNotes[key];
        }
      }
      return { ...state, pendingNotes: rest };
    }

    case 'GHOST_SET_CHANGE_VERSION': {
      const { bucketName, version } = action;
      const newGhosts = [
        new Map(state.ghosts[0]),
        new Map(state.ghosts[1]),
      ] as [
        Map<string, string | undefined>,
        Map<string, Map<string, GhostEntity>>,
      ];
      newGhosts[0].set(bucketName, version);
      return { ...state, ghosts: newGhosts };
    }

    case 'GHOST_SET_ENTITY': {
      const { bucketName, entityId, ghost } = action;
      const newGhosts = [
        new Map(state.ghosts[0]),
        new Map(state.ghosts[1]),
      ] as [
        Map<string, string | undefined>,
        Map<string, Map<string, GhostEntity>>,
      ];
      let bucket = newGhosts[1].get(bucketName);
      if (!bucket) {
        bucket = new Map();
        newGhosts[1].set(bucketName, bucket);
      }
      bucket.set(entityId as string, ghost);
      return { ...state, ghosts: newGhosts };
    }

    case 'GHOST_REMOVE_ENTITY': {
      const { bucketName, entityId } = action;
      const newGhosts = [
        new Map(state.ghosts[0]),
        new Map(state.ghosts[1]),
      ] as [
        Map<string, string | undefined>,
        Map<string, Map<string, GhostEntity>>,
      ];
      const bucket = newGhosts[1].get(bucketName);
      if (bucket) {
        bucket.delete(entityId as string);
      }
      return { ...state, ghosts: newGhosts };
    }

    default: {
      // track pending notes only while tracking is on (T82)
      if (state.tracking && 'noteId' in action) {
        const noteId = (action as { noteId: T.EntityId }).noteId as string;
        if (LOCAL_NOTE_ACTIONS.has(action.type)) {
          return { ...state, pendingNotes: { ...state.pendingNotes, [noteId]: 'dirty' } };
        }
        if (REMOVE_NOTE_ACTIONS.has(action.type)) {
          if (!(noteId in state.pendingNotes)) {
            return state;
          }
          const rest: Record<string, 'dirty' | 'sent'> = {};
          for (const key of Object.keys(state.pendingNotes)) {
            if (key !== noteId) {
              rest[key] = state.pendingNotes[key];
            }
          }
          return { ...state, pendingNotes: rest };
        }
      }
      return state;
    }
  }
}
