import { pushKeyEvent } from '../core/crash-ring';
import type { KeyEvent } from '../core/crash-ring';
import { splitPastedInput } from './split-input';
import type { Key } from 'ink';

const PASTE_START = '\u001B[200~';
const PASTE_END = '\u001B[201~';

let keyLog: KeyEvent[] = [];

// T411 — a bracketed paste reaches App's useInput as ONE input event whose
// `input` is the whole pasted text (Ink emits it on the input channel when
// no usePaste listener exists), and App replays it through handleKey one
// character at a time. handleKey cannot tell that replay from typing, so
// the listener in key-ring-listener.ts counts the keystrokes the upcoming
// chunk will replay. recordKeyEvent consumes that debt one key at a time,
// in strict order, so a plain command key written after a paste is still
// recorded as typed.
let textRun = 0;

/** Mark the next `n` recorded keystrokes as replayed pasted text. */
export function beginTextRun(chars: number): void {
  textRun += chars;
}

/** Consume one unit of paste debt; true when this keystroke is pasted text. */
function claimTextRun(): boolean {
  if (textRun <= 0) return false;
  textRun -= 1;
  return true;
}

/** True while no paste debt is open (safe to call from a polling test). */
export function textRunEnded(): boolean {
  return textRun === 0;
}

/**
 * The characters of a chunk App will replay one keystroke at a time. Ink
 * strips the bracketed-paste markers before emitting (`useInput` receives
 * the bare pasted text), so the test is exactly App's own replay guard: a
 * multi-character chunk without an escape sequence. Null for single keys,
 * escape sequences, and anything splitPastedInput declines to split.
 */
export function pastedCharsOf(chunk: string): string[] | null {
  if (chunk.startsWith(PASTE_START)) {
    // a raw chunk that still carries its markers (Ink keeps them when a
    // paste listener exists) — measure the body between them
    const end = chunk.indexOf(PASTE_END, PASTE_START.length);
    return splitPastedInput(chunk.slice(PASTE_START.length, end === -1 ? undefined : end));
  }
  return splitPastedInput(chunk);
}

export function recordKeyEvent(input: string, key: Key, textPromptOpen: boolean): void {
  // T291 — while a text prompt is open the user is typing content; the ring
  // must never store what was typed, only that a keystroke happened.
  // T411 — the same mask covers a paste: every replayed character of a
  // bracketed paste is stored as '<text>', in every mode.
  // T478 — a chunk that survives App's replay split because it contains
  // ESC (bracketed paste around an escape sequence) reaches here as one
  // multi-character input; in any mode it is stored as '<text>', never
  // verbatim. Single characters keep the behaviour above.
  const masked = input.length > 1 || ((textPromptOpen || claimTextRun()) && input);
  keyLog = pushKeyEvent(keyLog, { input: masked ? '<text>' : input, key: { ...key } });
}

export function getKeyLog(): KeyEvent[] {
  return keyLog;
}

export function resetKeyLog(): void {
  keyLog = [];
  textRun = 0;
}
