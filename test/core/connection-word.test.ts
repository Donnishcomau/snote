/**
 * Issue #79 (prerequisite, no display change): the word for the sync connection
 * is derived from the reducer state and from whether one of snote's sockets is open.
 */
import { afterEach, describe, it, expect } from 'vitest';

import { connectionWord } from '../../src/core/connection-word';
import simperiumReducer, { initialState } from '../../src/core/simperium-reducer';
import { hasOpenSocket, snoteWebsocketProvider } from '../../src/core/websocket-provider';
import { FakeSimperiumServer } from '../fake-simperium/server';

const status = (state: typeof initialState, s: 'green' | 'red' | 'offline'): typeof initialState =>
  simperiumReducer(state, { type: 'CHANGE_CONNECTION_STATUS', status: s } as never);

describe('issue #79 the connection word', () => {
  let server: FakeSimperiumServer | undefined;
  let socket: ReturnType<typeof snoteWebsocketProvider> | undefined;

  afterEach(() => {
    socket?.close();
    socket = undefined;
    server?.stop();
    server = undefined;
  });

  async function openSocket(): Promise<void> {
    server = new FakeSimperiumServer();
    const { url } = await server.start();
    socket = snoteWebsocketProvider(url);
    await expect.poll(() => hasOpenSocket(), { timeout: 2000 }).toBe(true);
  }

  it('1: WHEN the state is new and no frame has arrived THEN the word is `connecting`', () => {
    expect(initialState.everConnected).toBe(false);
    expect(connectionWord(initialState, false)).toBe('connecting');
  });

  it('2: WHEN the state is green THEN the word is `connected`', () => {
    expect(connectionWord(status(initialState, 'green'), false)).toBe('connected');
  });

  it('3: WHEN the state was green, is red and a snote socket is open THEN the word is `stale`', async () => {
    await openSocket();
    const red = status(status(initialState, 'green'), 'red');
    expect(connectionWord(red, hasOpenSocket())).toBe('stale');
  });

  it('4: WHEN the state was green, is red and the snote socket has closed THEN the word is `offline`', async () => {
    await openSocket();
    socket!.close();
    await expect.poll(() => hasOpenSocket(), { timeout: 2000 }).toBe(false);
    const red = status(status(initialState, 'green'), 'red');
    expect(connectionWord(red, hasOpenSocket())).toBe('offline');
  });

  it('5: WHEN the state goes green then red THEN everConnected is `true`, and a state that went `offline` before any frame has the word `offline`', () => {
    expect(status(status(initialState, 'green'), 'red').everConnected).toBe(true);
    expect(connectionWord(status(initialState, 'offline'), false)).toBe('offline');
  });
});
