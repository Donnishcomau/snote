import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { join, basename, dirname, sep } from 'node:path';

import { editInEditor } from '../../src/core/editor.js';

// A fake editor script: records its last argument (the file to edit) into
// FAKE_ARG_LOG, then leaves the file untouched so editInEditor returns null.
const RECORDER_BODY = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_ARG_LOG, args[args.length - 1] + '\\n', 'utf-8');
`;

const savedEnv = {
  PATH: process.env.PATH,
  SNOTE_EDITOR_DIRECT: process.env.SNOTE_EDITOR_DIRECT,
  FAKE_ARG_LOG: process.env.FAKE_ARG_LOG,
};

function restoreEnv(): void {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else process.env[k] = v;
  }
}

describe('editInEditor temp file named after the note', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    restoreEnv();
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  // Sets up a recording fake editor on a temp PATH and an argument log,
  // runs editInEditor(content, ...) and returns the recorded file path.
  async function recordedPath(content: string): Promise<string> {
    const bin = mkdtempSync(join(tmpdir(), 'editor-filename-bin-'));
    tmpDirs.push(bin);
    const fake = join(bin, 'fake');
    writeFileSync(fake, RECORDER_BODY, 'utf-8');
    chmodSync(fake, 0o755);

    const logDir = mkdtempSync(join(tmpdir(), 'editor-filename-log-'));
    tmpDirs.push(logDir);
    const logFile = join(logDir, 'args.log');
    writeFileSync(logFile, '', 'utf-8');

    process.env.PATH = bin + ':' + process.env.PATH;
    process.env.SNOTE_EDITOR_DIRECT = '1';
    process.env.FAKE_ARG_LOG = logFile;

    await editInEditor(content, { editor: fake });

    const logged = readFileSync(logFile, 'utf-8').trim();
    const path = logged.split('\n').at(-1) as string;
    // the private temp directory editInEditor made is removed afterwards
    expect(path.startsWith(join(tmpdir(), 'snote-'))).toBe(true);
    return path;
  }

  it("1: WHEN editInEditor('Brand new!\\n\\nbody', { editor: '<tmp>/fake' }) runs with a fake editor that records its last argument THEN that path's file name is `Brand new!.md`", async () => {
    const path = await recordedPath('Brand new!\n\nbody');
    expect(basename(path)).toBe('Brand new!.md');
  });

  it("2: WHEN editInEditor('# Shopping list\\nmilk', ...) runs THEN the file name is `Shopping list.md`", async () => {
    const path = await recordedPath('# Shopping list\nmilk');
    expect(basename(path)).toBe('Shopping list.md');
  });

  it("3: WHEN editInEditor('', ...) runs THEN the file name is `untitled.md`", async () => {
    const path = await recordedPath('');
    expect(basename(path)).toBe('untitled.md');
  });

  it("4: WHEN editInEditor('a/b:c\\nx', ...) runs THEN the file name is `abc.md` and the file sits directly inside a directory whose name starts with `snote-`", async () => {
    const path = await recordedPath('a/b:c\nx');
    expect(basename(path)).toBe('abc.md');
    // the file sits directly inside a directory whose name starts with `snote-`
    expect(basename(dirname(path))).toMatch(/^snote-/);
    // and directly: no deeper nesting below that directory
    expect(path.split(sep)).toHaveLength(dirname(path).split(sep).length + 1);
  });
});
