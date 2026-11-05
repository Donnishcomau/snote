/**
 * #663: one shared list (src/core/invisible.ts: every Cf character plus U+2028/U+2029) decides what the four sinks
 * treat as invisible: sanitizeForTerminal drops it, the plain output guard drops it, the editor stand-in shows it as
 * U+FFFD (one per UTF-16 unit) and the export path refuses it. U+200D (ZWJ) stays on screen and the variation
 * selectors stay out of the list. Each sink has its own test, so a sink that keeps a hand list goes red alone.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { INVISIBLE_FORMAT, isShownInvisible } from '../../src/core/invisible';
import { sanitizeForTerminal } from '../../src/core/sanitize';
import { setPlainOutput, stripUnsafeOutput } from '../../src/core/output-guard';
import { standInText } from '../../src/tui/standin';
import { UNSAFE_PATH } from '../../src/core/export-name';
import { HOSTILE } from '../fixtures/hostile';

// U+FEFF, U+2060, U+00AD (soft hyphen), U+E0041 (tag A): Cf the old hand lists missed; U+FE00, U+034F, U+3164,
// U+E0100: default-ignorables that are not Cf
const NEW_CF = ['\ufeff', '\u2060', '\u00ad', '\u{e0041}', '\ufe00', '\u034f', '\u3164', '\u{e0100}'];
const FAMILY = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}';
// rev2: the three RGI subdivision flags keep their tags on screen; a black flag with any other tags, or a lone tag, does not
const tags = (t: string): string => [...t].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
const FLAGS = ['gbeng', 'gbsct', 'gbwls'].map((t) => `\u{1f3f4}${tags(t)}\u{e007f}`);
const HIDDEN = `\u{1f3f4}${tags('hi')}\u{e007f}`;

afterEach(() => setPlainOutput(false));

describe('#663 one shared invisible-character list', () => {
  it('1: WHEN the shared list is asked THEN U+FEFF, U+2060, U+00AD, U+E0041, U+FE00, U+034F, U+3164, U+E0100, U+061C, U+200B, U+202E and U+2028 are in it, U+200D is in INVISIBLE_FORMAT but not shown-invisible, and U+FE0F, U+FE0E, `a` and U+1F600 are in neither', () => {
    for (const ch of [...NEW_CF, '\u061c', '\u200b', '\u202e', '\u2028']) expect(isShownInvisible(ch.codePointAt(0)!), ch.codePointAt(0)!.toString(16)).toBe(true);
    expect(INVISIBLE_FORMAT.test('\u200d')).toBe(true);
    expect(isShownInvisible(0x200d)).toBe(false);
    for (const ch of ['\ufe0f', '\ufe0e', 'a', '\u{1f600}']) {
      expect(INVISIBLE_FORMAT.test(ch), ch).toBe(false);
      expect(isShownInvisible(ch.codePointAt(0)!), ch).toBe(false);
    }
  });

  it('2: WHEN sanitizeForTerminal gets `a` + each new Cf character + `b`, and the family emoji THEN it returns `ab` for each and the family emoji unchanged (sanitize sink)', () => {
    for (const ch of NEW_CF) expect(sanitizeForTerminal(`a${ch}b`), ch.codePointAt(0)!.toString(16)).toBe('ab');
    expect(sanitizeForTerminal(FAMILY)).toBe(FAMILY);
  });

  it('3: WHEN plain output is on and `a` + each new Cf character + `b` is filtered THEN `ab` comes out, the family emoji passes unchanged, and with plain output off the text passes as it is (output-guard sink)', () => {
    setPlainOutput(true);
    for (const ch of NEW_CF) expect(stripUnsafeOutput(`a${ch}b`), ch.codePointAt(0)!.toString(16)).toBe('ab');
    expect(stripUnsafeOutput(FAMILY)).toBe(FAMILY);
    setPlainOutput(false);
    expect(stripUnsafeOutput('a\ufeffb')).toBe('a\ufeffb');
  });

  it('4: WHEN standInText gets `a` + each new Cf character + `b` THEN each BMP one shows as one U+FFFD, the tag character as two, the length equals the input length, and the family emoji is unchanged (stand-in sink)', () => {
    for (const ch of NEW_CF) {
      const shown = standInText(`a${ch}b`);
      expect(shown, ch.codePointAt(0)!.toString(16)).toBe(`a${'\ufffd'.repeat(ch.length)}b`);
      expect(shown.length).toBe(ch.length + 2);
    }
    expect(standInText(FAMILY)).toBe(FAMILY);
  });

  it('5: WHEN the export path check gets a name holding each new Cf character, U+200D or a control THEN it refuses each, and `notes.md` and U+2764 U+FE0F pass (export-name sink)', () => {
    for (const ch of [...NEW_CF, '\u200d', '\u0007']) expect(UNSAFE_PATH.test(`a${ch}b.md`), ch.codePointAt(0)!.toString(16)).toBe(true);
    expect(UNSAFE_PATH.test('notes.md')).toBe(false);
    expect(UNSAFE_PATH.test('\u2764\ufe0f.md')).toBe(false);
  });

  it('6: WHEN the hostile corpus `format` entry goes through sanitizeForTerminal and the plain output guard THEN nothing of it is left', () => {
    expect(sanitizeForTerminal(HOSTILE.format)).toBe('');
    setPlainOutput(true);
    expect(stripUnsafeOutput(HOSTILE.format)).toBe('');
  });

  it('7: WHEN the England, Scotland and Wales flags go through sanitizeForTerminal, the plain output guard and standInText THEN each comes out unchanged (same length) in all three display sinks, and the export path refuses each', () => {
    setPlainOutput(true);
    for (const f of FLAGS) {
      expect(sanitizeForTerminal(`a${f}b`)).toBe(`a${f}b`);
      expect(stripUnsafeOutput(`a${f}b`)).toBe(`a${f}b`);
      expect(standInText(`a${f}b`)).toBe(`a${f}b`);
      expect(UNSAFE_PATH.test(`${f}.md`)).toBe(true);
    }
  });

  it('8: WHEN a black flag carries other tags (hidden `hi`), or a flag lacks its cancel tag THEN every tag goes in sanitizeForTerminal and the plain output guard and stands in as U+FFFD in standInText, and the black flag stays', () => {
    setPlainOutput(true);
    const noCancel = FLAGS[1]!.slice(0, -2);
    for (const t of [HIDDEN, noCancel]) {
      expect(sanitizeForTerminal(`a${t}b`)).toBe('a\u{1f3f4}b');
      expect(stripUnsafeOutput(`a${t}b`)).toBe('a\u{1f3f4}b');
      expect(standInText(`a${t}b`)).toBe(`a\u{1f3f4}${'\ufffd'.repeat(t.length - 2)}b`);
    }
  });

  it('9: WHEN the prepended concatenation marks U+0600-U+0605, U+06DD, U+070F, U+08E2 and the Mongolian selectors U+180B-U+180F are asked THEN each is shown-invisible and sanitizeForTerminal drops it from `a` + it + `1` (kept by rule: Ink measures them 0 cells wide)', () => {
    for (const ch of ['\u0600', '\u0605', '\u06dd', '\u070f', '\u08e2', '\u180b', '\u180e', '\u180f']) {
      expect(isShownInvisible(ch.codePointAt(0)!), ch.codePointAt(0)!.toString(16)).toBe(true);
      expect(sanitizeForTerminal(`a${ch}1`)).toBe('a1');
    }
  });
});
