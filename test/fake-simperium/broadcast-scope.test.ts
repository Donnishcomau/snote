/**
 * T273: Broadcast is scoped to the bucket, not every channel of every connection.
 * Each acceptance line becomes one `it()`.
 */
import { describe, it, expect } from 'vitest';
import { FakeSimperiumServer } from '../fake-simperium/server';
import WebSocket from 'ws';

const TEST_TIMEOUT = 3000;

/**
 * Extract a broadcast array from a server frame by finding the outermost [ and ].
 */
function parseBroadcastFrame(frame: string): unknown[] {
  const open = frame.indexOf('[');
  const close = frame.lastIndexOf(']');
  if (open > -1 && close > open) {
    return JSON.parse(frame.slice(open, close + 1)) as unknown[];
  }
  throw new Error('No broadcast array found in frame');
}

/**
 * Build a test fixture: start server, open one WS connection,
 * init channel 0 → bucket "note", channel 1 → bucket "tag".
 * Returns server, ws, and a frames array.
 */
async function buildFixture() {
  const server = new FakeSimperiumServer();
  const { url } = await server.start();

  const sentFrames: Array<{ channel: number; frame: string }> = [];
  const origSend = (server as any).send.bind(server);
  (server as any).send = function (ws: any, message: string) {
    const result = origSend(ws, message);
    const firstColon = message.indexOf(':');
    if (firstColon > 0) {
      const ch = parseInt(message.slice(0, firstColon), 10);
      if (!isNaN(ch)) {
        sentFrames.push({ channel: ch, frame: message });
      }
    }
    return result;
  };

  const ws = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // Init channel 0 for bucket "note"
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout init channel 0')), TEST_TIMEOUT);
    const handler = (data: Buffer) => {
      if (data.toString().startsWith('0:auth:')) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
    ws.send(
      `0:init:${JSON.stringify({
        token: 'test-token',
        app_id: 'test-app',
        name: 'note',
      })}`
    );
  });

  // Init channel 1 for bucket "tag"
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout init channel 1')), TEST_TIMEOUT);
    const handler = (data: Buffer) => {
      if (data.toString().startsWith('1:auth:')) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
    ws.send(
      `1:init:${JSON.stringify({
        token: 'test-token',
        app_id: 'test-app',
        name: 'tag',
      })}`
    );
  });

  // Poll for frames matching a condition
  async function waitForFrames(
    beforeCount: number,
    predicate: (frame: { channel: number; frame: string }) => boolean,
    minCount: number = 1
  ) {
    const start = Date.now();
    while (Date.now() - start < 2000) {
      const framesSince = sentFrames.slice(beforeCount);
      const matching = framesSince.filter(predicate);
      if (matching.length >= minCount) {
        return { framesSince, matching };
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return { framesSince: sentFrames.slice(beforeCount), matching: [] };
  }

  return {
    server,
    ws,
    sentFrames,
    beforeCount: sentFrames.length,
    waitForFrames,
  };
}

describe('T273 broadcast scope', () => {
  it('1: WHEN a modify change with id note1 and ccid ccid-one is sent on channel 0 THEN exactly 1 c: frame on channel 0 with ccids ["ccid-one"]', async () => {
    const { server, ws, sentFrames, beforeCount, waitForFrames } = await buildFixture();

    // Send modify change
    ws.send(
      `0:c:${JSON.stringify({
        o: 'M',
        id: 'note1',
        ccid: 'ccid-one',
        v: { title: 'Test Note', content: 'Hello' },
      })}`
    );

    const { matching } = await waitForFrames(
      beforeCount,
      (f) => f.channel === 0 && f.frame.includes(':c:['),
      1
    );

    expect(matching.length).toBe(1);
    const parsed = parseBroadcastFrame(matching[0].frame);
    expect(parsed).toHaveLength(1);
    const changeFrame = parsed[0] as Record<string, unknown>;

    // Verify ccids ["ccid-one"] is present in the frame
    expect(matching[0].frame).toContain('"ccids":["ccid-one"]');

    server.stop();
    ws.close();
  }, TEST_TIMEOUT);

  it('2: WHEN that same change from line 1 is sent THEN 0 frames on channel 1 contain id note1', async () => {
    const { server, ws, sentFrames, beforeCount, waitForFrames } = await buildFixture();

    // Send modify change
    ws.send(
      `0:c:${JSON.stringify({
        o: 'M',
        id: 'note1',
        ccid: 'ccid-one',
        v: { title: 'Test Note', content: 'Hello' },
      })}`
    );

    // Wait for any frames on channel 0 to arrive
    await waitForFrames(beforeCount, (f) => f.channel === 0, 1);

    // Check channel 1 for the "id":"note1" frame — must be 0
    const framesOnChannel1 = sentFrames.filter(
      (f) => f.channel === 1 && f.frame.includes('"id":"note1"')
    );

    expect(framesOnChannel1.length).toBe(0);

    server.stop();
    ws.close();
  }, TEST_TIMEOUT);

  it('3: WHEN a second modify change with id tag1 and ccid ccid-two is sent on channel 1 THEN 0 frames on channel 0 contain id tag1', async () => {
    const { server, ws, sentFrames, beforeCount, waitForFrames } = await buildFixture();

    // Send modify change
    ws.send(
      `1:c:${JSON.stringify({
        o: 'M',
        id: 'tag1',
        ccid: 'ccid-two',
        v: { name: 'tag1' },
      })}`
    );

    // Wait for any frames on channel 1 to arrive
    await waitForFrames(beforeCount, (f) => f.channel === 1, 1);

    // Check channel 0 for the "id":"tag1" frame — must be 0
    const framesOnChannel0 = sentFrames.filter(
      (f) => f.channel === 0 && f.frame.includes('"id":"tag1"')
    );

    expect(framesOnChannel0.length).toBe(0);

    server.stop();
    ws.close();
  }, TEST_TIMEOUT);

  it('4: WHEN a remove change with id note2 and ccid ccid-three is sent on channel 0 THEN exactly 1 c: frame for note2 on channel 0 and 0 frames on channel 1', async () => {
    const { server, ws, sentFrames, beforeCount, waitForFrames } = await buildFixture();

    // Send remove change
    ws.send(
      `0:c:${JSON.stringify({
        o: '-',
        id: 'note2',
        ccid: 'ccid-three',
      })}`
    );

    const { matching } = await waitForFrames(
      beforeCount,
      (f) => f.channel === 0 && f.frame.includes(':c:[') && f.frame.includes('"id":"note2"'),
      1
    );

    expect(matching.length).toBe(1);
    const parsed = parseBroadcastFrame(matching[0].frame);
    expect(parsed).toHaveLength(1);
    const removeFrame = parsed[0] as Record<string, unknown>;
    expect(removeFrame.ccids).toEqual(['ccid-three']);

    // Verify ccids ["ccid-three"] is present in the frame
    expect(matching[0].frame).toContain('"ccids":["ccid-three"]');

    // Check channel 1 for the "id":"note2" frame — must be 0
    const framesOnChannel1 = sentFrames.filter(
      (f) => f.channel === 1 && f.frame.includes('"id":"note2"')
    );
    expect(framesOnChannel1.length).toBe(0);

    server.stop();
    ws.close();
  }, TEST_TIMEOUT);
});
