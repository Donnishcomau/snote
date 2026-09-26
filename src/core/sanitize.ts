/**
 * Strip terminal control sequences from server-supplied text before it
 * reaches `<Text>` (OSC 8 hyperlink phishing, SGR repaint, `\r` line
 * stomping, C1/C0 controls).
 *
 * Removes, in order:
 * 1. ESC-initiated sequences: CSI `ESC [ ... final-byte`, OSC `ESC ] ...`
 *    terminated by BEL or `ESC \`, and any other two-byte `ESC x`.
 * 2. C1 control characters U+0080-U+009F.
 * 3. C0 control characters except `\n` (LF) and `\t` (TAB) — this also
 *    removes `\r` (CR) and lone BEL.
 *
 * 4. Variation selectors U+FE0F (emoji) and U+FE0E (text). `string-width`
 *    (and thus Ink) measures `❤️` as 2 columns while terminals such as
 *    foot with the default `grapheme-width-method=double-width` draw it
 *    as 1 (`wcwidth`: 1 + 0), misaligning pane dividers. Stripping the
 *    selector makes both agree: `❤️` renders as `❤`, 1 column everywhere.
 *
 * Everything else (Unicode incl. emoji and CJK, markdown punctuation)
 * passes through untouched.
 */

const ESC = '\u001b';

// CSI `ESC [ params final` and OSC `ESC ] ... ` closed by BEL or `ESC \`
// are consumed whole (tried first, so an ST-terminated OSC never leaks
// its body through the generic ESC-pair match below).
const CSI_OR_OSC = new RegExp(
  ESC + '\\[[\\d?;]*[@-~]' +
    '|' + ESC + '\\](?:[^' + ESC + '\u0007]|' + ESC + '\\\\)*' +
    '(?:\u0007|' + ESC + '\\\\)',
  'g'
);

// Any leftover ESC plus the character it introduces (a lone ESC eats the
// next char; unterminated CSI/OSC runs are swallowed byte by byte).
const ANY_ESC_PAIR = new RegExp(ESC + '.', 'g');

// C1 controls U+0080-U+009F, and C0 controls except TAB (\x09) and LF (\x0a).
const CONTROL_BYTES = new RegExp('[\\u0080-\\u009f\\x00-\\x08\\x0b-\\x1f\\x7f]', 'g');

// Variation selectors: U+FE0F (emoji) and U+FE0E (text). Their width is
// terminal-dependent, so they are removed to keep Ink and the terminal
// in agreement (see header).
const VARIATION_SELECTORS = /[\uFE0F\uFE0E]/g;

export function sanitizeForTerminal(s: string): string {
  return s
    .replace(CSI_OR_OSC, '')
    .replace(ANY_ESC_PAIR, '')
    .replace(CONTROL_BYTES, '')
    .replace(VARIATION_SELECTORS, '');
}
