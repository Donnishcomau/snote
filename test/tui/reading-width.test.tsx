import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { previewColWidth, Preview } from '../../src/tui/Preview';
import { listColWidth, NoteList } from '../../src/tui/NoteList';
import { TagPane } from '../../src/tui/TagPane';
import { makeNote } from './fixtures';

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('T266 reading-width: cap preview and list column widths', () => {
  it('1: WHEN previewColWidth(312) is called THEN it returns 100, and src/tui/Preview.tsx contains the exact substring Math.min(Math.floor(width * 0.6) - 1, 100) exactly once', () => {
    expect(previewColWidth(312)).toBe(100);
    const content = read('src/tui/Preview.tsx');
    const matches = content.match(/Math\.min\(Math\.floor\(width \* 0\.6\) - 1, 100\)/g);
    expect(matches).toHaveLength(1);
  });

  it('2: WHEN previewColWidth(80) is called THEN it returns 47, unchanged from today', () => {
    expect(previewColWidth(80)).toBe(47);
  });

  it('3: WHEN listColWidth(312) is called THEN it returns 60, and src/tui/NoteList.tsx contains the exact substring Math.min(Math.floor(width * 0.4), 60) exactly once', () => {
    expect(listColWidth(312)).toBe(60);
    const content = read('src/tui/NoteList.tsx');
    const matches = content.match(/Math\.min\(Math\.floor\(width \* 0\.4\), 60\)/g);
    expect(matches).toHaveLength(1);
  });

  it('4: WHEN listColWidth(60) is called THEN it returns 24, unchanged from today', () => {
    expect(listColWidth(60)).toBe(24);
  });

  it('5: WHEN src/tui/MainPanes.tsx is read THEN it contains the exact substring height={height - 4} exactly once; WHEN TagPane and Preview are each rendered THEN both frames have exactly 20 lines containing |', async () => {
    const mainPanes = read('src/tui/MainPanes.tsx');
    const matches = mainPanes.match(/height=\{height - 4\}/g);
    expect(matches).toHaveLength(1);

    const { lastFrame: lastFramePreview } = render(
      <Preview note={makeNote('p', 'Title\nbody')} width={66} height={22} />
    );
    await delay(0);

    const framePreview = lastFramePreview() ?? '';
    const framePreviewStr = typeof framePreview === 'string' ? framePreview : '';
    const previewLinesWithDivider = framePreviewStr.split('\n').filter(l => l.includes('│')).length;
    expect(previewLinesWithDivider).toBe(20);

    const { lastFrame: lastFrameTagPane } = render(
      <TagPane tags={['home']} selectedIndex={0} focused={false} width={14} height={20} trashRow divider />
    );
    await delay(0);

    const frameTagPane = lastFrameTagPane() ?? '';
    const frameTagPaneStr = typeof frameTagPane === 'string' ? frameTagPane : '';
    const tagPaneLinesWithDivider = frameTagPaneStr.split('\n').filter(l => l.includes('│')).length;
    expect(tagPaneLinesWithDivider).toBe(20);
  });

  it('6: WHEN <NoteList notes={[makeNote("n", "Title\\n" + "x".repeat(300))]} selectedIndex={0} width={60} height={26} /> is rendered THEN the frame contains a preview line of exactly 22 x characters (listColWidth(60) - 2 = 22, note-row.ts width - 2 truncation budget)', async () => {
    const { lastFrame } = render(
      <NoteList
        notes={[makeNote('n', 'Title\n' + 'x'.repeat(300))]}
        selectedIndex={0}
        width={60}
        height={26}
      />
    );
    await delay(0);
    const frame = lastFrame() ?? '';
    const frameStr = typeof frame === 'string' ? frame : '';
    // note-row.ts uses width - 2 for the truncation budget
    const previewLineMatch = frameStr.match(/^( {2})((x){22})( |\n|$)/m);
    expect(previewLineMatch).not.toBeNull();
  });
});
