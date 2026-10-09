// S6-01: the inline editor's caret-move keys, worked out on the latest text.
//
// react-ink-textarea moves the caret from the value and caret of its last
// render, and drops a caret report equal to its previous one. Keys that
// arrive in one burst (no redraw between them) would all move from the same
// old caret, so repeated arrows collapsed into one move. InlineEditor uses
// this module to make each move from the latest caret instead. It mirrors
// react-ink-textarea 0.4.0 (dist/hooks/useKeyboardInput.js and
// dist/textUtils.js: Up/Down by wrapped row, Left/Right by grapheme,
// Ctrl+A/Ctrl+E line start/end, Alt+B/Alt+F word boundaries, Down on the
// last row adding an empty line up to 3) with its default options.
import type { Key } from 'ink';

const AUTO_NEW_LINE_LIMIT = 3; // react-ink-textarea DEFAULT_AUTO_NEW_LINE_LIMIT
const INITIAL_LINE_COUNT = 2; // react-ink-textarea DEFAULT_INITIAL_LINE_COUNT
const TAB_WIDTH = 4; // react-ink-textarea DEFAULT_TAB_WIDTH

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Terminal cells for one grapheme (string-width's rules for common text). */
function cellWidth(g: string): number {
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

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;
const isCombining = (c: number): boolean =>
  (c >= 0x0300 && c <= 0x036f) ||
  (c >= 0x1ab0 && c <= 0x1aff) ||
  (c >= 0x1dc0 && c <= 0x1dff) ||
  (c >= 0x20d0 && c <= 0x20ff) ||
  (c >= 0xfe20 && c <= 0xfe2f);

function prevGrapheme(value: string, caret: number): number {
  if (caret <= 0) return 0;
  const at = Math.min(caret, value.length);
  const prev = value.charCodeAt(at - 1);
  if (prev < 0x80 && !isLow(prev)) return at - 1;
  let last = 0;
  for (const seg of segmenter.segment(value)) {
    if (seg.index >= at) break;
    last = seg.index;
  }
  return last;
}

function nextGrapheme(value: string, caret: number): number {
  if (caret >= value.length) return value.length;
  const at = Math.max(0, caret);
  const here = value.charCodeAt(at);
  const next = at + 1 < value.length ? value.charCodeAt(at + 1) : -1;
  if (here < 0x80 && !isHigh(here) && (next === -1 || !isCombining(next))) return at + 1;
  for (const seg of segmenter.segment(value)) {
    const end = seg.index + seg.segment.length;
    if (end > at) return end;
  }
  return value.length;
}

function lineStart(value: string, caret: number): number {
  if (caret <= 0) return 0;
  const i = value.lastIndexOf('\n', caret - 1);
  return i === -1 ? 0 : i + 1;
}

function lineEnd(value: string, caret: number): number {
  const i = value.indexOf('\n', caret);
  return i === -1 ? value.length : i;
}

function prevWord(value: string, caret: number): number {
  let p = caret - 1;
  while (p >= 0 && /\s/.test(value[p])) p--;
  while (p >= 0 && !/\s/.test(value[p])) p--;
  return p + 1;
}

function nextWord(value: string, caret: number): number {
  let p = caret;
  while (p < value.length && !/\s/.test(value[p])) p++;
  while (p < value.length && /\s/.test(value[p])) p++;
  return p;
}

function lineAndColumn(value: string, caret: number): { line: number; column: number } {
  const before = value.slice(0, caret);
  const line = before.split('\n').length - 1;
  return { line, column: caret - (before.lastIndexOf('\n') + 1) };
}

interface Row {
  lineIdx: number;
  absStart: number;
  text: string;
  isVirtualLine: boolean;
}

/** The TextArea's wrapped rows (buildVisualRows with one width for all rows). */
function visualRows(lines: string[], width: number, caretLine: number, caretColumn: number): Row[] {
  const rows: Row[] = [];
  let absStart = 0;
  lines.forEach((text, lineIdx) => {
    if (width <= 0 || text.length === 0) {
      rows.push({ lineIdx, absStart, text, isVirtualLine: false });
    } else {
      let buf = '';
      let bufWidth = 0;
      let start = 0;
      let lastWidth = 0;
      const flush = (): void => {
        rows.push({ lineIdx, absStart: absStart + start, text: buf, isVirtualLine: false });
        lastWidth = bufWidth;
        start += buf.length;
        buf = '';
        bufWidth = 0;
      };
      if (/^[\x20-\x7e]*$/.test(text)) {
        for (let i = 0; i < text.length; i += width) {
          buf = text.slice(i, i + width);
          bufWidth = buf.length;
          flush();
        }
      } else {
        for (const seg of segmenter.segment(text)) {
          const w = cellWidth(seg.segment);
          if (bufWidth + w > Math.max(1, width) && buf.length > 0) flush();
          buf += seg.segment;
          bufWidth += w;
        }
        flush();
      }
      // a caret after a full last row gets its own empty row
      if (lineIdx === caretLine && caretColumn === text.length && caretColumn > 0 && lastWidth === width) {
        rows.push({ lineIdx, absStart: absStart + text.length, text: '', isVirtualLine: false });
      }
    }
    absStart += text.length + 1;
  });
  for (let p = lines.length; p < INITIAL_LINE_COUNT; p++) {
    rows.push({ lineIdx: p, absStart, text: '', isVirtualLine: true });
  }
  return rows;
}

function rowForCaret(rows: Row[], line: number, column: number): number {
  let lineAbsStart = -1;
  let pick = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.lineIdx !== line || row.isVirtualLine) {
      if (lineAbsStart >= 0) break;
      continue;
    }
    if (lineAbsStart < 0) lineAbsStart = row.absStart;
    if (row.absStart - lineAbsStart <= column) pick = i;
    else break;
  }
  return pick;
}

