import { describe, it, expect, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { editInEditor, nvimHintArgs } from '../../src/core/editor.js';

function commandOnPath(cmd: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
}

const HINT_TEXT =
  'snote · i insert · Esc done typing · o new line · dd delete line · u undo · :wq save & return · :q! discard';

// A fake editor that records its argv (one JSON array per line) into the
// file named by HINT_ARGV_LOG, then edits the file given as its last
// argument so editInEditor still sees a real change.
const RECORDER_BODY = `#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.HINT_ARGV_LOG, JSON.stringify(args) + '\\n');
const filePath = args[args.length - 1];
const content = readFileSync(filePath, 'utf-8');
writeFileSync(filePath, content + '\\nEDITED', 'utf-8');
`;

const tmpDirs: string[] = [];

function makeFakeEditor(name: string): { path: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'nvim-hint-bin-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, RECORDER_BODY, 'utf-8');
  chmodSync(path, 0o755);
  const log = join(dir, 'argv.log');
  writeFileSync(log, '', 'utf-8');
  return { path, log };
}

function readArgv(log: string): string[] {
  return JSON.parse(readFileSync(log, 'utf-8').trim()) as string[];
}

afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
  delete process.env.HINT_ARGV_LOG;
});

describe('nvim winbar cheat-sheet (T316)', () => {
  it('1: WHEN editInEditor("hello", { editor: \'<tmp>/nvim\' }) runs with a fake nvim that records its argv THEN the recorded argv contains `-c`, contains the text `:wq save & return`, and its last element is the temp file path.', async () => {
    const { path: nvim, log } = makeFakeEditor('nvim');
    process.env.HINT_ARGV_LOG = log;

    const result = await editInEditor('hello', { editor: nvim });

    expect(result).toContain('EDITED');
    const argv = readArgv(log);
    expect(argv).toContain('-c');
    expect(argv.some((a) => a.includes(':wq save & return'))).toBe(true);
    // The -c arguments come before the temp file and the temp file is last.
    expect(argv[argv.length - 1]).toMatch(/hello\.md$/);
    expect(argv.indexOf('-c')).toBeLessThan(argv.length - 1);
  });

  it('2: WHEN editInEditor("hello", { editor: \'<tmp>/nvim -u NONE\' }) runs THEN the recorded argv contains `-u` and `NONE` before the `-c` arguments and still ends with the temp file path.', async () => {
    const { path: nvim, log } = makeFakeEditor('nvim');
    process.env.HINT_ARGV_LOG = log;

    const result = await editInEditor('hello', { editor: `${nvim} -u NONE` });

    expect(result).toContain('EDITED');
    const argv = readArgv(log);
    expect(argv).toContain('-u');
    expect(argv).toContain('NONE');
    expect(argv.indexOf('-u')).toBeLessThan(argv.indexOf('-c'));
    expect(argv.indexOf('NONE')).toBeLessThan(argv.indexOf('-c'));
    expect(argv[argv.length - 1]).toMatch(/hello\.md$/);
  });

  it('3: WHEN editInEditor("hello", { editor: \'<tmp>/micro\' }) runs with a fake micro that records its argv THEN the recorded argv is exactly the temp file path (no `-c`).', async () => {
    const { path: micro, log } = makeFakeEditor('micro');
    process.env.HINT_ARGV_LOG = log;

    const result = await editInEditor('hello', { editor: micro });

    expect(result).toContain('EDITED');
    const argv = readArgv(log);
    expect(argv).toHaveLength(1);
    expect(argv).not.toContain('-c');
    expect(argv[0]).toMatch(/hello\.md$/);
  });

  it('4: WHEN src/core/editor.ts is read as text THEN it contains `export const NVIM_HINT` and the hint text appears in it once.', () => {
    const src = readFileSync(join(process.cwd(), 'src/core/editor.ts'), 'utf-8');
    expect(src).toContain('export const NVIM_HINT');
    expect(src.split(HINT_TEXT)).toHaveLength(2);
  });

  // T318 replaces the old autocmd text and the laststatus/VimLeavePre
  // behaviour pinned by earlier assertions; these cases pin the new shape.

  it("1: WHEN the nvim argv is built THEN no argument contains `laststatus` and none contains `VimLeavePre`.", () => {
    const argv = nvimHintArgs();
    expect(argv.some((a) => a.includes('laststatus'))).toBe(false);
    expect(argv.some((a) => a.includes('VimLeavePre'))).toBe(false);
  });

  it('2: WHEN the nvim argv is built THEN the autocmd argument contains `nvim_win_get_config(0).relative == ""` and `vim.g.snote_buf`.', () => {
    const autocmd = nvimHintArgs().find((a) => a.startsWith('autocmd '));
    expect(autocmd).toBeDefined();
    expect(autocmd).toContain('nvim_win_get_config(0).relative == ""');
    expect(autocmd).toContain('vim.g.snote_buf');
  });

  it("3: WHEN real `nvim` is on PATH (skip the case otherwise) and it runs headless on a temp file with the built arguments, then opens a height-1 floating window and returns to the note window THEN its stderr contains no `E36` and the note window's winbar contains `:wq save & return`.", async () => {
    if (!commandOnPath('nvim')) return; // the case skips when nvim is absent

    const dir = mkdtempSync(join(tmpdir(), 'nvim-hint-real-'));
    tmpDirs.push(dir);
    const file = join(dir, 'note.md');
    writeFileSync(file, 'hello\n', 'utf-8');

    // Header run after the built arguments (which register the cheat-sheet
    // autocmd), as the handoff prescribes: `--clean` so no user config or
    // plugins load, a height-1 float opened with `nvim_open_win` (the E36
    // case reproduces without plugins), then `wincmd p` back to the note
    // window, then the winbar is read with `io.stdout:write` — under
    // `--headless` a write to stdio.stdout reaches the parent's stdout pipe
    // (verified on nvim 0.12.5; `vim.print` only queues a message and
    // `:redir` captures nothing). `qa!` exits without a prompt.
    function openFloatAndReturn(hintArgs: string[]) {
      const init = [
        '-c',
        'lua vim.api.nvim_open_win(vim.api.nvim_create_buf(false, true), true, ' +
          '{relative="editor",row=1,col=1,width=10,height=1})',
        '-c',
        'wincmd p',
        '-c',
        'lua io.stdout:write("WINBAR=" .. vim.wo.winbar .. "\\n") io.stdout:flush()',
        '-c',
        'qa!',
      ];
      return spawn(
        'nvim',
        ['--clean', '-i', 'NONE', '--headless', ...hintArgs, ...init, file],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    }

    // Collect stdout and stderr, waiting for both streams to close; the exit
    // promise resolves once nvim is gone. A run that stops at the hit-enter
    // prompt never closes them, so both race a 2.5 s timer.
    function opened(child: ReturnType<typeof openFloatAndReturn>) {
      const out: string[] = [];
      const err: string[] = [];
      const closed = Promise.all(
        [child.stdout, child.stderr].map(
          (s) =>
            new Promise<void>((resolve) => {
              s.setEncoding('utf-8');
              s.on('data', (chunk: string) => (s === child.stdout ? out : err).push(chunk));
              s.on('close', () => resolve());
            }),
        ),
      );
      const exited = new Promise<number | null>((resolve) => {
        child.on('exit', (code) => resolve(code));
        child.on('error', (err2) => {
          err.push('spawn error: ' + err2.message);
          resolve(-1);
        });
      });
      async function within(ms: number): Promise<boolean> {
        return await Promise.race([
          Promise.all([exited, closed]).then(() => true),
          new Promise<boolean>((resolve) => {
            const t = setTimeout(() => {
              child.kill('SIGKILL');
              resolve(false);
            }, ms);
            t.unref();
          }),
        ]);
      }
      return {
        stdout: () => out.join(''),
        stderr: () => err.join(''),
        exited,
        within,
      };
    }

    // The recorded buffer and the cheat-sheet's buffer are the same file
    // buffer: nvim's BufWinEnter autocmd captured it when the first window
    // first entered it, and the probe line below prints both ids.
    const r1 = opened(openFloatAndReturn(nvimHintArgs()));
    const finished = await r1.within(2500);
    expect(finished).toBe(true);
    expect(await r1.exited).toBe(0);
    // The acceptance line: no E36 anywhere, and the note window's winbar is
    // the cheat-sheet.
    expect(r1.stdout() + r1.stderr()).not.toContain('E36');
    // The note window's winbar holds the hint.
    expect(r1.stdout()).toContain('WINBAR=');
    expect(r1.stdout()).toContain(':wq save & return');

    // Negative control on the same fixture: the autocmd body reaches the
    // same statement a broken guard would (nvim_buf_get_name on a
    // nonexistent buffer) and prints a line before it. In the real
    // cheat-sheet autocmd the error sits inside the guard's `if ... then`,
    // so no such line and no E-code can appear.
    const brokenGuard =
      'if vim.api.nvim_win_get_config(0).relative == "" then ' +
      'io.stdout:write("[boom]\\n") nvim_buf_get_name(999999) end';
    const r2 = opened(
      openFloatAndReturn(['-c', 'autocmd BufWinEnter,WinEnter * lua ' + brokenGuard]),
    );
    expect(await r2.within(2500)).toBe(true);
    const out2 = r2.stdout() + r2.stderr();
    expect(out2).toContain('[boom]');
    expect(out2).toMatch(/E\d+:|E\d+=/);
  });
});
