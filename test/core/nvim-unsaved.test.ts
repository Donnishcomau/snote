/**
 * #719: in nvim, an edit of the note not written for 30 s, or 200 characters
 * typed since the last write, turns the whole winbar DiagnosticWarn; 120 s
 * turns it DiagnosticError; a write, or an undo back to the written text,
 * puts it back. #718: after a write the winbar leads with `last saved HH:MM`
 * in DiagnosticOk, the rest in Comment.
 * Each case runs the built arguments in headless nvim (skips only when nvim
 * is not on PATH; the test host, snote-ci, has it) and calls the tick
 * directly: the age is set by moving vim.g.snote_dirty back, so no case waits
 * on a real clock.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NVIM_HINT, nvimHintArgs } from '../../src/core/editor';

const hasNvim = spawnSync('sh', ['-c', 'command -v nvim']).status === 0;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// nvim runs at most 10 -c commands and the built arguments take 3, so the
// age and the tick share one.
const age = (ms: number): string => 'lua vim.g.snote_dirty = vim.fn.localtime() - ' + ms / 1000 + ' _G.snote_tick()';
const tick = 'lua _G.snote_tick()';

// Headless nvim on a temp note file with the built arguments, then each of
// `cmds` in order, then the winbar to stdout (2000 ms only stops a hung nvim).
function winbarAfter(cmds: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'nvim-unsaved-'));
  dirs.push(dir);
  const file = join(dir, 'note.md');
  writeFileSync(file, 'hello\n', 'utf-8');
  const r = spawnSync(
    'nvim',
    ['--clean', '-i', 'NONE', '--headless', ...nvimHintArgs(), ...cmds.flatMap((c) => ['-c', c]), '-c', 'lua io.stdout:write("WINBAR=" .. vim.wo.winbar .. "\\n") io.stdout:flush()', '-c', 'qa!', file],
    { encoding: 'utf-8', timeout: 2000 },
  );
  return (r.stdout ?? '').split('\n').find((l) => l.startsWith('WINBAR=')) ?? '';
}

const plain = 'WINBAR=%#Comment#snote%#Comment#' + NVIM_HINT.slice('snote'.length);

describe('#719 the nvim winbar warns about an edit not written yet', () => {
  it.skipIf(!hasNvim)('1: WHEN the note is edited and the edit is 29 s old THEN the winbar is unchanged; WHEN it is 30 s old THEN the whole winbar is DiagnosticWarn', () => {
    expect(winbarAfter(['normal! ix', age(29_000)])).toBe(plain);
    expect(winbarAfter(['normal! ix', age(30_000)])).toBe('WINBAR=%#DiagnosticWarn#' + NVIM_HINT);
  });

  it.skipIf(!hasNvim)('2: WHEN the edit is 120 s old THEN the whole winbar is DiagnosticError', () => {
    expect(winbarAfter(['normal! ix', age(119_000)])).toBe('WINBAR=%#DiagnosticWarn#' + NVIM_HINT);
    expect(winbarAfter(['normal! ix', age(120_000)])).toBe('WINBAR=%#DiagnosticError#' + NVIM_HINT);
  });

  it.skipIf(!hasNvim)('3: WHEN 199 characters are typed at once THEN the winbar is unchanged; WHEN 200 are typed THEN it is DiagnosticWarn', () => {
    expect(winbarAfter(['normal! i' + 'x'.repeat(199), tick])).toBe(plain);
    expect(winbarAfter(['normal! i' + 'x'.repeat(200), tick])).toBe('WINBAR=%#DiagnosticWarn#' + NVIM_HINT);
  });

  it.skipIf(!hasNvim)('4: WHEN a warned edit is written with :w THEN the winbar leads with `last saved HH:MM` in DiagnosticOk and the rest in Comment, and a tick keeps it', () => {
    const saved = /^WINBAR=%#DiagnosticOk#last saved \d\d:\d\d%#Comment# · :w save & sync · :wq save & return · :q! keep last save$/;
    expect(winbarAfter(['normal! i' + 'x'.repeat(200), age(120_000), 'w'])).toMatch(saved);
    expect(winbarAfter(['normal! i' + 'x'.repeat(200), age(120_000), 'w', tick])).toMatch(saved);
  });

  it.skipIf(!hasNvim)('5: WHEN a warned edit is undone back to the written text THEN the next tick puts the winbar back', () => {
    expect(winbarAfter(['normal! ix', age(30_000), 'normal! u', tick])).toBe(plain);
  });

  it.skipIf(!hasNvim)('6: WHEN nvim starts with the built arguments THEN one timer runs every 1000 ms with no end', () => {
    expect(winbarAfter(['lua vim.wo.winbar = vim.fn.json_encode(vim.tbl_map(function(t) return { t.time, t["repeat"] } end, vim.fn.timer_info()))'])).toBe(
      'WINBAR=[[1000, -1]]',
    );
  });

  // Window 2 is the other window of the note after :split; its winbar is read
  // without entering it (entering it redraws it).
  const other = 'lua vim.wo.winbar = vim.wo[vim.fn.win_getid(2)].winbar';

  it.skipIf(!hasNvim)('7: WHEN the note is split, the edit turns DiagnosticError and :w writes it THEN the other window of the note shows the `last saved HH:MM` winbar too', () => {
    const saved = /^WINBAR=%#DiagnosticOk#last saved \d\d:\d\d%#Comment# · :w save & sync/;
    expect(winbarAfter(['normal! ix', 'split', age(120_000), other])).toBe('WINBAR=%#DiagnosticError#' + NVIM_HINT);
    expect(winbarAfter(['normal! ix', 'split', age(120_000), 'w', other])).toMatch(saved);
  });
});
