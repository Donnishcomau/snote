/** #415: keep one entry per id in each channel's LocalQueue: the first remove, else the latest change. */
type Ch = { type?: string; id?: string };
type LQ = { queues?: Record<string, Ch[]>; sent?: Record<string, unknown>; queue?: ((c: Ch) => void) & { fixed?: boolean } };
type NQ = { queues?: Record<string, unknown> };

/** #502: a copy of a by-id map with no prototype, so an id like `__proto__`, `constructor` or `toString` is an ordinary key. */
const bare = <T extends object>(m: T | undefined): T | undefined =>
  m && Object.getPrototypeOf(m) !== null ? (Object.assign(Object.create(null), m) as T) : m;

export function installSimperiumLocalQueueFix(client: unknown): void {
  for (const b of (client as { buckets?: Array<{ channel?: { localQueue?: LQ; networkQueue?: NQ } }> } | undefined)?.buckets ?? []) {
    const lq = b?.channel?.localQueue;
    const orig = lq?.queue;
    if (!lq || typeof orig !== 'function' || orig.fixed) continue;
    // #502: the library keys these maps by note id; a note id chosen by the server or another client must not reach Object.prototype
    lq.queues = bare(lq.queues);
    lq.sent = bare(lq.sent);
    const nq = b?.channel?.networkQueue;
    if (nq) nq.queues = bare(nq.queues);
    const fn = function (this: LQ, c: Ch) {
      orig.call(this, c);
      const q = this.queues?.[c.id as string];
      if (q && q.length > 1) q.splice(0, q.length, q.find((x) => x.type === 'remove') ?? q[q.length - 1]);
    } as NonNullable<LQ['queue']>;
    fn.fixed = true;
    lq.queue = fn;
  }
}
