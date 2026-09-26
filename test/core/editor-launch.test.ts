import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, delimiter } from 'node:path';

import { editInEditor } from '../../src/core/editor.js';
import { selectEditor } from '../../src/core/editor-select.js';

// A fake editor script: edits the file given as its last argument by
// appending "EDITED", unless FAKE_EXIT_CODE is set, in which case it exits
// with that code without touching the file.
const FAKE_EDITOR_BODY = `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const filePath = args[args.length - 1];
if (process.env.FAKE_EXIT_CODE) {
  process.exit(Number(process.env.FAKE_EXIT_CODE));
}
const content = readFileSync(filePath, 'utf-8');
writeFileSync(filePath, content + '\\nEDITED', 'utf-8');
`;

// A fake uwsm: records its full argv (space-joined) as one line in
// FAKE_UWSM_LOG, then runs the command after "--" so the underlying fake
// editor still actually edits the file / still propagates its exit code.
const FAKE_UWSM_BODY = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const argv = process.argv.slice(2);
appendFileSync(process.env.FAKE_UWSM_LOG, argv.join(' ') + '\\n');
const idx = argv.indexOf('--');
const rest = idx >= 0 ? argv.slice(idx + 1) : [];
const [cmd, ...cmdArgs] = rest;
const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`;

function writeScript(path: string, body: string): void {
  writeFileSync(path, body, 'utf-8');
  chmodSync(path, 0o755);
}

const savedEnv = {
  PATH: process.env.PATH,
  SNOTE_EDITOR_DIRECT: process.env.SNOTE_EDITOR_DIRECT,
  FAKE_UWSM_LOG: process.env.FAKE_UWSM_LOG,
  FAKE_EXIT_CODE: process.env.FAKE_EXIT_CODE,
};

function restoreEnv(): void {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else process.env[k] = v;
  }
}

describe('editInEditor launch routing', () => {
  let tmpDirs: string[] = [];

  afterEach(() => {
    restoreEnv();
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs = [];
  });

  function makeBinDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'editor-launch-bin-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('WHEN a GUI editor runs with fake uwsm on PATH and SNOTE_EDITOR_DIRECT unset THEN the recorded uwsm argv is exactly "app -S both -- <editor> <tmpFile>" and the file gets edited', async () => {
    const bin = makeBinDir();
    const guiEditor = join(bin, 'fake-gui-editor');
    writeScript(guiEditor, FAKE_EDITOR_BODY);
    writeScript(join(bin, 'uwsm'), FAKE_UWSM_BODY);

    const logDir = mkdtempSync(join(tmpdir(), 'editor-launch-log-'));
    tmpDirs.push(logDir);
    const logFile = join(logDir, 'uwsm.log');
    writeFileSync(logFile, '', 'utf-8');

    delete process.env.SNOTE_EDITOR_DIRECT;
    process.env.PATH = bin + delimiter + process.env.PATH;
    process.env.FAKE_UWSM_LOG = logFile;

    const result = await editInEditor('hello', { editor: guiEditor });

    expect(result).toContain('EDITED');
    const logged = readFileSync(logFile, 'utf-8').trim();
    const parts = logged.split(' ');
    expect(parts[0]).toBe('app');
    expect(parts[1]).toBe('-S');
    expect(parts[2]).toBe('both');
    expect(parts[3]).toBe('--');
    expect(parts[4]).toBe(guiEditor);
    expect(parts[5]).toMatch(/hello\.md$/);
    expect(parts).toHaveLength(6);
  });

  it('WHEN a terminal editor (nvim) runs with fake uwsm on PATH THEN it is run directly and the uwsm log stays empty', async () => {
    const bin = makeBinDir();
    const nvim = join(bin, 'nvim');
    writeScript(nvim, FAKE_EDITOR_BODY);
    writeScript(join(bin, 'uwsm'), FAKE_UWSM_BODY);

    const logDir = mkdtempSync(join(tmpdir(), 'editor-launch-log-'));
    tmpDirs.push(logDir);
    const logFile = join(logDir, 'uwsm.log');
    writeFileSync(logFile, '', 'utf-8');

    delete process.env.SNOTE_EDITOR_DIRECT;
    process.env.PATH = bin + delimiter + process.env.PATH;
    process.env.FAKE_UWSM_LOG = logFile;

    const result = await editInEditor('hello', { editor: nvim });

    expect(result).toContain('EDITED');
    expect(readFileSync(logFile, 'utf-8')).toBe('');
  });

  it('WHEN SNOTE_EDITOR_DIRECT=1 THEN a GUI editor is run directly, skipping uwsm even though it is on PATH', async () => {
    const bin = makeBinDir();
    const guiEditor = join(bin, 'fake-gui-editor');
    writeScript(guiEditor, FAKE_EDITOR_BODY);
    writeScript(join(bin, 'uwsm'), FAKE_UWSM_BODY);

    const logDir = mkdtempSync(join(tmpdir(), 'editor-launch-log-'));
    tmpDirs.push(logDir);
    const logFile = join(logDir, 'uwsm.log');
    writeFileSync(logFile, '', 'utf-8');

    process.env.SNOTE_EDITOR_DIRECT = '1';
    process.env.PATH = bin + delimiter + process.env.PATH;
    process.env.FAKE_UWSM_LOG = logFile;

    const result = await editInEditor('hello', { editor: guiEditor });

    expect(result).toContain('EDITED');
    expect(readFileSync(logFile, 'utf-8')).toBe('');
  });

  it('WHEN a non-zero exit happens THEN editInEditor throws with the exit code, for both the terminal-editor path and the GUI/uwsm path', async () => {
    const bin = makeBinDir();
    const nvim = join(bin, 'nvim');
    const guiEditor = join(bin, 'fake-gui-editor');
    writeScript(nvim, FAKE_EDITOR_BODY);
    writeScript(guiEditor, FAKE_EDITOR_BODY);
    writeScript(join(bin, 'uwsm'), FAKE_UWSM_BODY);

    const logDir = mkdtempSync(join(tmpdir(), 'editor-launch-log-'));
    tmpDirs.push(logDir);
    const logFile = join(logDir, 'uwsm.log');
    writeFileSync(logFile, '', 'utf-8');

    process.env.PATH = bin + delimiter + process.env.PATH;
    process.env.FAKE_UWSM_LOG = logFile;
    process.env.FAKE_EXIT_CODE = '3';

    // terminal-editor path: direct spawn, inherited stdio
    delete process.env.SNOTE_EDITOR_DIRECT;
    await expect(editInEditor('hello', { editor: nvim })).rejects.toThrow(/exit 3/);

    // GUI/uwsm path: SNOTE_EDITOR_DIRECT unset so the fake uwsm on PATH is used
    await expect(editInEditor('hello', { editor: guiEditor })).rejects.toThrow(/exit 3/);
  });
});

describe('selectEditor default-editor-file lookup', () => {
  let tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    tmpDirs = [];
  });

  function makeHome(): string {
    const home = mkdtempSync(join(tmpdir(), 'editor-launch-home-'));
    tmpDirs.push(home);
    return home;
  }

  function writeDefaultsFile(home: string, firstLine: string): void {
    const dir = join(home, '.local', 'state', 'omarchy', 'defaults');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'editor'), firstLine + '\n', 'utf-8');
  }

  it('WHEN the omarchy defaults file names a command that IS on PATH THEN selectEditor returns it', () => {
    const home = makeHome();
    const bin = mkdtempSync(join(tmpdir(), 'editor-launch-bin-'));
    tmpDirs.push(bin);
    writeFileSync(join(bin, 'my-default-editor'), '#!/bin/sh\n', 'utf-8');
    chmodSync(join(bin, 'my-default-editor'), 0o755);
    writeDefaultsFile(home, 'my-default-editor');

    const result = selectEditor({ HOME: home, PATH: bin });
    expect(result).toBe('my-default-editor');
    expect(existsSync(join(bin, 'my-default-editor'))).toBe(true);
  });

  it('WHEN the omarchy defaults file names a command NOT on PATH THEN selectEditor falls through to the next option', () => {
    const home = makeHome();
    const bin = mkdtempSync(join(tmpdir(), 'editor-launch-bin-'));
    tmpDirs.push(bin);
    // PATH has nothing on it: neither the defaults-file command nor omawrite
    writeDefaultsFile(home, 'not-on-path-editor');

    const result = selectEditor({ HOME: home, PATH: bin, EDITOR: 'code --wait' });
    expect(result).toBe('code --wait');
  });

  it('WHEN there is no SNOTE_EDITOR and no Omarchy default but nvim is on PATH THEN selectEditor returns "nvim"', () => {
    const bin = mkdtempSync(join(tmpdir(), 'editor-launch-bin-'));
    tmpDirs.push(bin);
    writeFileSync(join(bin, 'nvim'), '#!/bin/sh\n', 'utf-8');
    chmodSync(join(bin, 'nvim'), 0o755);

    const result = selectEditor({ PATH: bin });
    expect(result).toBe('nvim');
  });

  it('WHEN EDITOR is "omarchy-launch-editor --inline" and nvim is not on PATH THEN selectEditor treats it as unset and falls through, e.g. to omawrite on PATH', () => {
    const bin = mkdtempSync(join(tmpdir(), 'editor-launch-bin-'));
    tmpDirs.push(bin);
    writeFileSync(join(bin, 'omawrite'), '#!/bin/sh\n', 'utf-8');
    chmodSync(join(bin, 'omawrite'), 0o755);

    const result = selectEditor({ PATH: bin, EDITOR: 'omarchy-launch-editor --inline' });
    expect(result).toBe('omawrite');
  });

  it('WHEN EDITOR is "omarchy-launch-editor --inline" and nothing else is on PATH THEN selectEditor falls all the way through to "vi"', () => {
    const bin = mkdtempSync(join(tmpdir(), 'editor-launch-bin-'));
    tmpDirs.push(bin);

    const result = selectEditor({ PATH: bin, EDITOR: 'omarchy-launch-editor --inline' });
    expect(result).toBe('vi');
  });
});
