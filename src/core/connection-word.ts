import type { SimperiumState } from './simperium-reducer';

/** #79: the one word the status bar shows for the sync connection. */
export type ConnectionWord = 'connected' | 'connecting' | 'stale' | 'offline';

/** #632: how the last connection attempt failed before it opened (set by websocket-provider.ts, cleared on open). */
export type ConnectFailure = 'unreachable' | 'unanswered';

/**
 * `connected` while green; `connecting` until this session has received its first frame;
 * `stale` when the monitor turned red but the socket is still open; otherwise `offline`.
 * #632: before the first frame, an attempt that failed (`failed`) makes it `offline`, not `connecting`.
 */
export function connectionWord(sim: SimperiumState, socketOpen: boolean, failed = false): ConnectionWord {
  if (sim.connected || sim.connectionStatus === 'green') return 'connected';
  if (sim.connectionStatus === 'offline') return 'offline';
  if (!sim.everConnected) return failed && !socketOpen ? 'offline' : 'connecting';
  return socketOpen ? 'stale' : 'offline';
}

/** #79: the fixed reason shown after `[offline]`: one of these literals, no server or error text. proof: test/tui/status-reason.test.tsx */
const REASONS: Record<ConnectFailure | 'lost', string> = {
  unreachable: "can't reach the sync server, retrying",
  unanswered: 'sync server not answering, retrying',
  lost: 'connection lost, retrying',
};

export function offlineReason(word: ConnectionWord, failure: ConnectFailure | null): string | undefined {
  return word === 'offline' ? REASONS[failure ?? 'lost'] : undefined;
}
