import { Box, Text } from 'ink';
import React from 'react';
import { render } from 'ink-testing-library';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function forceInkChalk() {
  const inkResolved = createRequire(import.meta.url).resolve('ink');
  const inkPkgDir = dirname(dirname(inkResolved));
  const chalkPath = join(inkPkgDir, 'node_modules/chalk/source/index.js');
  const inkChalk = (await import(pathToFileURL(chalkPath).href)).default;
  const savedLevel = inkChalk.level;
  inkChalk.level = 3;
  return { inkChalk, restore: () => { inkChalk.level = savedLevel; } };
}

describe('Ink nested Text', () => {
  it('nested Text inside Text, no divider', async () => {
    const { inkChalk, restore } = await forceInkChalk();
    try {
      const { lastFrame } = render(
        <Text wrap="truncate">
          <Text color="gray">☐</Text>
          {' milk'}
        </Text>
      );
      await delay(50);
      const frame = lastFrame() ?? '';
      console.log('Frame:', JSON.stringify(frame));
      expect(frame).toContain('\u001b[90m☐\u001b[39m milk');
    } finally {
      restore();
    }
  });
});
