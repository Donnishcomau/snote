/**
 * #415: the simperium LocalQueue keeps at most one pending change per note
 * while a send waits for its acknowledgement. The tests drive the real
 * Channel with the in-memory ghost store and a 'send' listener that never
 * acknowledges.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import Channel from 'simperium/lib/simperium/channel';
import GhostStore from 'simperium/lib/simperium/ghost/store';

import { installSimperiumLocalQueueFix } from '../../src/core/simperium-local-queue-fix';
import { buildSplitDist, chunkGraph } from '../helpers/bundle-size';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
const heap = (): number => {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};
const MB = 1024 * 1024;
const ID = 'note-1';
const dirs: string[] = [];

afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

/** A flat text of `size` bytes ending `save-<i>`; the Buffer round trip means no two share memory. */
const text = (i: number, size = 100 * 1024): string =>
  Buffer.from('x'.repeat(size - `save-${i}`.length) + `save-${i}`, 'latin1').toString('latin1');

async function rig(install = true) {
  const channel: any = new (Channel as any)('app', 'tok', new (GhostStore as any)({}), 'note');
  await channel.store.setChangeVersion('1');
  if (install) installSimperiumLocalQueueFix({ buckets: [{ channel }] });
  const sent: string[] = [];
  channel.on('send', (msg: string) => {
    if (msg.startsWith('c:')) sent.push(msg);
  });
  const auth = async (): Promise<void> => {
    channel.localQueue.ready = false;
    channel.message.emit('auth', 'a@example.com');
    await vi.waitFor(() => expect(channel.localQueue.ready).toBe(true));
  };
  await auth();
  const save = (i: number, size?: number) => channel.update({ id: ID, data: { content: text(i, size) } });
  const queued = (): any[] => channel.localQueue.queues[ID] ?? [];
  const ack = async (count: number): Promise<void> => {
    channel.localQueue.acknowledge(channel.localQueue.sent[ID]);
    await vi.waitFor(() => expect(sent).toHaveLength(count));
  };
  return { channel, sent, auth, save, queued, ack };
}

describe('#415 local queue: at most one pending change per note while a send waits', () => {
  it('1: WHEN 500 saves of a 100 KB note (each a distinct flat text ending `save-<i>`, built so no two share memory) are made through `channel.update` while the first send is unacknowledged THEN exactly `1` change was sent, `localQueue.queues[id]` holds at most `1` entry, and after `localQueue.acknowledge` of the in-flight change the next sent change holds `save-499`', async () => {
    const r = await rig();
    for (let i = 0; i < 500; i++) await r.save(i);
    await vi.waitFor(() => expect(r.sent).toHaveLength(1));
    expect(r.sent).toHaveLength(1);
    expect(r.queued().length).toBeLessThanOrEqual(1);
    await r.ack(2);
    expect(r.sent[1]).toContain('save-499');
  });

  it('2: WHEN 50 saves are queued behind an unacknowledged send and the channel is authorised again (a reconnect) THEN `localQueue.queues[id]` holds at most `1` entry before the acknowledgement, and after the acknowledgement the last sent change holds `save-49`', async () => {
    const r = await rig();
    for (let i = 0; i < 50; i++) await r.save(i, 1024);
    await vi.waitFor(() => expect(r.sent).toHaveLength(1));
    await r.auth();
    expect(r.queued().length).toBeLessThanOrEqual(1);
    await r.ack(2);
    expect(r.sent[r.sent.length - 1]).toContain('save-49');
  });

  it('3: WHEN two saves, then `channel.remove(id)`, then one more save are made while a send is unacknowledged THEN `localQueue.queues[id]` holds exactly `1` entry of type `remove`, and after the acknowledgement the next sent change is a remove (`"o":"-"`)', async () => {
    const r = await rig();
    await r.save(0, 1024);
    await vi.waitFor(() => expect(r.sent).toHaveLength(1));
    await r.save(1, 1024);
    r.channel.remove(ID);
    await vi.waitFor(() => expect(r.queued().some((c) => c.type === 'remove')).toBe(true));
    await r.save(2, 1024);
    expect(r.queued().map((c) => c.type)).toEqual(['remove']);
    await r.ack(2);
    expect(r.sent[1]).toContain('"o":"-"');
  });

  it('4: WHEN the 500 saves of line 1 are made THEN the heap measured after gc grows by less than `10` MB (a full-copy queue holds 50 MB of distinct 100 KB texts)', async () => {
    const r = await rig();
    const before = heap();
    for (let i = 0; i < 500; i++) await r.save(i);
    expect(r.queued().length).toBeLessThanOrEqual(1);
    let grown = (heap() - before) / MB;
    for (const end = Date.now() + 1500; grown >= 10 && Date.now() < end; ) {
      await new Promise((res) => setTimeout(res, 10));
      grown = (heap() - before) / MB;
    }
    expect(grown).toBeLessThan(10);
  });

  it('5: WHEN the client has no buckets, a channel without `localQueue`, or a localQueue whose `queue` is not a function THEN `installSimperiumLocalQueueFix` does not throw, and installing it twice on one channel leaves line 1\'s result unchanged', async () => {
    for (const client of [undefined, null, {}, { buckets: [] }, { buckets: [{}] }, { buckets: [{ channel: {} }] }, { buckets: [{ channel: { localQueue: {} } }] }, { buckets: [{ channel: { localQueue: { queue: 5 } } }] }]) {
      expect(() => installSimperiumLocalQueueFix(client)).not.toThrow();
    }
    const r = await rig();
    installSimperiumLocalQueueFix({ buckets: [{ channel: r.channel }] });
    for (let i = 0; i < 500; i++) await r.save(i, 1024);
    await vi.waitFor(() => expect(r.sent).toHaveLength(1));
    expect(r.queued().length).toBeLessThanOrEqual(1);
    await r.ack(2);
    expect(r.sent[1]).toContain('save-499');
  });

  it('6: WHEN the split dist is built (`buildSplitDist` in test/helpers/bundle-size.ts) THEN the start set contains the text `installSimperiumLocalQueueFix(client);` WITH the semicolon', async () => {
    const dir = await buildSplitDist();
    dirs.push(dir);
    const graph = chunkGraph(dir);
    const hit = [...graph.start.keys()].filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('installSimperiumLocalQueueFix(client);'));
    expect(hit.length).toBeGreaterThan(0);
  }, 60000);

  it('7: WHEN, with the fix installed and the channel not ready, `localQueue.queue` is called twice with a change that has no `id` (`{ type: \'full\', object: { content: \'f-1\' } }`, then `\'f-2\'`) THEN neither call throws and `localQueue.queues[\'undefined\']` holds exactly `1` entry, whose object content is `f-2`', async () => {
    const channel: any = new (Channel as any)('app', 'tok', new (GhostStore as any)({}), 'note');
    installSimperiumLocalQueueFix({ buckets: [{ channel }] });
    expect(() => channel.localQueue.queue({ type: 'full', object: { content: 'f-1' } })).not.toThrow();
    expect(() => channel.localQueue.queue({ type: 'full', object: { content: 'f-2' } })).not.toThrow();
    expect(channel.localQueue.queues['undefined']).toHaveLength(1);
    expect(channel.localQueue.queues['undefined'][0].object.content).toBe('f-2');
  });
});
