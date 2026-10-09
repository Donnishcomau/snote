import React from 'react';
import { Text } from 'ink';

import type { InlineSpan } from '../core/md-inline';
import { theme } from './theme';

type Props = {
  text: string;
  spans: InlineSpan[];
};

// The checklist glyph is recognised only at offset 0; spans starting before
// the glyph's end are clipped, and the glyph keeps its leading space.
function glyphOf(text: string): { char: string; end: number } | null {
  if (text.startsWith('\u2610')) return { char: '\u2610', end: 1 };
  if (text.startsWith('\u2611')) return { char: '\u2611', end: 1 };
  return null;
}

function clip(spans: InlineSpan[], from: number): InlineSpan[] {
  const out: InlineSpan[] = [];
  for (const span of spans) {
    const start = Math.max(span.start, from);
    if (start < span.end) out.push({ start, end: span.end, kind: span.kind });
  }
  return out;
}

// Ink squashes a <Text> child's nodes into one string and applies that
// child's colour transform while doing so (squashTextNodes), so mixing a
// dim glyph and coloured spans as direct children of one <Text> renders
// wrong. Split them: the glyph is its own <Text>, the body is another.
function bodyPieces(text: string, spans: InlineSpan[], glyphEnd: number): React.ReactNode[] {
  const pieces: React.ReactNode[] = [];
  let cursor = glyphEnd;
  for (const span of clip(spans, glyphEnd)) {
    if (span.start > cursor) pieces.push(text.slice(cursor, span.start));
    pieces.push(
      <Text key={pieces.length} {...(span.kind === 'link' ? theme.link : theme.code)}>
        {text.slice(span.start, span.end)}
      </Text>,
    );
    cursor = span.end;
  }
  pieces.push(text.slice(cursor));
  return pieces;
}

/**
 * Render ONE preview body row: a leading checklist glyph coloured dim/green,
 * link and code spans coloured blue-underline/yellow, everything else plain.
 * With neither glyph nor spans the text renders unchanged.
 */
export function MdRowText({ text, spans }: Props): React.JSX.Element {
  const glyph = glyphOf(text);
  if (!glyph) return <Text>{bodyPieces(text, spans, 0)}</Text>;
  const glyphStyle = glyph.char === '\u2611' ? theme.success : theme.muted;
  return (
    <>
      <Text key="sp"> </Text>
      <Text key="g" {...glyphStyle}>{glyph.char}</Text>
      <Text key="b">{bodyPieces(text, spans, glyph.end)}</Text>
    </>
  );
}
