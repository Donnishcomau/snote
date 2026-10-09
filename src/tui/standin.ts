// T412: the inline editor's display mapping. Characters that could feed
// terminal control sequences, or that are invisible / bidi-reordering, are
// shown as visible stand-ins; the note's own bytes are never touched.
// Every stand-in is exactly one UTF-16 unit for one, so offsets, lengths and
// the [line, col] cursor are identical in the real and the displayed text.

/** U+001B ESC — drawn as its Control Picture. */
export const ESC_STANDIN = '␛';

/**
 * The display form of one UTF-16 code unit of a note's content.
 * TAB and LF render as-is (the editor's own structure); every other C0
 * control shows as its Control Picture (U+2400 + code, so ESC is U+241B and
 * CR is U+240D); DEL (U+007F) shows as U+2421; every C1 control (U+0080-
 * U+009F), the zero-width and bidi controls U+200B, U+200C, U+200E, U+200F,
 * U+202A-U+202E, U+2066-U+2069, and the line separators U+2028/U+2029 show
 * as U+FFFD. U+200D (ZWJ, part of emoji sequences) and all other text pass
 * through unchanged.
 */
export function standInUnit(code: number): string {
  if (code === 0x09 || code === 0x0a) return String.fromCharCode(code);
  if (code < 0x20) return String.fromCharCode(0x2400 + code);
  if (code === 0x7f) return '␡';
  if (code >= 0x80 && code <= 0x9f) return '\uFFFD';
  if (code === 0x200b || code === 0x200c || code === 0x200e || code === 0x200f) return '\uFFFD';
  if (code >= 0x202a && code <= 0x202e) return '\uFFFD';
  if (code >= 0x2066 && code <= 0x2069) return '\uFFFD';
  if (code === 0x2028 || code === 0x2029) return '\uFFFD';
  return String.fromCharCode(code);
}

/** The stand-in version of `text`, drawn in place of the TextArea's value. */
export function standInText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += standInUnit(text.charCodeAt(i));
  return out;
}

/**
 * Apply one TextArea edit (shown text before -> shown text after) to the
 * note's real text. The unchanged prefix and suffix come from the real
 * text; only the changed middle is taken as typed, so control characters
 * the TextArea dropped or normalised away survive in the saved bytes, and a
 * typed stand-in character (e.g. a literal `␛`) stays that character.
 * `shownCursor` is the caret offset into `after` (one unit per unit, so it
 * is also the offset into the result).
 */
export function remapEdit(real: string, before: string, after: string, shownCursor: number): string {
  let p = 0;
  const n = Math.min(before.length, after.length);
  while (p < n && before[p] === after[p]) p++;
  let s = 0;
  while (s < n - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const typed = after.slice(p, after.length - s);
  const realCursor = Math.max(0, Math.min(p, real.length));
  // the common suffix has the same length in the real text (units map 1:1)
  return real.slice(0, realCursor) + typed + real.slice(real.length - s);
}
