/**
 * T320 — snote stays stuck without syncing when Simplenote ignores its login.
 *
 * Live finding 2026-09-26, captured with a wire log: about 1 start in 3, the
 * client opens the socket and sends its four init messages, and the server
 * never answers them — no `auth:` reply for over 5 minutes while heartbeats
 * (`h:`) keep being answered. The vendored client cannot notice: its socket
 * stays OPEN (so no `onclose`/`onConnectionFailed`, client.js:140), the
 * heartbeat timeout (client.js:79) never fires because every `h:` is ticked,
 * and nothing else watches the unanswered auth — the session sits "connected"
 * with no sync until snote is restarted.
 *
 * This module arms a watchdog on the client itself: every `'connect'` event
 * (client.js:124) starts a timer and counts, from that moment, the client's
 * `'send'` events whose data matches `/^\d+:init:/` (the per-channel init
 * written to the socket, client.js:174) and its `'message'` events whose data
 * matches `/^\d+:auth:/` (every auth reply parsed off the wire, client.js:155
 * — success or error, any answer counts). When the timer fires and fewer
 * auth replies than inits were counted, the login was ignored: call
 * `client.disconnect()` once. The socket's `onclose` then runs
 * `onConnectionFailed` (client.js:140), which emits `'disconnect'` and starts
 * the reconnection timer, and the reconnect sends fresh inits — the probe on
 * the live service recovered 15 of 15 stuck starts this way. The timer is
 * cleared on the client's `'disconnect'` and `'close'` events, and a client
 * that has been ended (`client.reconnect === false`, client.js:209) is never
 * disconnected. Installed at most once per client, like the other
 * `simperium-*-fix` modules.
 */

// OMARCHY: boundary cast — the simperium client is an untyped EventEmitter.
interface ClientLike {
  reconnect?: boolean;
  on(event: string, listener: (data?: string) => void): unknown;
  on(event: string, listener: () => void): unknown;
  disconnect(): unknown;
}

const installed = new WeakSet<object>();

/**
 * Watch one client's logins: if any `'connect'` produces init messages that
 * never draw an equal number of `auth:` replies within `timeoutMs`, drop the
 * connection once so the library's own reconnection machinery retries.
 * Safe to call more than once on the same client.
 */
export function installSimperiumAuthWatchdog(client: unknown, timeoutMs: number): void {
  // OMARCHY: boundary cast
  const c = client as ClientLike | null | undefined;
  if (!c || typeof c.on !== 'function' || typeof c.disconnect !== 'function') {
    return;
  }
  if (installed.has(c)) {
    return;
  }
  installed.add(c);
  // From here on the narrowed `c` is the client: `client` itself stays
  // `unknown` for the typechecker, so every use below goes through `c`.

  const INIT = /^\d+:init:/;
  const AUTH = /^\d+:auth:/;

  // Per-connection state in closure slots (undici/undici-lite timers are not
  // Node Timeout objects, so unref() is not available; slots hold no timers).
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inits = 0;
  let auths = 0;

  const clear = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const arm = (): void => {
    // Count from this moment: inits are sent right after 'connect', and a
    // healthy server answers each within about 250 ms.
    clear();
    inits = 0;
    auths = 0;
    timer = setTimeout(() => {
      timer = undefined;
      if (auths >= inits) {
        return; // answered (or nothing was ever sent)
      }
      if (c.reconnect === false) {
        return; // ended by the app; never resurrect a finished client
      }
      // The login was ignored: close the socket once. 'disconnect' fires on
      // the socket's onclose, clears any state here, and the library's
      // ReconnectionTimer sends fresh inits on the next attempt.
      c.disconnect();
    }, timeoutMs);
  };

  c.on('connect', arm);

  c.on('send', (data) => {
    if (typeof data === 'string' && INIT.test(data)) {
      inits++;
    }
  });

  c.on('message', (data) => {
    if (typeof data === 'string' && AUTH.test(data)) {
      auths++;
    }
  });

  // A dropped or closed connection ends this attempt; the library's own
  // reconnect fires a fresh 'connect', which re-arms the watchdog.
  c.on('disconnect', clear);
  c.on('close', clear);
}

export default installSimperiumAuthWatchdog;
