import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { editInEditor } from '../../src/core/editor.js';
import { editorFinishHint } from '../../src/core/editor-select.js';

const fixturePath = 'test/fixtures/bin/omawrite';

describe('no-real-editor', () => {
  it("1: WHEN the test reads process.env.SNOTE_EDITOR THEN it ends with test/fixtures/bin/omawrite and that file's mode has the owner execute bit (`& 0o100`).", () => {
    const editor = process.env.SNOTE_EDITOR;
    expect(editor).toBeDefined();
    expect(editor!.replaceAll('\\', '/')).toMatch(/test\/fixtures\/bin\/omawrite$/);
    const mode = statSync(path.resolve(fixturePath)).mode;
    expect(mode & 0o100).toBe(0o100);
  });

  it('2: WHEN editInEditor(\'hello\') is called with no editor option THEN it resolves to `null` within `2000` ms.', async () => {
    const start = Date.now();
    await expect(editInEditor('hello')).resolves.toBeNull();
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('3: WHEN editorFinishHint(process.env.SNOTE_EDITOR) is called THEN it returns `save with Ctrl+S and close the window to return`.', () => {
    expect(editorFinishHint(process.env.SNOTE_EDITOR as string)).toBe(
      'save with Ctrl+S and close the window to return',
    );
  });

  it("4: WHEN test/tui/golden.test.tsx is read as text THEN every stdin.write('n') is preceded (within the previous 3 lines) by `vi.waitFor(`.", () => {
    const lines = readFileSync('test/tui/golden.test.tsx', 'utf8').split('\n');
    const hits = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes("stdin.write('n')"));
    expect(hits.length).toBeGreaterThan(0);
    for (const { i } of hits) {
      const window = lines.slice(Math.max(0, i - 3), i);
      expect(window.some((l) => l.includes('vi.waitFor('))).toBe(true);
    }
  });
});
