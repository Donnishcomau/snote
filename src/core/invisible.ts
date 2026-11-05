/**
 * #663: the one list of the invisible characters snote keeps off the screen:
 * every Unicode format character (Cf: bidi marks, zero-width characters,
 * U+FEFF, U+2060, the soft hyphen, tag characters), every default-ignorable
 * code point (variation selectors U+FE00-U+FE0D and U+E0100-U+E01EF, U+034F,
 * the Hangul fillers;) and the line and paragraph separators U+2028 and
 * U+2029. U+FE0E/U+FE0F stay out (emoji need them). The Unicode tables are
 * the list, so a character no one wrote down is covered too. U+200D (ZWJ) is the
 * caller's choice: the display sinks keep it (emoji sequences), the export
 * path refuses it (#637). Controls (Cc) stay with each sink, which treats
 * TAB, LF and CR on purpose.
 * proof: test/core/invisible-chars.test.ts
 */
export const INVISIBLE_FORMAT = /(?![\uFE0E\uFE0F])[\p{Cf}\p{Default_Ignorable_Code_Point}\u2028\u2029]/u;

/**
 * #663 rev2: the three RGI subdivision flags (England, Scotland, Wales: U+1F3F4, the tags of gbeng, gbsct or gbwls,
 * U+E007F) keep their tag characters in a display sink; every other tag character, lone or in any other sequence,
 * still goes, so no hidden text rides behind a flag. The export path refuses them all.
 */
export const KEPT_FLAG = /\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}/uy;

/** The UTF-16 length of a kept flag starting at index `i` of `s`, or 0 when none starts there. */
export function keptFlagAt(s: string, i: number): number {
  if (s.charCodeAt(i) !== 0xd83c) return 0;
  KEPT_FLAG.lastIndex = i;
  return KEPT_FLAG.exec(s)?.[0].length ?? 0;
}

/** One code point of INVISIBLE_FORMAT other than U+200D: what a display sink drops or stands in for. */
export function isShownInvisible(cp: number): boolean {
  return cp !== 0x200d && INVISIBLE_FORMAT.test(String.fromCodePoint(cp));
}
