import { cellWidth } from './cells';

type Row = { text: string; line: number };

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * #126: the index where the first `w` terminal cells of `text` end, or -1 when it
 * fits. Never 0: a first grapheme wider than `w` makes a row of its own.
 */
function cellCut(text: string, w: number): number {
  let cells = 0;
  for (const { segment, index } of segmenter.segment(text)) {
    cells += cellWidth(segment);
    if (cells > w) return index > 0 ? index : segment.length < text.length ? segment.length : -1;
  }
  return -1;
}

export function wrapLines(content: string, width: number): Row[] {
  const w = Math.max(1, width);
  const lines = content.split('\n');
  const result: Row[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') {
      result.push({ text: '', line: i });
    } else {
      let rest = line;
      // printable ASCII is one cell a character; anything else is measured in cells (#126)
      const ascii = /^[\x20-\x7e]*$/.test(line);
      const rowEnd = (text: string): number => (ascii ? (text.length > w ? w : -1) : cellCut(text, w));
      for (let end = rowEnd(rest); end !== -1; end = rowEnd(rest)) {
        const cut = rest.lastIndexOf(' ', end);
        if (cut <= 0) {
          result.push({ text: rest.slice(0, end).trimEnd(), line: i });
          rest = rest.slice(end).replace(/^ +/, '');
        } else {
          result.push({ text: rest.slice(0, cut).trimEnd(), line: i });
          rest = rest.slice(cut).replace(/^ +/, '');
        }
      }
      result.push({ text: rest, line: i });
    }
  }

  return result;
}
