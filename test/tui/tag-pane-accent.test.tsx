import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

import { TagPane } from '../../src/tui/TagPane';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const inkPkgDir = path.dirname(
  path.dirname(createRequire(import.meta.url).resolve('ink')),
);
const inkChalk = (
  await import(
    pathToFileURL(path.join(inkPkgDir, 'node_modules/chalk/source/index.js')).href
  )
).default;

describe('T380 TagPane selected row accent, system rows dim', () => {
  let savedLevel: number;

  beforeEach(() => {
    savedLevel = inkChalk.level;
    inkChalk.level = 3;
  });

  afterEach(() => {
    inkChalk.level = savedLevel;
  });

  it('1: WHEN fixture T renders with chalk forced THEN the 3 rows after the heading are exactly ·\\u001b[2mAll notes\\u001b[22m, \\u001b[1m>\\u001b[22m\\u001b[34mhome\\u001b[39m and " work".', async () => {
    const { lastFrame } = render(
      <TagPane tags={['home', 'work']} selectedIndex={1} focused={false} width={20} height={8} trashRow />,
    );
    await delay(0);
    const lines = (lastFrame() ?? '').split('\n');
    const iAll = lines.findIndex((l) => l.includes('All notes'));
    const iHome = lines.findIndex((l) => l.includes('home'));
    const iWork = lines.findIndex((l) => l.includes('work'));
    expect(iAll).toBeGreaterThan(-1);
    expect(iHome).toBe(iAll + 1);
    expect(iWork).toBe(iAll + 2);
    expect(lines[iAll]).toBe('·\u001b[2mAll notes\u001b[22m');
    expect(lines[iHome]).toBe('\u001b[1m>\u001b[22m\u001b[34mhome\u001b[39m');
    expect(lines[iWork]).toBe(' work');
  });

  it('2: WHEN fixture T renders with chalk forced THEN the 2 rows after those are exactly ·\\u001b[2mUntagged\\u001b[22m and ·\\u001b[2mTrash\\u001b[22m.', async () => {
    const { lastFrame } = render(
      <TagPane tags={['home', 'work']} selectedIndex={1} focused={false} width={20} height={8} trashRow />,
    );
    await delay(0);
    const lines = (lastFrame() ?? '').split('\n');
    const iAll = lines.findIndex((l) => l.includes('All notes'));
    const iUntagged = lines.findIndex((l) => l.includes('Untagged'));
    const iTrash = lines.findIndex((l) => l.includes('Trash'));
    expect(iUntagged).toBe(iAll + 3);
    expect(iTrash).toBe(iAll + 4);
    expect(lines[iUntagged]).toBe('·\u001b[2mUntagged\u001b[22m');
    expect(lines[iTrash]).toBe('·\u001b[2mTrash\u001b[22m');
  });

  it('3: WHEN fixture T renders with selectedIndex 0 THEN the first row is exactly \\u001b[1m>\\u001b[22m\\u001b[34mAll notes\\u001b[39m and the frame does not contain \\u001b[2mAll notes.', async () => {
    const { lastFrame } = render(
      <TagPane tags={['home', 'work']} selectedIndex={0} focused={false} width={20} height={8} trashRow />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    const iAll = lines.findIndex((l) => l.includes('All notes'));
    expect(iAll).toBeGreaterThan(-1);
    expect(lines[iAll]).toBe('\u001b[1m>\u001b[22m\u001b[34mAll notes\u001b[39m');
    expect(frame).not.toContain('\u001b[2mAll notes');
  });

  it('4: WHEN <TagPane tags={[\'Trash\']} selectedIndex={0} focused={false} width={20} height={6} /> renders with chalk forced THEN the second row is exactly " Trash" and the frame contains ·\\u001b[2mUntagged\\u001b[22m.', async () => {
    const { lastFrame } = render(
      <TagPane tags={['Trash']} selectedIndex={0} focused={false} width={20} height={6} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    const iTrash = lines.findIndex((l) => l.includes('Trash') && !l.includes('Untagged'));
    const iUntagged = lines.findIndex((l) => l.includes('Untagged'));
    expect(iTrash).toBe(iUntagged - 1);
    expect(lines[iTrash]).toBe(' Trash');
    expect(frame).toContain('·\u001b[2mUntagged\u001b[22m');
  });

  it('5: WHEN <TagPane tags={[\'home\']} selectedIndex={0} focused={false} width={20} height={5} /> renders without forcing chalk THEN the frame does not contain \\u001b[ and contains >All notes, " home" and ·Untagged.', async () => {
    inkChalk.level = 0;
    const { lastFrame } = render(
      <TagPane tags={['home']} selectedIndex={0} focused={false} width={20} height={5} />,
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('\u001b[');
    expect(frame).toContain('>All notes');
    expect(frame).toContain(' home');
    expect(frame).toContain('·Untagged');
  });
});
