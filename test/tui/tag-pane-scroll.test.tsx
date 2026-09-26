import { render } from 'ink-testing-library';
import React from 'react';
import { expect, it } from 'vitest';

import { TagPane } from '../../src/tui/TagPane';

function getLines(frame: string | undefined) {
  return (frame ?? '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}

const tags = Array.from({ length: 20 }, (_, i) => `tag${String(i + 1).padStart(2, '0')}`);

it('1: WHEN TagPane renders tags at height=24 selectedIndex=0 THEN frame contains tag01 and Untagged and no more', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={tags} selectedIndex={0} focused={false} width={20} height={24} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const frame = lastFrame() ?? '';
  const lines = getLines(frame);

  expect(frame.includes('more')).toBe(false);
  expect(lines.some((l) => l.includes('tag01'))).toBe(true);
  expect(lines.some((l) => l.includes('Untagged'))).toBe(true);

  unmount();
});

it('2: WHEN TagPane renders tags at height=11 selectedIndex=0 THEN 11 lines, last line is "… 12 more", first line after Tags is ">All notes"', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={tags} selectedIndex={0} focused={false} width={20} height={11} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  expect(lines.length).toBe(11);
  // indicator rows keep the marker column as a non-breaking space so the row is never dropped
  expect(lines[lines.length - 1]).toBe('\u00a0… 12 more');
  expect(lines[1]).toBe('>All notes');

  unmount();
});

it('3: WHEN TagPane renders tags at height=11 selectedIndex=21 THEN 7 lines, first line after Tags is "… 16 more", last line is ">Untagged"', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={tags} selectedIndex={21} focused={false} width={20} height={11} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  expect(lines.length).toBe(7);
  // indicator rows keep the marker column as a non-breaking space so the row is never dropped
  expect(lines[1]).toBe('\u00a0… 16 more');
  expect(lines[lines.length - 1]).toBe('>Untagged');

  unmount();
});

it('4: WHEN TagPane renders tags at height=11 selectedIndex=10 THEN first line after Tags is "… 5 more", last line is "… 7 more", contains ">tag10" and exactly 1 line starting with ">"', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={tags} selectedIndex={10} focused={false} width={20} height={11} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  expect(lines[1]).toBe('\u00a0… 5 more');
  expect(lines[lines.length - 1]).toBe('\u00a0… 7 more');
  expect(lines.some((l) => l.startsWith('>tag10'))).toBe(true);
  expect(lines.filter((l) => l.startsWith('>')).length).toBe(1);

  unmount();
});

it('5: WHEN TagPane renders tags at height=11 selectedIndex=10 width=6 THEN frame contains "… 5" and does not contain "more"', async () => {
  // the indicator is truncated to width - 2 like any row
  const { lastFrame, unmount } = render(
    <TagPane tags={tags} selectedIndex={10} focused={false} width={6} height={11} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const frame = (lastFrame() ?? '').replace(/\x1b\[[0-9;]*m/g, '');

  expect(frame.includes('… 5')).toBe(true);
  expect(frame.includes('more')).toBe(false);

  unmount();
});
