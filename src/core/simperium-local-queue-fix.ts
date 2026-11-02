/** #415: keep one entry per id in each channel's LocalQueue: the first remove, else the latest change. */
type Ch = { type?: string; id?: string };
type LQ = { queues?: Record<string, Ch[]>; queue?: ((c: Ch) => void) & { fixed?: boolean } };

export function installSimperiumLocalQueueFix(client: unknown): void {
  for (const b of (client as { buckets?: Array<{ channel?: { localQueue?: LQ } }> } | undefined)?.buckets ?? []) {
    const lq = b?.channel?.localQueue;
    const orig = lq?.queue;
    if (!lq || typeof orig !== 'function' || orig.fixed) continue;
    const fn = function (this: LQ, c: Ch) {
      orig.call(this, c);
      const q = this.queues?.[c.id as string];
      if (q && q.length > 1) q.splice(0, q.length, q.find((x) => x.type === 'remove') ?? q[q.length - 1]);
    } as NonNullable<LQ['queue']>;
    fn.fixed = true;
    lq.queue = fn;
  }
}
