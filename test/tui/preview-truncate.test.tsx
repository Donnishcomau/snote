import { readFileSync } from 'node:fs';
import { render } from 'ink-testing-library';

import Preview from '../../src/tui/Preview';

function seedNote(content: string): never {
  return {
    content,
    systemTags: [],
    tags: [],
    deleted: false,
    creationDate: 1,
    modificationDate: 1,
    publishURL: '',
    shareURL: '',
  } as never;
}

function getFrameText(frame: any): string {
  return JSON.stringify(frame);
}

describe('Preview truncation with ".."', () => {
  // max = colWidth = 35 with width={60}: lines of exactly max chars stay, longer get '..'
  const max = 35;
  const note = seedNote(
    [
      'Title',
      '0123456789'.repeat(10),
      'x'.repeat(35),
      'y'.repeat(36),
      'short',
    ].join('\n'),
  );

  it('1: WHEN the note is rendered THEN the frame contains the line "012345678901234567890123456789012" and does not contain ".."', async () => {
    const { lastFrame } = render(
      <Preview note={note} width={60} height={10} />,
    );
    await new Promise((r) => setTimeout(r, 0));
    const frame = lastFrame();
    const text = getFrameText(frame);
    expect(text).toContain('0123456789'.repeat(10).slice(0, 35));
    expect(text).not.toContain('..');
  });

  it('2: WHEN the note is rendered THEN the frame contains "x".repeat(max) unchanged and does not contain "x".repeat(max - 2) + ".."', async () => {
    const { lastFrame } = render(
      <Preview note={note} width={60} height={10} />,
    );
    await new Promise((r) => setTimeout(r, 0));
    const frame = lastFrame();
    const text = getFrameText(frame);
    expect(text).toContain('x'.repeat(max));
    expect(text).not.toContain('x'.repeat(max - 2) + '..');
  });

  it('3: WHEN the note is rendered THEN the 36 y characters are shown as "y".repeat(35) and the frame does not contain "y".repeat(36)', async () => {
    const { lastFrame } = render(
      <Preview note={note} width={60} height={10} />,
    );
    await new Promise((r) => setTimeout(r, 0));
    const frame = lastFrame();
    const text = getFrameText(frame);
    expect(text).toContain('y'.repeat(35));
    expect(text).not.toContain('y'.repeat(36));
  });

  it('4: WHEN the note is rendered with enough height THEN the frame contains "Preview: Title" and the wrapped line "012345678901234567890123456789"', async () => {
    const { lastFrame } = render(
      <Preview note={note} width={60} height={12} />,
    );
    await new Promise((r) => setTimeout(r, 0));
    const frame = lastFrame();
    const text = getFrameText(frame);
    expect(text).toContain('Preview: Title');
    expect(text).toContain('012345678901234567890123456789');
  });

  it('5: WHEN note is null THEN the frame contains "Select a note to preview" and does not contain ".."', async () => {
    const { lastFrame } = render(
      <Preview note={null} width={60} height={10} />,
    );
    await new Promise((r) => setTimeout(r, 0));
    const frame = lastFrame();
    const text = getFrameText(frame);
    expect(text).toContain('Select a note to preview');
    expect(text).not.toContain('..');
  });

  it("6: WHEN src/tui/Preview.tsx is read THEN it contains wrap=\"truncate\" exactly 1 time and '..' 0 times", async () => {
    const source = readFileSync(
      new URL('../../src/tui/Preview.tsx', import.meta.url),
      'utf-8',
    );
    const truncateCount = (source.match(/wrap="truncate"/g) || []).length;
    const dotdotCount = (source.match(/'\.\.'/g) || []).length;
    expect(truncateCount).toBe(1);
    expect(dotdotCount).toBe(0);
  });
});
