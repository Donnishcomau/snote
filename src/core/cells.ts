// #126: terminal cells for one grapheme, shared by the inline editor's caret moves
// (src/tui/caretMoves.ts) and preview wrapping (src/core/wrap.ts).
const TAB_WIDTH = 4; // react-ink-textarea DEFAULT_TAB_WIDTH

/** Terminal cells for one grapheme (string-width's rules for common text). */
export function cellWidth(g: string): number {
  if (g.length === 0) return 0;
  if (g === '\t') return TAB_WIDTH;
  const c = g.codePointAt(0) ?? 0;
  if (g.length === 1 && c >= 0x20 && c < 0x7f) return 1;
  if (g.length === 1 && c < 0x20) return 0;
  if (/\p{Emoji_Presentation}/u.test(g) || (g.includes('️') && /\p{Emoji}/u.test(g))) return 2;
  if (/^\p{M}+$/u.test(g)) return 0;
  const wide =
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe4f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x20000 && c <= 0x3fffd);
  return wide ? 2 : 1;
}
