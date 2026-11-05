/**
 * #625: a long-running session can stay `stale` for good. The sync monitor turns red when no frame
 * arrives for 8 s, or at once when the wall clock jumps over a laptop sleep, and only a channel message
 * turns it green again (a bare `h:` reply does not, #79). On a socket that is still open and only answers
 * heartbeats nothing closes it, so the client's reconnect schedule does not run.
 *
 * This watch ticks once a second. When the status word has been `stale` for `staleMs` in a row, or the
 * wall clock moved more than JUMP_MS further than the monotonic clock between two ticks (the process was
 * suspended) while a socket is open, it closes the connection once through `client.disconnect()`, the
 * same path the auth watchdog uses. The close handler starts the client's reconnect schedule; the
 * reconnect signs in again and the fix sends the unsent changes after the catch-up. A client that
 * has been ended (`reconnect === false`) is left alone, and the tick stops. proof: test/core/stale-reconnect.test.ts
 */
import type { Store } from 'redux';

import { connectionWord } from './connection-word';
import { publishProblem } from './problem-signal';
import type { State } from './store';
import { hasOpenSocket } from './websocket-provider';

/** #625: how long the status may stay `stale` before snote reconnects by itself. */
export const STALE_RECONNECT_MS = 30000;

/** #625: a wall-clock gain over the monotonic clock this large between two ticks means a resume. */
const JUMP_MS = 5000;

/**
 * Watch one client. Returns the `r` hook: when the status is `stale` it reconnects at once and returns
 * true; otherwise it does nothing and returns false.
 */
export function installStaleReconnect(client: unknown, store: Store<State>, staleMs = STALE_RECONNECT_MS): () => boolean {
  // OMARCHY: boundary cast
  const c = client as { reconnect?: boolean; disconnect(): unknown };
  const stale = (): boolean => connectionWord(store.getState().simperium, hasOpenSocket()) === 'stale';
  let since: number | undefined;
  let wall = Date.now();
  let mono = performance.now();

  const reconnect = (): boolean => {
    since = undefined;
    publishProblem('sync connection went quiet, reconnecting');
    c.disconnect();
    return true;
  };

  const tick = setInterval(() => {
    if (c.reconnect === false) return clearInterval(tick);
    const now = performance.now();
    const jumped = Date.now() - wall - (now - mono) > JUMP_MS;
    wall = Date.now();
    mono = now;
    if (jumped && hasOpenSocket()) return void reconnect();
    if (!stale()) return void (since = undefined);
    since ??= now;
    if (now - since >= staleMs) reconnect();
  }, Math.min(1000, staleMs / 4));
  tick.unref();

  return () => c.reconnect !== false && stale() && reconnect();
}
