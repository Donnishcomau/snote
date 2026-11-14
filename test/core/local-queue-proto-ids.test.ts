/**
 * #502: the sync library keeps its per-note maps (LocalQueue `queues` and `sent`, NetworkQueue `queues`) as plain
 * objects, so a note id of `__proto__`, `constructor`, `toString` or `hasOwnProperty` read an Object.prototype member
 * and LocalQueue.queue threw a TypeError. installSimperiumLocalQueueFix swaps the maps for prototype-free ones at the
 * boundary. The tests drive the real Channel with the in-memory ghost store, before auth (nothing is sent).
 */
import { describe, expect, it } from 'vitest';
import Channel from 'simperium/lib/simperium/channel';
import GhostStore from 'simperium/lib/simperium/ghost/store';

import { installSimperiumLocalQueueFix } from '../../src/core/simperium-local-queue-fix';

const IDS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];

function channel(install: boolean): any {
  const ch: any = new (Channel as any)('app', 'tok', new (GhostStore as any)({}), 'note');
  if (install) installSimperiumLocalQueueFix({ buckets: [{ channel: ch }] });
  return ch;
}

describe('#502 note ids that are Object.prototype names', () => {
  it('1: WHEN a change and then a remove are queued for each of `__proto__`, `constructor`, `toString` and `hasOwnProperty` and the queue is drained THEN nothing throws, each id holds exactly one entry (the remove) and the drain returns that one entry', () => {
    const ch = channel(true);
    const lq = ch.localQueue;
    for (const id of IDS) {
      expect(() => lq.queue({ id, type: 'modify', object: { content: 'x' } })).not.toThrow();
      expect(() => lq.queue({ id, type: 'remove' })).not.toThrow();
      expect(Object.prototype.hasOwnProperty.call(lq.queues, id)).toBe(true);
      expect(lq.queues[id].map((c: { type: string }) => c.type)).toEqual(['remove']);
    }
    expect(Object.keys(lq.queues).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const drained = lq.dequeueChangesFor(id);
      expect(drained.map((c: { type: string }) => c.type)).toEqual(['remove']);
      expect(Object.prototype.hasOwnProperty.call(lq.queues, id)).toBe(false);
    }
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
  });

  it('2: WHEN nothing was sent for those ids THEN the sent map holds no entry for them, and the network queue gives each its own queue that runs a task', async () => {
    const ch = channel(true);
    for (const id of IDS) expect(ch.localQueue.sent[id]).toBeUndefined();
    const ran: string[] = [];
    await Promise.all(
      IDS.map(
        (id) =>
          new Promise<void>((resolve) => {
            ch.networkQueue.queueFor(id).add((done: () => void) => {
              ran.push(id);
              done();
              resolve();
            });
          })
      )
    );
    expect(ran.sort()).toEqual([...IDS].sort());
  });

  it('3: WHEN the fix is not installed THEN queuing a change for `constructor` throws (the library defect the fix covers)', () => {
    const ch = channel(false);
    expect(() => ch.localQueue.queue({ id: 'constructor', type: 'modify', object: { content: 'x' } })).toThrow(TypeError);
  });
});
