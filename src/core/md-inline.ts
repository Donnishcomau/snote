import removeMarkdown from 'remove-markdown';

/**
 * A styled range inside the stripped text of a single markdown line.
 * `start` is inclusive, `end` exclusive, both offsets into `inlineMarkdown().text`.
 */
export type InlineSpan = { start: number; end: number; kind: 'link' | 'code' };

// Private-use sentinels wrapped around labels/code before removeMarkdown
// runs, so their offsets survive the stripping of emphasis and other markup.
const LINK_OPEN = '\uE000';
const LINK_CLOSE = '\uE001';
const CODE_OPEN = '\uE002';
const CODE_CLOSE = '\uE003';
// Bullet/checklist markers become one sentinel each, expanded to their
// 2-column prefix while reading the stripped line back, so link/code
// offsets shift by exactly that prefix.
const BULLET = '\uE004';
const CHECK_EMPTY = '\uE005';
const CHECK_DONE = '\uE006';
// An image is masked to its alt text between its own sentinels:
// removeMarkdown would otherwise strip the link syntax and leave a stray
// '!', and a bare label would read as a link and yield a span. IMG_CLOSE
// also clears any span left open, so an image never contributes one.
const IMG_OPEN = '\uE007';
const IMG_CLOSE = '\uE008';

// Run removeMarkdown on a masked line and read the sentinels back out:
// they are dropped, link/code pairs become spans, and each marker
// sentinel expands to its prefix (empty for plain lines).
function expandMasked(stripped: string, markerPrefix: string): { text: string; spans: InlineSpan[] } {
  const spans: InlineSpan[] = [];
  let text = '';
  let openStart = -1;
  let openKind: 'link' | 'code' | null = null;
  for (const ch of stripped) {
    if (ch === LINK_OPEN || ch === CODE_OPEN) {
      openStart = text.length;
      openKind = ch === LINK_OPEN ? 'link' : 'code';
    } else if (ch === LINK_CLOSE || ch === CODE_CLOSE) {
      // U+E000..U+E008 arriving from raw are dropped here and never make a span.
      if (openStart >= 0 && openKind !== null && text.length > openStart) {
        spans.push({ start: openStart, end: text.length, kind: openKind });
      }
      openStart = -1;
      openKind = null;
    } else if (ch === IMG_OPEN) {
      // Sentinels only wrap the alt text, which was already copied through.
    } else if (ch === IMG_CLOSE) {
      openStart = -1;
      openKind = null;
    } else if (ch === BULLET || ch === CHECK_EMPTY || ch === CHECK_DONE) {
      text += markerPrefix;
    } else {
      text += ch;
    }
  }
  return { text, spans };
}

/**
 * Strip markdown from one raw line and report where link labels and
 * inline-code spans sit in the resulting text.
 */
export function inlineMarkdown(raw: string): { text: string; spans: InlineSpan[] } {
  const masked = raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, (_match, label: string) => LINK_OPEN + label + LINK_CLOSE)
    .replace(/`([^`]*)`/g, (_match, content: string) => CODE_OPEN + content + CODE_CLOSE);

  return expandMasked(removeMarkdown(masked), '');
}

/**
 * One raw markdown line rendered to its preview text, with the inline
 * spans re-based onto that text.
 */
export type BodyLine = { text: string; isHeading: boolean; spans: InlineSpan[] };

/**
 * Render one raw line of a markdown note to its preview text: headings
 * lose their `#` marks and are flagged, checklist items become a ☐/☑
 * prefix plus text, bullets become • plus text, everything else is the
 * stripped line. Spans point into the returned text.
 */
export function markdownBodyLine(raw: string): BodyLine {
  const masked = raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/^([-*])\s+\[([ xX])\]\s+/, (_match, _marker: string, state: string) =>
      state === ' ' ? CHECK_EMPTY : CHECK_DONE,
    )
    .replace(/^([-*])\s+/, BULLET)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt: string) => IMG_OPEN + alt + IMG_CLOSE)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, (_match, label: string) => LINK_OPEN + label + LINK_CLOSE)
    .replace(/`([^`]*)`/g, (_match, content: string) => CODE_OPEN + content + CODE_CLOSE);

  const stripped = removeMarkdown(masked);

  const isHeading = /^#{1,6}\s/.test(raw);
  const markerPrefix = stripped.startsWith(CHECK_EMPTY)
    ? '☐ '
    : stripped.startsWith(CHECK_DONE)
      ? '☑ '
      : stripped.startsWith(BULLET)
        ? '• '
        : '';

  const { text, spans } = expandMasked(stripped, markerPrefix);
  return { text, isHeading, spans };
}

/**
 * Map spans from a stripped line onto the wrapped rows of that line.
 * Spans are clipped to each row and re-based to the row's start; a span
 * split by a wrap boundary appears on both rows.
 */
export function rowSpans(lineText: string, rows: string[], spans: InlineSpan[]): InlineSpan[][] {
  const ranges: Array<[number, number]> = [];
  let searchFrom = 0;
  for (const row of rows) {
    // wrapLines only trims spaces at cuts, so each row's text is a literal
    // slice of the line; search forward from the end of the previous row.
    const at = lineText.indexOf(row, searchFrom);
    const start = at < 0 ? searchFrom : at;
    const end = start + row.length;
    ranges.push([start, end]);
    searchFrom = end;
  }

  return ranges.map(([rowStart, rowEnd]) => {
    const out: InlineSpan[] = [];
    for (const span of spans) {
      const start = Math.max(span.start, rowStart);
      const end = Math.min(span.end, rowEnd);
      if (start < end) {
        out.push({ start: start - rowStart, end: end - rowStart, kind: span.kind });
      }
    }
    return out;
  });
}

/**
 * Map each body line's inline spans onto the wrapped rows of the whole
 * body. `lines[i]` is what `markdownBodyLine` returned for body line `i`
 * and `rows` is what `wrapLines` returned for the joined body, so each
 * row carries the index of its source line. Returns one span array per
 * row, offsets re-based to that row; a span cut by a wrap appears on
 * both rows. Rows of a line without spans get an empty array.
 */
export function bodyRowSpans(
  lines: ReadonlyArray<{ text: string; spans: InlineSpan[] }>,
  rows: ReadonlyArray<{ text: string; line: number }>,
): InlineSpan[][] {
  const byLine = new Map<number, string[]>();
  for (const row of rows) {
    const texts = byLine.get(row.line);
    if (texts) {
      texts.push(row.text);
    } else {
      byLine.set(row.line, [row.text]);
    }
  }

  const perLine = new Map<number, InlineSpan[][]>();
  for (const [line, rowTexts] of byLine) {
    const source = lines[line];
    perLine.set(line, rowSpans(source.text, rowTexts, source.spans));
  }

  const next = new Map<number, number>();
  return rows.map(({ line }) => {
    const index = next.get(line) ?? 0;
    next.set(line, index + 1);
    return perLine.get(line)?.[index] ?? [];
  });
}
