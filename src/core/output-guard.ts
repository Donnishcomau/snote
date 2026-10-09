import { StringDecoder } from 'node:string_decoder';

/**
 * Output guard: note text fetched over the network must never be able to
 * program the terminal, so everything snote writes to stdout and stderr
 * passes through this filter.
 *
 * Kept, byte for byte:
 * - text, TAB, LF and CR;
 * - a CSI `ESC [ <params> <final>` whose params are digits, `;` and `:` only
 *   and whose final is a display command: `A B C D E F G H J K S T f m s u`;
 * - `ESC [ ? <modes> h` and `ESC [ ? <modes> l` when every mode is 25
 *   (cursor), 1049 (alternate screen), 2004 (bracketed paste) or 2026
 *   (synchronized output). These are all Ink writes besides the CSI above.
 *
 * Dropped:
 * - every other CSI: another final (`ESC [ 6 n` makes the terminal type a
 *   reply into stdin), plain `h`/`l`, another private marker or mode
 *   (`ESC [ ? u`, `ESC [ > 1 u`, `ESC [ ? 1003 h`), intermediate bytes, or a
 *   C0/C1 byte inside (the CSI is cut there and that byte is filtered on);
 * - every other ESC sequence: two-byte `ESC x` and `ESC <intermediates> x`;
 * - string sequences (OSC, DCS, SOS, PM, APC, as `ESC ] P X ^ _` or as C1
 *   U+009D U+0090 U+0098 U+009E U+009F) through BEL, `ESC \`, U+009C, CAN
 *   (U+0018) or SUB (U+001A); an ESC followed by anything but `\` also ends
 *   the string, and that ESC starts a new sequence which is filtered as usual;
 * - every other C0 control, DEL and every other C1 control.
 *
 * `guardOutputStream` keeps this state per wrapped stream: an unfinished
 * sequence at the end of a write (at most 64 characters, longer is dropped)
 * is joined to the next write, and an unterminated string sequence keeps
 * dropping only until its terminator, even across writes. Buffers and every
 * ArrayBuffer view go through one streaming UTF-8 decoder (a character split
 * across writes stays whole); a string written with another encoding is
 * decoded to text first. The filtered text is written on as a string, and a
 * callback argument still reaches the original `write`. `stripUnsafeOutput`
 * filters one chunk with fresh state; an unfinished sequence at its end is
 * dropped.
 */

const ESC = 0x1b;
const MAX_HELD = 64;
const DISPLAY_FINALS = new Set('ABCDEFGHJKSTfmsu');
const MODES_KEPT = new Set(['25', '1049', '2004', '2026']);
const STRING_INTRODUCERS = new Set([']', 'P', 'X', '^', '_']);
const C1_STRING_INTRODUCERS = new Set([0x90, 0x98, 0x9d, 0x9e, 0x9f]);

/** Is `ESC [ <params> <final>` one of the kept CSI forms? */
function keepCsi(params: string, final: string): boolean {
  if (final === 'h' || final === 'l') {
    return params.startsWith('?') && params.slice(1).split(';').every((m) => MODES_KEPT.has(m));
  }
  return DISPLAY_FINALS.has(final) && /^[0-9;:]*$/.test(params);
}

/** A filter with its own state: feed it chunks in order, it returns what may be written. */
function createFilter(): (input: string) => string {
  let held = ''; // unfinished ESC sequence from the end of the previous chunk
  let inString = false; // inside a string sequence, dropping until its terminator
  return (input) => {
    const s = held + input;
    held = '';
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (inString) {
        if (c === ESC) {
          if (i + 1 >= s.length) {
            held = s.slice(i); // ESC as the last char: the next write decides
            break;
          }
          inString = false;
          if (s.charCodeAt(i + 1) === 0x5c) i += 2; // ESC \ ends the string
          continue; // otherwise the ESC code below handles it as a new sequence
        }
        if (c === 0x07 || c === 0x9c || c === 0x18 || c === 0x1a) inString = false;
        i += 1;
        continue;
      }
      if (c === ESC) {
        if (i + 1 >= s.length) {
          held = s.slice(i);
          break;
        }
        const next = s[i + 1]!;
        if (STRING_INTRODUCERS.has(next)) {
          inString = true;
          i += 2;
          continue;
        }
        let j = i + 1;
        if (next === '[') {
          j = i + 2;
          while (j < s.length && s.charCodeAt(j) >= 0x30 && s.charCodeAt(j) <= 0x3f) j += 1;
        }
        while (j < s.length && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x2f) j += 1;
        if (j >= s.length) {
          if (s.length - i <= MAX_HELD) held = s.slice(i);
          break;
        }
        const f = s.charCodeAt(j);
        if (next === '[' && (f < 0x40 || f > 0x7e)) {
          i = j; // a control byte cut the CSI: drop it so far, filter that byte
          continue;
        }
        if (next === '[' && keepCsi(s.slice(i + 2, j), s[j]!)) out += s.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (C1_STRING_INTRODUCERS.has(c)) {
        inString = true;
      } else if (c >= 0x20 ? c < 0x7f || c > 0x9f : c === 0x09 || c === 0x0a || c === 0x0d) {
        out += s[i];
      }
      i += 1;
    }
    return out;
  };
}

/** Remove terminal escapes the terminal should never act on, from one chunk with fresh state. */
export function stripUnsafeOutput(chunk: string): string {
  return createFilter()(chunk);
}

interface MinimalOutputStream {
  write(chunk: unknown, ...args: unknown[]): unknown;
}

/**
 * Wrap a writable stream so every chunk passes through one filter (state
 * kept for this stream) before the real `write`. Returns the same stream.
 */
export function guardOutputStream<T extends MinimalOutputStream>(stream: T): T {
  const original = stream.write.bind(stream);
  const filter = createFilter();
  const decoder = new StringDecoder('utf8');
  stream.write = (chunk: unknown, ...args: unknown[]): unknown => {
    const encoding = typeof args[0] === 'string' ? args[0] : 'utf8';
    let text: string;
    if (typeof chunk === 'string') {
      const utf8 = /^utf-?8$/i.test(encoding) || !Buffer.isEncoding(encoding);
      text = utf8 ? chunk : decoder.write(Buffer.from(chunk, encoding));
    } else if (ArrayBuffer.isView(chunk)) {
      text = decoder.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    } else {
      return original(chunk, ...args);
    }
    // the encoding argument no longer applies once the chunk is filtered text
    const rest = typeof args[0] === 'string' ? args.slice(1) : args;
    return original(filter(text), ...rest);
  };
  return stream;
}
