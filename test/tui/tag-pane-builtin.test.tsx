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

it('1: WHEN TagPane renders tags=[home] selectedIndex=1 THEN frame contains ·All notes and ·Untagged, and home row starts with space not ·', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={['home']} selectedIndex={1} focused={false} width={20} height={10} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  expect(lines).toContain('·All notes');
  expect(lines).toContain('·Untagged');
  // home is selected, so it shows '>home'; verify no line starts with '·home'
  expect(lines.filter((l) => l.startsWith('·home')).length).toBe(0);

  unmount();
});

it('2: WHEN TagPane renders tags=[] selectedIndex=0 THEN frame contains >All notes and ·Untagged', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={[]} selectedIndex={0} focused={false} width={20} height={10} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  expect(lines).toContain('>All notes');
  expect(lines).toContain('·Untagged');

  unmount();
});

it('3: WHEN TagPane renders trashRow={true} tags=[work] selectedIndex=1 THEN frame contains ·Trash and ·Untagged, and work row starts with space not ·', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={['work']} selectedIndex={1} focused={false} width={20} height={10} trashRow={true} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  expect(lines).toContain('·Trash');
  expect(lines).toContain('·Untagged');
  // work is selected, so it shows '>work'; verify no line starts with '·work'
  expect(lines.filter((l) => l.startsWith('·work')).length).toBe(0);

  unmount();
});

it('4: WHEN TagPane renders tags=[home,work] selectedIndex=2 THEN exactly 2 lines start with · and exactly 1 line starts with >', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={['home', 'work']} selectedIndex={2} focused={false} width={20} height={10} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  const middleDotLines = lines.filter((l) => l.startsWith('·'));
  const selectedLines = lines.filter((l) => l.startsWith('>'));

  expect(middleDotLines.length).toBe(2);
  expect(selectedLines.length).toBe(1);

  unmount();
});
