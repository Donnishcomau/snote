import type { SimperiumState } from './simperium-reducer';

/** #79: the one word the status bar shows for the sync connection. */
export type ConnectionWord = 'connected' | 'connecting' | 'stale' | 'offline';

/**
 * `connected` while green; `connecting` until this session has received its first frame;
 * `stale` when the monitor turned red but the socket is still open; otherwise `offline`.
 */
export function connectionWord(sim: SimperiumState, socketOpen: boolean): ConnectionWord {
  if (sim.connected || sim.connectionStatus === 'green') return 'connected';
  if (sim.connectionStatus === 'offline') return 'offline';
  if (!sim.everConnected) return 'connecting';
  return socketOpen ? 'stale' : 'offline';
}
