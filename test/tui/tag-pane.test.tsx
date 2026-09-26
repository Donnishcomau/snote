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

it('1: WHEN TagPane tags=[home, work] selectedIndex=2 focused=true width=20 height=10 THEN lines are exact', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={['home', 'work']} selectedIndex={2} focused={true} width={20} height={10} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  expect(lines).toEqual(['Tags', '·All notes', ' home', '>work', '·Untagged']);

  unmount();
});

it('2: WHEN tags=[] and selectedIndex=0 THEN lines are Tags, >All notes,  Untagged', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={[]} selectedIndex={0} focused={false} width={20} height={10} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  expect(lines).toEqual(['Tags', '>All notes', '·Untagged']);

  unmount();
});

it('3: WHEN tags=[home, work] selectedIndex=3 THEN lines contain >Untagged and  work, no other >', async () => {
  const { lastFrame, unmount } = render(
    <TagPane tags={['home', 'work']} selectedIndex={3} focused={false} width={20} height={10} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  const hasUntaggedSelected = lines.some((l) => l.startsWith('>Untagged'));
  const hasWork = lines.some((l) => l.startsWith(' work'));
  const otherSelected = lines.filter((l) => l.startsWith('>'));

  expect(hasUntaggedSelected).toBe(true);
  expect(hasWork).toBe(true);
  expect(otherSelected.length).toBe(1);

  unmount();
});

it('4: WHEN tags=tag0..tag29, height=10, selectedIndex=25 THEN exactly 10 lines with >tag24, tag20, tag28, no tag19, tag29', async () => {
  const { lastFrame, unmount } = render(
    <TagPane
      tags={Array.from({ length: 30 }, (_, i) => `tag${i}`)}
      selectedIndex={25}
      focused={false}
      width={20}
      height={10}
    />
  );

  await new Promise((r) => setTimeout(r, 50));

  const lines = getLines(lastFrame());

  expect(lines.length).toBe(10);
  const hasTag24Selected = lines.some((l) => l.startsWith('>tag24'));
  const hasTag20 = lines.some((l) => l.startsWith(' tag20'));
  const hasTag28 = lines.some((l) => l.startsWith(' tag28'));
  const hasTag19 = lines.some((l) => l.includes('tag19'));
  const hasTag29 = lines.some((l) => l.includes('tag29'));
  const hasMoreAbove = lines.some((l) => l.startsWith('\u00a0… 21 more'));
  const hasMoreBelow = lines.some((l) => l.startsWith('\u00a0… 2 more'));

  expect(hasTag24Selected).toBe(true);
  expect(hasMoreAbove).toBe(true);
  expect(hasMoreBelow).toBe(true);
  expect(hasTag20).toBe(false);
  expect(hasTag28).toBe(false);
  expect(hasTag19).toBe(false);
  expect(hasTag29).toBe(false);

  unmount();
});

it('5: WHEN tags=[averyveryverylongtagname] width=20 THEN contains averyveryverylongt and not averyveryverylongta', async () => {
  const { lastFrame, unmount } = render(
    <TagPane
      tags={['averyveryverylongtagname']}
      selectedIndex={0}
      focused={false}
      width={20}
      height={10}
    />
  );

  await new Promise((r) => setTimeout(r, 50));

  const frame = lastFrame() ?? '';

  expect(frame).toContain('averyveryverylongt');
  expect(frame).not.toContain('averyveryverylongta');

  unmount();
});

it('6: WHEN focused=true vs focused=false THEN same 5 lines after ANSI removal', async () => {
  const resultFocused = render(
    <TagPane tags={['home', 'work']} selectedIndex={2} focused={true} width={20} height={10} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const resultNotFocused = render(
    <TagPane tags={['home', 'work']} selectedIndex={2} focused={false} width={20} height={10} />
  );

  await new Promise((r) => setTimeout(r, 50));

  const frameFocused = (resultFocused.lastFrame() ?? '').replace(/\x1b\[[0-9;]*m/g, '');
  const frameNotFocused = (resultNotFocused.lastFrame() ?? '').replace(/\x1b\[[0-9;]*m/g, '');

  const linesFocused = getLines(frameFocused);
  const linesNotFocused = getLines(frameNotFocused);

  expect(linesFocused).toEqual(linesNotFocused);
  expect(linesFocused.length).toBe(5);

  resultFocused.unmount();
  resultNotFocused.unmount();
});
