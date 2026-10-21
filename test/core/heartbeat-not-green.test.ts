/**
 * Issue #79 (G4): a server that answers only heartbeats (bare `h:` frames)
 * must not turn the connection green; any channel-prefixed frame still does.
 * The vendored connection monitor listens to the client's 'message' event,
 * which carries the raw frame text (node-simperium client.js parseMessage).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

import { start } from '@vendor/state/simperium/functions/connection-monitor';

function monitored(): { client: EventEmitter; dispatch: ReturnType<typeof vi.fn> } {
  vi.useFakeTimers();
  vi.stubGlobal('window', { addEventListener: () => {} });
  vi.stubGlobal('navigator', { onLine: true });
  const client = new EventEmitter();
  const dispatch = vi.fn();
  const store = { dispatch, getState: () => ({ simperium: { connectionStatus: 'red' } }) };
  start(client as never, store as never);
  return { client, dispatch };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('issue #79 a heartbeat-only answer is not a live session', () => {
  it('6: WHEN the server answers with bare `h:` frames only THEN no `CHANGE_CONNECTION_STATUS` with status `green` is dispatched, and WHEN a channel frame `0:auth:user@example.com` arrives THEN it is dispatched once', () => {
    const { client, dispatch } = monitored();
    client.emit('message', 'h:1');
    client.emit('message', 'h:3');
    expect(dispatch).not.toHaveBeenCalled();
    client.emit('message', '0:auth:user@example.com');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'CHANGE_CONNECTION_STATUS', status: 'green' });
  });
});
