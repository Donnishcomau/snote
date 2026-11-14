/**
 * #618: the nvim winbar names `:w save & sync` within 80 columns, and after
 * each `:w` of the note buffer (BufWritePost, <abuf> == vim.g.snote_buf) it
 * swaps to NVIM_SAVED with nvim's HH:MM; the WinEnter re-apply reads the
 * same vim.g.snote_hint, so the saved time survives a window switch.
 * Only a write of the note's own file sets it (<afile>:p == vim.g.snote_file):
 * test 3 runs these exact arguments in headless nvim (the case skips only
 * when nvim is not on PATH; the test host, snote-ci, has it).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NVIM_HINT, NVIM_SAVED, nvimHintArgs } from '../../src/core/editor';

const hasNvim = spawnSync('sh', ['-c', 'command -v nvim']).status === 0;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// Headless nvim on a temp note file with the built arguments, then `cmd`, then the winbar to stdout; -c commands run in order, so
// spawnSync returns once nvim quits (2000 ms is only a stop for a hung nvim).
function winbarAfter(cmd: string): { winbar: string; status: number | null } {
  const dir = mkdtempSync(join(tmpdir(), 'nvim-saved-'));
  dirs.push(dir);
  const file = join(dir, 'note.md');
  writeFileSync(file, 'hello\n', 'utf-8');
  const r = spawnSync(
    'nvim',
    ['--clean', '-i', 'NONE', '--headless', ...nvimHintArgs(), '-c', cmd.replace('OTHER', join(dir, 'other.md')), '-c', 'lua io.stdout:write("WINBAR=" .. vim.wo.winbar .. "\\n") io.stdout:flush()', '-c', 'qa!', file],
    { encoding: 'utf-8', timeout: 2000 },
  );
  return { winbar: (r.stdout ?? '').split('\n').find((l) => l.startsWith('WINBAR=')) ?? '', status: r.status };
}

const cols = (s: string): number => [...s].length;

describe('#618 the nvim winbar says :w saves, and shows when it did', () => {
  it('1: WHEN NVIM_HINT and NVIM_SAVED (TIME as 00:00) are measured THEN they are at most 80 columns, the hint holds `:w save & sync` and `:q! discard`, and the saved text (#718) is `last saved TIME` then `:w save & sync` and `:q! keep last save`', () => {
    expect(cols(NVIM_HINT)).toBeLessThanOrEqual(80);
    expect(cols(NVIM_SAVED.replace('TIME', '00:00'))).toBeLessThanOrEqual(80);
    expect(NVIM_HINT).toBe('snote · i insert · Esc done · :w save & sync · :wq save & return · :q! discard');
    expect(NVIM_SAVED).toBe('last saved TIME · :w save & sync · :wq save & return · :q! keep last save');
  });

  it('2: (#718) WHEN the nvim argv is built THEN it is six arguments: the first `lua` sets vim.g.snote_lead and vim.g.snote_rest to the hint split at its first ` · ` and vim.g.snote_file to the buffer name, the WinEnter guard and the first draw the winbar with _G.snote_bar, and the third is `autocmd BufWritePost * lua` that checks <abuf> against vim.g.snote_buf and <afile>:p against vim.g.snote_file and sets vim.g.snote_lead to `last saved` with os.date("%H:%M") in DiagnosticOk', () => {
    const a = nvimHintArgs();
    expect(a).toHaveLength(6);
    expect(a[1]).toContain('vim.g.snote_lead = [[snote]] vim.g.snote_rest = [[' + NVIM_HINT.slice('snote'.length) + ']]');
    expect(a[1]).toContain('"%#" .. vim.g.snote_hl .. "#" .. vim.g.snote_lead .. "%#Comment#" .. vim.g.snote_rest');
    expect(a[3]).toContain('then _G.snote_bar() end');
    expect(a[1]).toContain('vim.g.snote_file = vim.api.nvim_buf_get_name(0)');
    expect(a[5].startsWith('autocmd BufWritePost * lua if tonumber(vim.fn.expand("<abuf>")) == vim.g.snote_buf and vim.fn.expand("<afile>:p") == vim.g.snote_file then ')).toBe(true);
    expect(a[5]).toContain('vim.g.snote_lead = (([[last saved TIME]]):gsub("TIME", os.date("%H:%M")))');
    expect(a[5]).toContain('vim.g.snote_hl = "DiagnosticOk"');
  });

  it.skipIf(!hasNvim)('3: (rev3) WHEN headless nvim runs the built arguments on a note file and `:w` writes it THEN the winbar leads with `last saved ` in DiagnosticOk; WHEN `:w <other file>` writes the buffer elsewhere THEN the winbar is still NVIM_HINT', () => {
    const own = winbarAfter('w');
    expect(own).toEqual({ status: 0, winbar: expect.stringMatching(/^WINBAR=%#DiagnosticOk#last saved \d\d:\d\d%#Comment# · :w save & sync/) });
    const other = winbarAfter('w OTHER');
    expect(other).toEqual({ status: 0, winbar: 'WINBAR=%#Comment#snote%#Comment#' + NVIM_HINT.slice('snote'.length) });
  });
});
