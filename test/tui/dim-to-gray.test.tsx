import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

import { Divider } from '../../src/tui/Divider';
import { StatusBar } from '../../src/tui/StatusBar';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FILES = [
  'src/tui/Preview.tsx',
  'src/tui/NoteList.tsx',
  'src/tui/Login.tsx',
  'src/tui/Divider.tsx',
  'src/tui/History.tsx',
  'src/tui/StatusBar.tsx',
  'src/tui/TagEditor.tsx',
];

const readAll = async (): Promise<string> => {
  const fs = await import('fs');
  return (await Promise.all(FILES.map((f) => fs.promises.readFile(f, 'utf8')))).join('\n');
};

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

// Ink bundles its own chalk v5 at ink/node_modules/chalk, distinct from the
// repo's top-level chalk v4 (level 0). Force the Ink instance's chalk level
// to 3 so lastFrame() contains real ANSI, then restore.
const forceInkChalk = async (): Promise<() => void> => {
  const inkPkgDir = path.dirname(path.dirname(createRequire(import.meta.url).resolve('ink')));
  const inkChalk = (
    await import(pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href)
  ).default;
  const saved = inkChalk.level;
  inkChalk.level = 3;
  return () => {
    inkChalk.level = saved;
  };
};

describe('T246 dimColor -> color="gray"', () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    if (restore) {
      restore();
      restore = null;
    }
  });

  it('1: WHEN the 7 components are read as text THEN together they contain dimColor 0 times', async () => {
    const source = await readAll();
    expect(countOccurrences(source, 'dimColor')).toBe(0);
  });

  it('2: WHEN the same 7 files are read as text THEN together they contain color="gray" exactly 0 times', async () => {
    const source = await readAll();
    expect(countOccurrences(source, 'color="gray"')).toBe(0);
  });

  it('3: WHEN <Divider height={3} /> is rendered THEN lastFrame() is exactly the dim frames and does not contain \\u001b[90m', async () => {
    restore = await forceInkChalk();
    const { lastFrame } = render(<Divider height={3} />);
    await delay(0);
    expect(lastFrame()).toBe('\u001b[2m│\u001b[22m\n\u001b[2m│\u001b[22m\n\u001b[2m│\u001b[22m');
    expect(lastFrame()).not.toContain('\u001b[90m');
  });

  it('4: WHEN <StatusBar connected={true} count={3} width={40} /> is rendered THEN lastFrame() is exactly the dim run and does not contain \\u001b[90m', async () => {
    restore = await forceInkChalk();
    const { lastFrame } = render(<StatusBar connected={true} count={3} width={40} />);
    await delay(0);
    expect(lastFrame()).toBe('\u001b[2m[\u001b[22m\u001b[32mconnected\u001b[39m\u001b[2m]\u001b[22m 3 notes');
    expect(lastFrame()).not.toContain('\u001b[90m');
  });

  it('5: WHEN <StatusBar connected={true} count={3} width={40} /> is rendered without forcing chalk THEN lastFrame() is exactly "[connected] 3 notes"', async () => {
    const { lastFrame } = render(<StatusBar connected={true} count={3} width={40} />);
    await delay(0);
    expect(lastFrame()).toBe('[connected] 3 notes');
  });
});
