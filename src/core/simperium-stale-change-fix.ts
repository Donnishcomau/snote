// #543/#544: a change whose sv is not the ghost's version is applied only
// if not already in the ghost, and local edits are measured against our ghost (simperium
// 1.1.4 used a fetched copy of sv, channel.js:100-142, 210-217). proof: test/core/simperium-stale-change-fix.test.ts
import { apply, diff, transform } from 'simperium/lib/simperium/util/change';

type Obj = Record<string, unknown>;
type Change = { id: string; o?: string; sv?: number; ev?: number; ccids?: string[]; error?: unknown };
type Fn = (...a: unknown[]) => void;
type Sent = { id: string; o?: string; sv?: number; v?: Obj; d?: Obj };
// OMARCHY: boundary cast
type Channel = {
  send(d: string): unknown;
  emit(e: string, ...a: unknown[]): unknown;
  once(e: string, f: Fn): unknown;
  rawListeners(e: string): Fn[];
  on(e: string, f: (id: string, s: Sent) => void): unknown;
  isIndexing?: boolean;
  removeListener(e: string, f: Fn): unknown;
  message: { prependListener(e: string, f: (d: string) => void): unknown };
  store: { get(id: string): Promise<{ version?: number; data?: Obj }>; put(id: string, v: number, d: Obj): unknown };
  localQueue: {
    sent: Record<string, (Sent & { ccid?: string }) | undefined>;
    queues: Record<string, { type?: string; object?: Obj }[] | undefined>;
    acknowledge(c: unknown): void;
    on(e: string, f: (c: Sent) => void): unknown;
  };
  onBeforeNetworkChange(id: string, data: Obj, base: Obj, patch: Obj): Promise<unknown>;
  staleFix?: boolean;
};
// OMARCHY: boundary cast (the bucket's object store; the note bucket's get answers at once)
type Live = { get?(id: string, cb: (e: unknown, o?: { data?: Obj }) => void): unknown };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const empty = (d: unknown) => !d || Object.keys(d).length === 0;

export function installStaleChangeFix(client: unknown): void {
  // OMARCHY: boundary cast
  for (const b of (client as { buckets?: { channel?: Channel; store?: Live }[] })?.buckets ?? []) {
    const ch = b?.channel;
    if (ch?.message && ch.store && !ch.staleFix) install(ch, b.store);
  }
}

function install(ch: Channel, live?: Live): void {
  ch.staleFix = true;
  // modify changes by `<id>.<sv>`, kept 60 s at most
  const records = new Map<string, { c: Change; at: number }[]>();
  ch.message.prependListener('c', (frame) => {
    const now = Date.now();
    for (const [k, l] of records) if (now - l[0].at > 60000) records.delete(k);
    try {
      for (const c of JSON.parse(frame) as Change[]) {
        if (c?.o !== 'M' || c.error || typeof c.sv !== 'number' || typeof c.ev !== 'number') continue;
        const k = c.id + '.' + c.sv;
        records.set(k, [...(records.get(k) ?? []), { c, at: now }]);
      }
    } catch {
      // not a change list
    }
  });
  // #706 (TL proof): a held edit sent against an old ghost comes back merged with another
  // device's change; channel.js:107-110 saves that copy as the ghost and leaves the
  // note as sent, so the next edit removed the other device's lines. Give the note and a queued edit
  // the server's additions. Not when a network change moved the ghost first: channel.js:116-139
  // already rebased the note then. proof: test/integration/catchup-fallback-held-edit.test.ts
  const out = new WeakMap<Sent, { t?: Obj; g?: Obj; n: number }>();
  ch.localQueue.on('send', (c) => {
    if (c.o !== 'M' || out.has(c)) return;
    const r = { t: c.d, n: 0 };
    out.set(c, r);
    if (!c.d) void ch.store.get(c.id).then((g) => (r.t = g?.data && (g.version ?? 0) === (c.sv ?? 0) ? (apply(c.v, g.data) as Obj) : undefined)).catch(() => undefined);
  });
  const put = ch.store.put.bind(ch.store);
  ch.store.put = (id, v, d) => {
    const r = out.get(ch.localQueue.sent[id]!);
    if (r) (r.g = d), r.n++;
    return put(id, v, d);
  };
  // a merged copy the diff throws on (content not a string) is ignored; the note keeps what was sent
  ch.on('acknowledge', (id, s) => {
    try {
      const { t, g, n } = out.get(s) ?? {};
      if (!t || !g || n !== 1 || same(t, g)) return;
      const p = diff(t, g) as Obj;
      const rb = (o: Obj) => (empty(diff(t, o)) ? g : (apply(transform(diff(t, o), p, t), g) as Obj));
      let note = g;
      for (const q of ch.localQueue.queues[id] ?? []) if (q.object && q.type === 'modify') note = q.object = rb(q.object);
      // text typed since the send that the editor delay (noteEditDelayMs) has not queued yet is only in the live note
      live?.get?.(id, (_e, o) => o?.data && (note = rb(o.data)));
      ch.emit('update', id, note, t, p, !!ch.isIndexing);
    } catch (f381) {
      return void f381;
    }
  });
  // channel.js:178-182: once('version.<id>.<sv>') is registered just before this send
  const send = ch.send.bind(ch);
  ch.send = (d: string) => {
    const m = /^e:(.+)\.(\d+)$/.exec(String(d));
    const k = m ? m[1] + '.' + m[2] : '';
    const l = records.get(k);
    const fns = m ? ch.rawListeners('version.' + k) : [];
    if (!l || !fns.length) return send(d);
    const { c } = l.shift()!;
    if (!l.length) records.delete(k);
    const fn = fns[fns.length - 1];
    ch.removeListener('version.' + k, fn);
    const ask = () => (ch.once('version.' + k, fn), send(d));
    void ch.store.get(c.id).then((g) => {
      if (typeof g?.version !== 'number' || (c.ev as number) > g.version) return ask();
      // already in the ghost: ack it if it is ours, apply nothing (the cv is not moved back)
      const s = ch.localQueue.sent[c.id];
      if (s?.ccid && (c.ccids ?? []).includes(s.ccid)) {
        ch.localQueue.acknowledge(s);
        ch.emit('acknowledge', c.id, s);
      }
    }, ask);
    return undefined;
  };
  // runs before the ghost is saved (channel.js:116-125)
  const before = ch.onBeforeNetworkChange.bind(ch);
  ch.onBeforeNetworkChange = async (id, data, base, patch) => {
    const local = await before(id, data, base, patch);
    const g = (await ch.store.get(id).catch(() => undefined))?.data;
    if (!local || !base || !g || same(g, base) || same(local, base)) return local;
    try {
      return fix(g, local as Obj, base);
    } catch {
      try {
        const w = wf(base);
        Object.assign(base, w);
        return fix(wf(g), wf(local as Obj), w);
      } catch {
        return local;
      }
    }
  };
}

const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
// lone surrogate: encodeURI throws; redo on copies with U+FFFD
const wf = (o: Obj): Obj => JSON.parse(JSON.stringify(o), (_k, v) => (typeof v === 'string' ? v.replace(LONE, '\ufffd') : v));
const fix = (g: Obj, l: Obj, b: Obj) => {
  const edits = diff(g, l) as Obj;
  if (empty(edits)) return b;
  const gap = diff(g, b) as Obj;
  return apply(empty(gap) ? edits : transform(edits, gap, g), b);
};
