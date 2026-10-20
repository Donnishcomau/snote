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
 */
import * as http from 'node:http';
import * as https from 'node:https';
import { w3cwebsocket as W3CWebSocket } from 'websocket';
import { VERSION } from '../cli/version';

export const SNOTE_USER_AGENT = `snote/${VERSION}`;

export function snoteWebsocketProvider(url: string): W3CWebSocket {
  const agent = url.startsWith('wss:') ? new https.Agent() : new http.Agent();
  const socket = new W3CWebSocket(url, undefined, undefined, { 'User-Agent': SNOTE_USER_AGENT }, { agent });
  socket.addEventListener('close', () => agent.destroy());
  return socket;
}

/** Spread into the simperium client options (see store.ts). */
export const snoteSocketOptions = { websocketClientProvider: snoteWebsocketProvider };
