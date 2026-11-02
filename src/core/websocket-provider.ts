/**
 * #85 — since about 9 Oct 2026 the Simperium sync server answers 403 to a
 * WebSocket handshake that carries no User-Agent header. The simperium
 * client's default provider opens `new w3cwebsocket(url)` with no headers,
 * so every connect was refused and snote stayed offline.
 *
 * This provider opens the same w3cwebsocket transport with one header,
 * `User-Agent: snote/<version>`, and gives each socket its own http(s)
 * agent that is destroyed when the socket closes: the websocket library
 * never reads a refused (non-101) response, so without this every refused
 * retry left one TCP connection open.
 *
 * #196: the websocket library has no handshake timeout, and the simperium
 * heartbeat and snote's auth watchdog both start only after `open`. A server
 * that accepts the connection and never answers the upgrade would leave the
 * socket CONNECTING for the whole session, with no close event and no retry.
 * So each socket gets one timer: if it is still CONNECTING after
 * HANDSHAKE_TIMEOUT_MS, snote closes it, the client's own close handler runs
 * and its reconnect schedule starts.
 */
import * as http from 'node:http';
import * as https from 'node:https';
import { w3cwebsocket as W3CWebSocket } from 'websocket';
import { VERSION } from '../cli/version';
import { publishProblem } from './problem-signal';

export const SNOTE_USER_AGENT = `snote/${VERSION}`;

/** #196: how long a websocket upgrade may go unanswered before snote gives up on it and retries. */
export const HANDSHAKE_TIMEOUT_MS = 15000;

// #79: snote's live sockets; the status word tells `stale` (a socket is open, silent) from `offline` (none is open).
// Asks each socket's readyState, which is already CLOSED when the client's own close handler runs.
const sockets = new Set<W3CWebSocket>();
// #79: upgrades given up on since the last open; from the second one the notice line says why.
let unanswered = 0;

export function hasOpenSocket(): boolean {
  for (const s of sockets) if (s.readyState === s.OPEN) return true;
  return false;
}

/** `handshakeTimeoutMs` is a test seam; the product always uses HANDSHAKE_TIMEOUT_MS. */
export function snoteWebsocketProvider(url: string, handshakeTimeoutMs: number = HANDSHAKE_TIMEOUT_MS): W3CWebSocket {
  const agent = url.startsWith('wss:') ? new https.Agent() : new http.Agent();
  const socket = new W3CWebSocket(url, undefined, undefined, { 'User-Agent': SNOTE_USER_AGENT }, { agent });
  sockets.add(socket);
  const giveUp = setTimeout(() => {
    if (socket.readyState !== socket.CONNECTING) return;
    if (++unanswered >= 2) publishProblem(`sync server not answering, retrying (attempt ${unanswered})`);
    socket.close();
  }, handshakeTimeoutMs);
  giveUp.unref();
  socket.addEventListener('open', () => { clearTimeout(giveUp); unanswered = 0; });
  socket.addEventListener('close', () => { clearTimeout(giveUp); agent.destroy(); sockets.delete(socket); });
  return socket;
}

/** Spread into the simperium client options (see store.ts). */
export const snoteSocketOptions = { websocketClientProvider: snoteWebsocketProvider };
