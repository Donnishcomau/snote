import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

import { selectEditor, isTerminalEditor } from './editor-select.js';
import { findOnPath } from '../cli/env-check.js';
import { exportFileName } from './export-note.js';
import { ensureDraftsDir, removeDrafts, writeSource } from './editor-drafts.js';
import { secureWriteFileSync } from './secure-fs.js';
import { afterNextSave } from './persistence.js';

// #65: draft folders whose text went back to snote and may not be saved to
// disk yet; the caller releases them once it has dispatched the text.
let handedBack: string[] = [];

// #89: the note the NEXT editInEditor call edits (null = a new note). Set by
// expectNote right before the call, taken (and cleared) by editInEditor.
let editing: string | null = null;
export function expectNote(noteId: string | null): void {
  editing = noteId;
}

/**
 * Call right after the editor's text is dispatched: the draft folders handed
 * back so far are removed once state.json holds that text, never before.
 */
export function releaseDraftsAfterSave(): void {
  const drafts = handedBack;
  handedBack = [];
  if (drafts.length > 0) afterNextSave(() => removeDrafts(drafts));
}

// One-line key cheat-sheet nvim shows in the note window's winbar, so the
// main keys stay visible while editing inside snote's window.
export const NVIM_HINT =
  'snote · i insert · Esc done typing · o new line · dd delete line · u undo · :wq save & return · :q! discard';

// The hint as a Lua long-bracket string: a ' in the text could never break
// the chunk, and % is doubled so a stray one can never break the statusline
// format itself. The bracket level steps up if the text ever holds ']'.
function nvimHintLuaString(): string {
  const level = NVIM_HINT.includes(']') ? '=' : '';
  const safe = NVIM_HINT.replaceAll('%', '%%');
  return '[' + level + '[' + safe + ']' + level + ']';
}

// Startup -c arguments for nvim: show the cheat-sheet in the note window's
// winbar, and re-apply it from a BufWinEnter/WinEnter autocmd so a plugin
// that resets the option cannot make the hint disappear. The hint must land
// on the note window only: the first -c records the buffer nvim starts on
// in vim.g.snote_buf and sets the winbar on the window it starts in, and the
// autocmd re-applies it only when the entered window is normal and showing
// that buffer. An unconditional autocmd sets the winbar on plugin popups
// (noice.nvim's one-line floats) too small for one, which fails inside
// their BufWinEnter/WinEnter handlers with E36: Not enough room. Global UI
// options (laststatus, statusline) are never touched: they belong to the
// user's config, and LazyVim shows the note file name in its statusline.
// The autocmd body is one `autocmd <events> * lua <chunk>` line; inside a
// `:lua` command line `|` is not a separator, so the guard is a single
// one-line `if ... then ... end` statement (verified on headless nvim 0.12,
// which also takes several such statements on one `:lua` line, space
// separated). A body that reaches nvim as plain vimscript (a `|`-separated
// form without `then`) errors with E121: Undefined variable: vim. The
// relative test uses the double-quoted Lua string `relative == ""` because
// the single-quoted form cannot be written inside the double-quoted Ex line
// unescaped.
// (The test suite calls nvimHintArgs() directly to pin this shape.)
export function nvimHintArgs(): string[] {
  const hint = "'%#Comment#' .. " + nvimHintLuaString();
  const setWinbar = 'vim.api.nvim_set_option_value("winbar", ' + hint + ', { win = 0 })';
  const recordBuf = 'vim.g.snote_buf = vim.api.nvim_get_current_buf()';
  const guard =
    'if vim.api.nvim_win_get_config(0).relative == "" ' +
    'and vim.api.nvim_get_current_buf() == vim.g.snote_buf then ' +
    setWinbar +
    ' end';
  return [
    '-c',
    'lua ' + recordBuf + ' ' + setWinbar,
    '-c',
    'autocmd BufWinEnter,WinEnter * lua ' + guard,
  ];
}

/**
 * Opens the user's editor on a draft file containing *initial* and waits
 * for it to exit. #65: the draft sits in a private folder of its own under
 * the open account's drafts folder (editor-drafts.ts). Unchanged text removes the folder at once; changed text is
 * returned and the folder is handed back (releaseDraftsAfterSave) to be
 * removed once the note is on disk; when the editor fails to start or exits
 * with a status other than 0 the folder is kept and the error names the file.
 *
 * Returns the edited text, or `null` when the file is unchanged.
 */
export async function editInEditor(
  initial: string,
  opts?: { editor?: string },
): Promise<string | null> {
  const editor = opts?.editor ?? selectEditor(process.env);
  const noteId = editing;
  editing = null;
  const parts = editor.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  // mkdtemp creates the folder with mode 0700
  const tmpDir = mkdtempSync(join(ensureDraftsDir(), 'snote-'));
  // Name the file after the note itself (same name the export would use),
  // so the editor's status bar shows which note is open. The .md suffix
  // keeps markdown highlighting; an empty note lands on 'untitled.md'.
  const stem = exportFileName(initial);
  const tmpFile = join(tmpDir, `${stem}.md`);
  secureWriteFileSync(tmpFile, initial);
  if (noteId !== null) writeSource(tmpDir, noteId, initial); // #89: an edit of an existing note names it

  // Terminal editors (nvim, vim, ...) run inline exactly as before: their
  // stdio is inherited so they can draw over snote's own screen. GUI
  // editors are routed through uwsm when it's on PATH so it can silence
  // their stderr (Qt binding-loop noise, portal errors) and manage
  // desktop integration the same way Omarchy's own launcher does; their
  // stdio is never inherited, so nothing leaks into snote's terminal.
  const direct = process.env.SNOTE_EDITOR_DIRECT === '1';
  const uwsm = direct ? null : findOnPath('uwsm', process.env.PATH);
  // nvim additionally gets the winbar cheat-sheet, set before the temp
  // file is loaded; every other editor's arguments stay exactly as before.
  const hint = basename(cmd) === 'nvim' ? nvimHintArgs() : [];
  const result = isTerminalEditor(cmd)
    ? spawnSync(cmd, [...args, ...hint, tmpFile], { stdio: 'inherit' })
    : uwsm
      ? spawnSync('uwsm', ['app', '-S', 'both', '--', cmd, ...args, tmpFile], {
          stdio: ['ignore', 'ignore', 'ignore'],
        })
      : spawnSync(cmd, [...args, tmpFile], { stdio: ['ignore', 'ignore', 'ignore'] });
  const kept = '. Your text is kept in ' + tmpFile;
  if (result.error) {
    throw new Error(
      'editor failed: ' +
        ((result.error as NodeJS.ErrnoException).code ?? result.error.message) +
        kept,
    );
  }
  if (result.status !== 0) {
    throw new Error('editor failed: exit ' + result.status + kept);
  }

  const edited = readFileSync(tmpFile, 'utf-8');
  if (edited === initial) {
    removeDrafts([tmpDir]);
    return null;
  }
  handedBack.push(tmpDir);
  return edited;
}
