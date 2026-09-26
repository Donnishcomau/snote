import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { editInEditor } from '../../src/core/editor.js';

const FAKE_EDITOR = 'node test/fixtures/fake-editor.mjs';

describe('editInEditor', () => {
  it("WHEN editInEditor('hello') runs with a fake editor THEN the result contains 'hello' and 'EDITED'", async () => {
    const result = await editInEditor('hello', { editor: FAKE_EDITOR });
    expect(result).not.toBeNull();
    expect(result).toContain('hello');
    expect(result).toContain('EDITED');
  });

  it('WHEN the same runs with FAKE_NOOP=1 THEN the result is null', async () => {
    process.env.FAKE_NOOP = '1';
    try {
      const result = await editInEditor('hello', { editor: FAKE_EDITOR });
      expect(result).toBeNull();
    } finally {
      delete process.env.FAKE_NOOP;
    }
  });

  it('WHEN the call has finished THEN no snote- directory created by it remains in os.tmpdir()', async () => {
    const own = mkdtempSync(join(tmpdir(), 'editor-test-'));
    const old = process.env.TMPDIR;
    process.env.TMPDIR = own;
    try {
      const result = await editInEditor('hello', { editor: FAKE_EDITOR });
      expect(result).toContain('EDITED');
      expect(readdirSync(own)).toEqual([]);
    } finally {
      if (old === undefined) {
        delete process.env.TMPDIR;
      } else {
        process.env.TMPDIR = old;
      }
      rmSync(own, { recursive: true, force: true });
    }
  });
});
