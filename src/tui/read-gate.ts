import { useLayoutEffect, useRef } from 'react';
import { useStdin } from 'ink';

/**
 * T538R (F220, F221, F224): the one place that sees each stdin read.
 *
 * Ink splits one stdin read into several input events at every escape
 * sequence, so a rule on one Ink event cannot tell `y` typed alone from `y`
 * then an arrow in the same read. The gate wraps the stdin's `read` to know
 * the read in progress, and it is the only wrapper of Ink's input emitter in
 * src/tui (test/tui/read-gate.test.tsx line 5), so no second wrapper can be
 * installed or restored around it in the wrong order.
 *
 * Per read: while a role reports a y/n confirm, a read that is not exactly
 * one key delivers nothing (fail closed); while a role reports the window too
 * small, every input goes to that role and pastes are dropped.
 *
 * T538R-3 (F217, F220): with App's role (`entry`) the rule holds in the list,
 * search and the editor. Only the first key of a read acts outside text
 * entry; every later key and paste of the read is delivered only while a
 * text-entry mode is open (each read again in the mode the previous key left
 * on screen), the read ends at the key that closes that mode, and the rest
 * is dropped and reported (`onDropped`). Ink's delayed lone escape belongs to
 * the read it came from, so it is a first key only when that read was just
 * the escape.
 */
export interface ReadGateRole {
  confirm?: boolean;
  whileSmall?: (input: string) => void;
  /** App: the text-entry mode on screen; its closing key, `whole` for a mode that takes a read whole, or null outside text entry. */
  entry?: () => string | null;
  /** App: later keys of a read were dropped. */
  onDropped?: () => void;
  /**
   * Root, T538R-5: Ctrl+C. Ink's own exit on Ctrl+C is off (src/cli/main.tsx),
   * so Ctrl+C quits only through the gate, and only from a read that holds
   * nothing but Ctrl+C; in any other read it quits nothing and ends the read.
   */
  onCtrlC?: () => void;
}

/** The status line App shows when later keys of a read were dropped (product-manager, T538R slice 3). */
export const SEVERAL_KEYS = 'Several keys at once: only the first was used';

type Read = (...args: unknown[]) => unknown;
interface GateStdin {
  stdin?: { read: Read };
  internal_eventEmitter?: NodeJS.EventEmitter;
}
/** One stdin read: its text, how many pieces it delivered, whether it ended. */
interface ReadState {
  text: string;
  delivered: number;
  ended: boolean;
  reported: boolean;
}
interface Item {
  ev: 'input' | 'paste';
  data: string;
  read: ReadState;
}
interface Gate {
  users: number;
  read: ReadState | null;
  last: ReadState | null;
  roles: Set<{ current: ReadGateRole }>;
  queue: Item[];
  pumping: boolean;
  restore: () => void;
}

const gates = new WeakMap<NodeJS.EventEmitter, Gate>();

/** The whole read is this one key (a CSI or SS3 sequence, never a meta key like `\x1by`). */
function wholeKey(read: ReadState, input: string): boolean {
  if (read.delivered > 0 || input !== read.text) return false;
  return [...input].length === 1 || input.startsWith('\x1b[') || input.startsWith('\x1bO');
}

/** The read an event belongs to: the read in progress, the read whose delayed escape it is, or its own. */
function readOf(gate: Gate, data: string): ReadState {
  if (gate.read) return gate.read;
  const last = gate.last;
  gate.last = null;
  if (last && last.text.endsWith(data)) return last;
  return { text: data, delivered: 0, ended: false, reported: false };
}

