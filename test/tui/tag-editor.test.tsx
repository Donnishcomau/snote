import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { TagEditor } from '../../src/tui/TagEditor';

describe('T23 TagEditor component', () => {
  const allTags = ['home', 'work', 'Web'];
  const tags = ['home'];

  it('1: WHEN the component is rendered THEN the frame contains tags: [home] +; WHEN it is rendered with tags=[] THEN the frame contains tags: + and no [', async () => {
    const { lastFrame, unmount } = render(
      <TagEditor tags={tags} allTags={allTags} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />
    );

    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    const frameStr = JSON.stringify(frame);
    expect(frameStr).toContain('tags:');
    expect(frameStr).toContain('[home]');
    expect(frameStr).toContain('+');

    unmount();

    const { lastFrame: lastFrame2 } = render(
      <TagEditor tags={[]} allTags={allTags} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />
    );

    await new Promise(r => setTimeout(r, 50));

    const frame2 = lastFrame2();
    const frame2Str = JSON.stringify(frame2);
    expect(frame2Str).toContain('tags:');
    expect(frame2Str).toContain('+');
    expect(frame2Str).not.toContain('[');

    unmount();
  });

  it('2: WHEN stdin.write(wo) THEN the frame contains + work; WHEN we is written instead THEN the frame contains + web; no callback was called', async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <TagEditor tags={tags} allTags={allTags} onAdd={onAdd} onRemove={onRemove} onClose={onClose} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin.write('wo');
    await new Promise(r => setTimeout(r, 0));

    const frame = lastFrame();
    const frameStr = JSON.stringify(frame);
    expect(frameStr).toContain('+ work');
    expect(onAdd).not.toHaveBeenCalled();

    unmount();

    const { stdin: stdin2, lastFrame: lastFrame2 } = render(
      <TagEditor tags={tags} allTags={allTags} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin2.write('we');
    await new Promise(r => setTimeout(r, 0));

    const frame2 = lastFrame2();
    const frame2Str = JSON.stringify(frame2);
    expect(frame2Str).toContain('+ web');

    unmount();
  });

  it('3: WHEN stdin.write(wo), tab, return are sent in that order THEN onAdd was called exactly once with work, onRemove and onClose 0 times, and the frame no longer contains wo', async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <TagEditor tags={tags} allTags={allTags} onAdd={onAdd} onRemove={onRemove} onClose={onClose} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin.write('wo');
    await new Promise(r => setTimeout(r, 0));

    // Tab to accept suggestion (should make text "work")
    stdin.write('\t');
    await new Promise(r => setTimeout(r, 0));

    // Return to add tag
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 0));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('work');
    expect(onRemove).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    const frame = lastFrame();
    const frameStr = JSON.stringify(frame);
    expect(frameStr).not.toContain('wo');

    unmount();
  });

  it('4: WHEN stdin.write(HOME) then return THEN onAdd was called 0 times and the frame no longer contains HOME', async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <TagEditor tags={tags} allTags={allTags} onAdd={onAdd} onRemove={onRemove} onClose={onClose} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin.write('HOME');
    await new Promise(r => setTimeout(r, 0));

    stdin.write('\r');
    await new Promise(r => setTimeout(r, 0));

    expect(onAdd).not.toHaveBeenCalled();

    const frame = lastFrame();
    const frameStr = JSON.stringify(frame);
    expect(frameStr).not.toContain('HOME');

    unmount();
  });

  it('5: WHEN zz then backspace are sent THEN the frame contains + z, does not contain zz, and onRemove was called 0 times; WHEN backspace is sent with nothing typed THEN onRemove was called exactly once with home', async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <TagEditor tags={tags} allTags={allTags} onAdd={onAdd} onRemove={onRemove} onClose={onClose} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin.write('zz');
    await new Promise(r => setTimeout(r, 0));

    stdin.write('\x7f');
    await new Promise(r => setTimeout(r, 0));

    const frame1 = lastFrame();
    const frame1Str = JSON.stringify(frame1);
    expect(frame1Str).toContain('+ z');
    expect(frame1Str).not.toContain('zz');
    expect(onRemove).not.toHaveBeenCalled();

    unmount();

    // Second part: backspace with nothing typed should remove last tag
    const { stdin: stdin2, lastFrame: lastFrame2, unmount: unmount2 } = render(
      <TagEditor tags={tags} allTags={allTags} onAdd={vi.fn()} onRemove={onRemove} onClose={vi.fn()} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin2.write('\x7f');
    await new Promise(r => setTimeout(r, 0));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('home');

    unmount2();
  });

  it('6: WHEN wo then escape are sent and 50 ms have passed THEN onClose was called exactly once and onAdd and onRemove 0 times', async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <TagEditor tags={tags} allTags={allTags} onAdd={onAdd} onRemove={onRemove} onClose={onClose} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin.write('wo');
    await new Promise(r => setTimeout(r, 0));

    stdin.write('\u001b');
    await new Promise(r => setTimeout(r, 50));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();

    unmount();
  });
});
