/**
 * Help overlay: labelled sections, multi-column, and an Editing line (T262).
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/Help';
import { SECTIONS } from '../../src/core/help-sections';
import { keymap } from '../../src/core/keymap';

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('help sections layout', () => {
  it('1: WHEN <Help width={80} height={30} /> is rendered THEN the frame contains Navigate, Notes, Tags, Trash, Sync & Sort, App, and the index of Navigate is before the index of Notes, which is before the index of Tags, which is before Trash, before Sync & Sort, before App', async () => {
    const { frames, unmount } = render(
      <Help width={80} height={30} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));
    const joined = lines.join('\n');

    const sectionNames = ['Navigate', 'Notes', 'Tags', 'Trash', 'Sync & Sort', 'App'];
    sectionNames.forEach((name) => {
      expect(joined).toContain(name);
    });

    const indices = sectionNames.map((name) => joined.indexOf(name));
    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeLessThan(indices[i + 1]);
    }

    unmount();
  });

  it('2: WHEN <Help width={120} height={30} /> is rendered THEN the frame contains both Navigate and Trash, and no rendered line is longer than 120 characters', async () => {
    const { frames, unmount } = render(
      <Help width={120} height={30} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));
    const joined = lines.join('\n');

    expect(joined).toContain('Navigate');
    expect(joined).toContain('Trash');

    lines.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(120);
    });

    unmount();
  });

  it('3: WHEN <Help width={80} height={30} editor="omawrite" /> is rendered THEN the frame contains Editing: save with Ctrl+S and close the window to return', async () => {
    const { frames, unmount } = render(
      <Help width={80} height={30} editor="omawrite" />,
    );
    await new Promise((r) => setTimeout(r, 50));
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));
    const joined = lines.join('\n');

    expect(joined).toContain('Editing: save with Ctrl+S and close the window to return');

    unmount();
  });

  // editor defaults to 'nvim' when no editor prop is passed
  it('4: WHEN <Help width={80} height={30} /> is rendered with no editor prop THEN the frame contains Editing: Esc then :wq to save and return', async () => {
    const { frames, unmount } = render(
      <Help width={80} height={30} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));
    const joined = lines.join('\n');

    expect(joined).toContain('Editing: Esc then :wq to save and return');

    unmount();
  });

  it('5: WHEN <Help width={80} height={30} entries={[{ key: "z", action: "zzz", description: "Zzz thing" }]} /> is rendered THEN the frame contains Zzz thing and does not contain Navigate, Tags, Trash, or Editing:', async () => {
    const { frames, unmount } = render(
      <Help width={80} height={30} entries={[{ key: 'z', action: 'zzz', description: 'Zzz thing' }]} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    const lines = frames.map(stripAnsi).flatMap((s) => s.split('\n'));
    const joined = lines.join('\n');

    expect(joined).toContain('Zzz thing');
    expect(joined).not.toContain('Navigate');
    expect(joined).not.toContain('Tags');
    expect(joined).not.toContain('Trash');
    expect(joined).not.toContain('Editing:');

    unmount();
  });
});

describe('SECTIONS completeness', () => {
  it('6: WHEN src/core/help-sections.ts\'s SECTIONS is flattened to its actions arrays and compared against keymap.map(e => e.action) from src/core/keymap.ts THEN every keymap action appears in exactly one section, the six sections\' lengths are [8, 10, 6, 5, 5, 2], and the flattened total length is 36', () => {
    // T315.2: edit_note_inline joined the Notes section, growing it from 9 to 10.
    const expectedLengths = [8, 10, 6, 5, 5, 2];
    expect(SECTIONS.length).toBe(6);
    expect(SECTIONS.map((s) => s.actions.length)).toEqual(expectedLengths);

    const flattened: string[] = [];
    for (const section of SECTIONS) {
      for (const action of section.actions) {
        flattened.push(action);
      }
    }
    expect(flattened.length).toBe(36);

    const keymapActions = keymap.map((e) => e.action);
    keymapActions.forEach((action) => {
      expect(flattened).toContain(action);
    });

    // No duplicates in flattened
    expect(new Set(flattened).size).toBe(flattened.length);
  });
});
