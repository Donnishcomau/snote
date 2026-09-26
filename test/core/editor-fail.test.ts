import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { editInEditor } from '../../src/core/editor.js';

const FAKE_EDITOR = 'node test/fixtures/fake-editor.mjs';

describe('editInEditor failure cases', () => {
  it('1: WHEN editInEditor fails with a non-existent editor THEN it rejects with an Error whose message is editor failed: ENOENT', async () => {
    await expect(
      editInEditor('hello', { editor: 'snote-no-such-editor-xyz' }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      editInEditor('hello', { editor: 'snote-no-such-editor-xyz' }),
    ).rejects.toThrow('editor failed: ENOENT');
  });

  it('2: WHEN editInEditor fails with a command that exits non-zero THEN it rejects with an Error whose message is editor failed: exit 1', async () => {
    await expect(
      editInEditor('hello', { editor: 'false' }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      editInEditor('hello', { editor: 'false' }),
    ).rejects.toThrow('editor failed: exit 1');
  });

  it('3: WHEN both failing calls have finished THEN no snote- directories leak', async () => {
    const own = mkdtempSync(join(tmpdir(), 'editor-fail-test-'));
    const old = process.env.TMPDIR;
    process.env.TMPDIR = own;
    try {
      const before = readdirSync(own).filter((n) => n.startsWith('snote-'));
      try {
        await editInEditor('hello', { editor: 'snote-no-such-editor-xyz' });
      } catch {
        // expected failure
      }
      try {
        await editInEditor('hello', { editor: 'false' });
      } catch {
        // expected failure
      }
      const after = readdirSync(own).filter((n) => n.startsWith('snote-'));
      expect(after).toEqual(before);
    } finally {
      if (old === undefined) {
        delete process.env.TMPDIR;
      } else {
        process.env.TMPDIR = old;
      }
      rmSync(own, { recursive: true, force: true });
    }
  });

  it('4: WHEN a failing call is followed by a good call THEN the good call still resolves correctly', async () => {
    try {
      await editInEditor('hello', { editor: 'snote-no-such-editor-xyz' });
    } catch {
      // expected failure
    }
    try {
      await editInEditor('hello', { editor: 'false' });
    } catch {
      // expected failure
    }
    const result = await editInEditor('hello', { editor: FAKE_EDITOR });
    expect(result).not.toBeNull();
    expect(result).toContain('hello');
    expect(result).toContain('EDITED');
  });
});