/** One caret-move key applied to `value` at `caret`: the new caret and text. */
export interface CaretMove {
  caret: number;
  value: string;
}

/**
 * The effect of `input`/`key` as a react-ink-textarea caret move on `value`
 * with the caret at `caret`, wrapping rows at `width` cells (0 = not
 * measured yet: logical lines). Returns null when the key is not a caret
 * move. A move that cannot go anywhere returns the same caret.
 */
export function caretMove(value: string, caret: number, input: string, key: Key, width: number): CaretMove | null {
  const at = (c: number): CaretMove => ({ caret: c, value });
  const stay = at(caret);
  if (key.return || (key.ctrl && input === 'j') || input.endsWith('~')) return null;
  const { line, column } = lineAndColumn(value, caret);
  const lastLine = (): CaretMove => {
    let trailing = 0;
    for (let i = value.length - 1; i >= 0 && value[i] === '\n'; i--) trailing++;
    if (trailing >= AUTO_NEW_LINE_LIMIT) return at(value.length);
    return { caret: value.length + 1, value: `${value}\n` };
  };
  if (key.upArrow) {
    if (width > 0) {
      const rows = visualRows(value.split('\n'), width, line, column);
      const idx = rowForCaret(rows, line, column);
      if (idx <= 0) return stay;
      const prev = rows[idx - 1];
      if (prev.isVirtualLine) return at(lineStart(value, caret));
      return at(prev.absStart + Math.min(caret - rows[idx].absStart, prev.text.length));
    }
    if (line === 0) return stay;
    const prevEnd = lineStart(value, caret) - 1;
    const prevStart = lineStart(value, prevEnd);
    return at(prevStart + Math.min(column, prevEnd - prevStart));
  }
  if (key.downArrow) {
    if (width > 0) {
      const rows = visualRows(value.split('\n'), width, line, column);
      const idx = rowForCaret(rows, line, column);
      let next = idx + 1;
      while (next < rows.length && rows[next].isVirtualLine) next++;
      if (idx < 0 || next >= rows.length) return lastLine();
      return at(rows[next].absStart + Math.min(caret - rows[idx].absStart, rows[next].text.length));
    }
    const end = lineEnd(value, caret);
    if (end >= value.length) return lastLine();
    const nextEnd = lineEnd(value, end + 1);
    return at(end + 1 + Math.min(column, nextEnd - end - 1));
  }
  if (key.leftArrow) return at(prevGrapheme(value, caret));
  if (key.rightArrow) return at(nextGrapheme(value, caret));
  if (key.meta && input === 'b') return at(prevWord(value, caret));
  if (key.meta && input === 'f') return at(nextWord(value, caret));
  if (key.ctrl && input === 'a') return at(lineStart(value, caret));
  if (key.ctrl && input === 'e') return at(lineEnd(value, caret));
  return null;
}
