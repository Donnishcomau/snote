// T172 — fixture rendered both bundled and unbundled so the test can prove
// the lazyIcu plugin's ASCII fast path produces identical frames.
// Run as: node <outfile> print

import React from 'react';
import { Box, Text, renderToString } from 'ink';

export const SAMPLES = [
  'plain ascii line that is longer than twenty columns',
  'héllo wörld 日本語 and more text here',
  'ok 👍🏽 family 👨‍👩‍👧 flags 🇳🇱 done and more',
];

export function frames(): string[] {
  return SAMPLES.map((s) =>
    renderToString(
      <Box width={20}>
        <Text wrap="truncate">{s}</Text>
      </Box>,
      { columns: 40 }
    )
  );
}

if (process.argv[2] === 'print') {
  console.log(JSON.stringify(frames()));
}