function install(stdin: { read: Read }, em: NodeJS.EventEmitter): Gate {
  const realEmit = em.emit;
  const realRead = stdin.read;
  const ownRead = Object.prototype.hasOwnProperty.call(stdin, 'read');
  const gate: Gate = { users: 0, read: null, last: null, roles: new Set(), queue: [], pumping: false, restore: () => {} };
  stdin.read = function (this: unknown, ...args: unknown[]) {
    const chunk = realRead.apply(this, args);
    gate.read = chunk === null || chunk === undefined ? null : { text: String(chunk), delivered: 0, ended: false, reported: false };
    if (gate.read) gate.last = gate.read;
    return chunk;
  };
  const roles = () => [...gate.roles].map((r) => r.current);
  const emit = (ev: string, data: string, read: ReadState): void => {
    read.delivered += 1;
    // a paste whose listener left while it waited (the list's refusal, T481)
    // goes to the input channel, as Ink itself hands it over
    realEmit.call(em, ev === 'paste' && em.listenerCount('paste') === 0 ? 'input' : ev, data);
  };
  const drop = (read: ReadState): void => {
    read.ended = true;
    if (read.reported) return;
    read.reported = true;
    roles().find((r) => r.onDropped)?.onDropped?.();
  };
  /** Deliver what the mode on screen allows of one item now; anything left goes back to the front of the queue. */
  const step = (item: Item, entry: () => string | null): void => {
    const { ev, data, read } = item;
    if (read.ended) return drop(read);
    // a y/n confirm opened by an earlier piece: a later piece never answers it (CK-3 pre-build)
    if (roles().some((r) => r.confirm)) {
      read.ended = true;
      return;
    }
    const mode = entry();
    if (ev === 'paste') return read.delivered === 0 || mode !== null ? emit(ev, data, read) : drop(read);
    // a paste Ink hands to the input channel (no paste listener) is text, never keys
    if (read.text.includes(`\x1b[200~${data}\x1b[201~`)) return mode !== null ? emit(ev, data, read) : drop(read);
    if (mode === 'whole' || data.startsWith('\x1b')) {
      if (read.delivered > 0 && mode === null) return drop(read);
      return emit(ev, data, read);
    }
    if (mode === null) {
      if (read.delivered > 0) return drop(read);
      const first = [...data][0];
      emit(ev, first, read);
      if (data.length > first.length) gate.queue.unshift({ ev, data: data.slice(first.length), read });
      return;
    }
    const at = data.indexOf(mode);
    if (at === -1) return emit(ev, data, read);
    if (at > 0) {
      emit(ev, data.slice(0, at), read);
      gate.queue.unshift({ ev, data: data.slice(at), read });
      return;
    }
    emit(ev, mode, read);
    read.ended = true;
    if (data.length > mode.length) drop(read);
  };
  // A microtask is enough for the screen to catch up: Ink runs each key's
  // handler as a discrete update that React commits, effects included,
  // before it returns (T538, SR17 Check 3), so the next piece is read in the
  // mode the previous one opened.
  const pump = (): void => {
    const entry = roles().find((r) => r.entry)?.entry;
    const item = gate.queue.shift();
    if (item && entry) step(item, entry);
    else if (item) emit(item.ev, item.data, item.read);
    if (gate.queue.length > 0) queueMicrotask(pump);
    else gate.pumping = false;
  };
  em.emit = function (this: NodeJS.EventEmitter, ev: string | symbol, ...a: unknown[]) {
    if (ev !== 'input' && ev !== 'paste') return realEmit.call(this, ev, ...a);
    const data = String(a[0]);
    const read = readOf(gate, data);
    const all = roles();
    const ctrlC = all.find((r) => r.onCtrlC)?.onCtrlC;
    if (ctrlC && ev === 'input' && /^\x03+$/.test(data)) {
      // a read of Ctrl+C bytes only quits (repeated presses on a slow snote); in any other read Ctrl+C quits nothing
      if (/^\x03+$/.test(read.text)) ctrlC();
      read.ended = true;
      return false;
    }
    const small = all.find((r) => r.whileSmall)?.whileSmall;
    if (small) {
      if (ev === 'input') small(data);
      return false;
    }
    if (all.some((r) => r.confirm)) {
      if (ev === 'input' && wholeKey(read, data)) emit(ev, data, read);
      else read.ended = true;
      return false;
    }
    const entry = all.find((r) => r.entry)?.entry;
    if (!entry) return realEmit.call(this, ev, ...a);
    gate.queue.push({ ev, data, read });
    if (gate.pumping) return false;
    gate.pumping = true;
    // a later event of a read waits for the screen like a later key does
    if (read.delivered > 0) queueMicrotask(pump);
    else pump();
    return false;
  } as typeof em.emit;
  gate.restore = () => {
    em.emit = realEmit;
    if (ownRead) stdin.read = realRead;
    else delete (stdin as { read?: Read }).read;
  };
  return gate;
}

/** Join the read gate with a role; the first user installs it, the last removes it. */
export function useReadGate(role: ReadGateRole): void {
  const { stdin, internal_eventEmitter: em } = useStdin() as unknown as GateStdin;
  const roleRef = useRef(role);
  roleRef.current = role;
  useLayoutEffect(() => {
    if (!stdin || !em) return;
    const gate = gates.get(em) ?? install(stdin, em);
    gates.set(em, gate);
    gate.users += 1;
    gate.roles.add(roleRef);
    return () => {
      gate.roles.delete(roleRef);
      gate.users -= 1;
      if (gate.users === 0) {
        gate.restore();
        gates.delete(em);
      }
    };
  }, [stdin, em]);
}
