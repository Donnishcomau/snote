/**
 * #706: our change acknowledged with a copy the server merged (another device's lines added)
 * reaches the note and any queued edit; a normal ack, or one after a network change moved
 * the ghost, changes nothing. A fake channel drives src/core/simperium-stale-change-fix.ts.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { diff } from 'simperium/lib/simperium/util/change';
import { installStaleChangeFix } from '../../src/core/simperium-stale-change-fix';

const note = (content: string) => ({ content, tags: [] });
const BASE = note('line1\nline2');
const OFF = note('line1\nline2\nOFF');
const BOTH = note('line0\nline1\nline2\nOFF');

/** `live`: the note in the store (the bucket's object store), when text was typed after the send. */
function channel(live?: string) {
  const ghosts = new Map<string, { version: number; data: Record<string, unknown> }>([['n1', { version: 3, data: BASE }]]);
  const lq = Object.assign(new EventEmitter(), {
    sent: {} as Record<string, unknown>,
    queues: {} as Record<string, { type: string; id: string; object: Record<string, unknown> }[]>,
    acknowledge(): void {},
  });
  const ch = Object.assign(new EventEmitter(), {
    message: new EventEmitter(),
    localQueue: lq,
    send: () => undefined,
    onBeforeNetworkChange: async () => undefined,
    store: {
      get: async (id: string) => ghosts.get(id),
      put: async (id: string, version: number, data: Record<string, unknown>) => void ghosts.set(id, { version, data }),
    },
  });
  const store = live === undefined ? undefined : { get: (id: string, cb: (e: null, o: unknown) => void) => cb(null, { id, data: note(live) }) };
  installStaleChangeFix({ buckets: [{ channel: ch, store }] });
  const updates: unknown[] = [];
  ch.on('update', (id: string, data: { content: string }) => updates.push([id, data.content]));
  return { ch, lq, updates };
}

/** Sends OFF against ghost v3, puts each copy in `puts` as the ghost (the ack's own put last), then acknowledges. */
async function ackWith(puts: Record<string, unknown>[], queued?: string, live?: string) {
  const { ch, lq, updates } = channel(live);
  const change = { o: 'M', id: 'n1', ccid: 'c1', sv: 3, v: diff(BASE, OFF) };
  lq.sent.n1 = change;
  lq.emit('send', change);
  await new Promise((r) => setTimeout(r, 0));
  for (const [i, d] of puts.entries()) await ch.store.put('n1', 4 + i, d);
  if (queued !== undefined) lq.queues.n1 = [{ type: 'modify', id: 'n1', object: note(queued) }];
  delete lq.sent.n1;
  ch.emit('acknowledge', 'n1', change);
  return { updates, queue: lq.queues.n1?.map((q) => q.object.content) };
}

describe('#706: a merged acknowledgement reaches the note', () => {
  it('1: WHEN the ack saves the merged copy `line0\\nline1\\nline2\\nOFF` and nothing is queued THEN one update gives the note exactly that copy', async () => {
    expect(await ackWith([BOTH])).toEqual({ updates: [['n1', BOTH.content]], queue: undefined });
  });

  it('2: WHEN `MID` is queued on top of what was sent THEN the queued edit and the update are exactly `line0\\nline1\\nline2\\nOFF\\nMID`', async () => {
    const both = BOTH.content + '\nMID';
    expect(await ackWith([BOTH], OFF.content + '\nMID')).toEqual({ updates: [['n1', both]], queue: [both] });
  });

  it('3: WHEN a network change put the ghost before the ack THEN there is no update and the queued edit is unchanged', async () => {
    const other = note('line0\nline1\nline2');
    expect(await ackWith([other, BOTH], BOTH.content + '\nMID')).toEqual({ updates: [], queue: [BOTH.content + '\nMID'] });
  });

  it('4: WHEN the ack saves exactly what was sent (a normal ack) THEN there is no update', async () => {
    expect(await ackWith([OFF])).toEqual({ updates: [], queue: undefined });
  });

  it('5: WHEN the merged copy has content 12345 (not a string) and `MID` is queued THEN the ack listener does not throw, there is no update and the queued edit is unchanged', async () => {
    await expect(ackWith([{ content: 12345, tags: [] }], OFF.content + '\nMID')).resolves.toEqual({ updates: [], queue: [OFF.content + '\nMID'] });
  });

  it('6: WHEN `TYPED` is in the note but not yet queued (the editor delay) THEN the update is exactly `line0\nline1\nline2\nOFF\nTYPED`; with `MID` queued and `MID\nTYPED` in the note it is `line0\nline1\nline2\nOFF\nMID\nTYPED` and the queue `line0\nline1\nline2\nOFF\nMID`', async () => {
    expect(await ackWith([BOTH], undefined, OFF.content + '\nTYPED')).toEqual({ updates: [['n1', BOTH.content + '\nTYPED']], queue: undefined });
    expect(await ackWith([BOTH], OFF.content + '\nMID', OFF.content + '\nMID\nTYPED')).toEqual({ updates: [['n1', BOTH.content + '\nMID\nTYPED']], queue: [BOTH.content + '\nMID'] });
  });

  it('7: WHEN the note equals what was sent (nothing typed) THEN the update is exactly the merged copy `line0\nline1\nline2\nOFF`', async () => {
    expect(await ackWith([BOTH], undefined, OFF.content)).toEqual({ updates: [['n1', BOTH.content]], queue: undefined });
  });
});
