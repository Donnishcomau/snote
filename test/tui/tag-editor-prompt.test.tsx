import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { TagEditor } from '../../src/tui/TagEditor';

describe('T251 TagEditor prompt hint', () => {
  it('1: WHEN <TagEditor tags={[]} allTags={[\'home\',\'work\']} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} /> is rendered THEN lastFrame() is exactly tags: + type to add', async () => {
    const { lastFrame, unmount } = render(
      <TagEditor tags={[]} allTags={['home', 'work']} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />
    );

    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toBe('tags: + type to add');

    unmount();
  });

  it('2: WHEN <TagEditor tags={[\'home\']} allTags={[\'home\',\'work\']} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} /> is rendered THEN lastFrame() is exactly tags: [home] + type to add', async () => {
    const { lastFrame, unmount } = render(
      <TagEditor tags={['home']} allTags={['home', 'work']} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />
    );

    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toBe('tags: [home] + type to add');

    unmount();
  });

  it('3: WHEN the same component as line 2 has stdin.write(\'wo\') sent (matching the work suggestion) THEN lastFrame() is exactly tags: [home] + work, identical to before this task', async () => {
    const { stdin, lastFrame, unmount } = render(
      <TagEditor tags={['home']} allTags={['home', 'work']} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin.write('wo');
    await new Promise(r => setTimeout(r, 0));

    const frame = lastFrame();
    expect(frame).toBe('tags: [home] + work');

    unmount();
  });

  it('4: WHEN <TagEditor tags={[\'e2etag\']} allTags={[\'e2etag\']} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} /> is rendered THEN lastFrame() is exactly tags: [e2etag] + type to add', async () => {
    const { lastFrame, unmount } = render(
      <TagEditor tags={['e2etag']} allTags={['e2etag']} onAdd={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />
    );

    await new Promise(r => setTimeout(r, 50));

    const frame = lastFrame();
    expect(frame).toBe('tags: [e2etag] + type to add');

    unmount();
  });

  it('5: WHEN src/tui/TagEditor.tsx is read as text THEN it contains \'+ type to add\' exactly 1 time', async () => {
    import('../../src/tui/TagEditor').then((mod) => {
      // We use fs to read the file as text
    });

    const fs = await import('fs');
    const content = fs.readFileSync('src/tui/TagEditor.tsx', 'utf-8');
    const matches = content.match(/\+ type to add/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('6: WHEN <TagEditor tags={[\'home\']} allTags={[\'home\',\'work\']} onAdd={onAdd} onRemove={vi.fn()} onClose={vi.fn()} /> (onAdd a vi.fn()) has stdin.write(\'wo\'), then Tab, then \\r sent THEN onAdd was called exactly once with work, and lastFrame() again contains + type to add (the hint reappears once the input resets to empty)', async () => {
    const onAdd = vi.fn();
    const { stdin, lastFrame, unmount } = render(
      <TagEditor tags={['home']} allTags={['home', 'work']} onAdd={onAdd} onRemove={vi.fn()} onClose={vi.fn()} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin.write('wo');
    await new Promise(r => setTimeout(r, 0));

    stdin.write('\t');
    await new Promise(r => setTimeout(r, 0));

    stdin.write('\r');
    await new Promise(r => setTimeout(r, 0));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('work');

    const frame = lastFrame();
    expect(frame).toContain('+ type to add');

    unmount();
  });
});
