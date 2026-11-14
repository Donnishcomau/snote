import { spawn } from 'node:child_process';
import type { StdioOptions } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

import { selectEditor, isTerminalEditor } from './editor-select.js';
import { findOnPath } from '../cli/env-check.js';
import { exportFileName } from './export-name.js';
import { ensureDraftsDir, readDraft, removeDrafts, writeSource } from './editor-drafts.js';
import { secureMkdtemp, secureWriteFileSync } from './secure-fs.js';
import { afterNextSave } from './persistence.js';

// #65: draft folders whose text went back to snote and may not be saved to
// disk yet; the caller releases them once it has dispatched the text.
let handedBack: string[] = [];

// #89: the note the NEXT editInEditor call edits (null = a new note). Set by
// expectNote right before the call, taken (and cleared) by editInEditor.
// #618: for a new note, newNote names the id its first write creates it
// under and the handler each write goes to (createNote).
// proof: test/core/new-note-write.test.tsx
let editing: string | null = null;
let creating: { id: string; onWrite: (text: string) => void } | null = null;
export function expectNote(noteId: string | null, newNote: { id: string; onWrite: (text: string) => void } | null = null): void {
  editing = noteId;
  creating = newNote;
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
export const NVIM_HINT = 'snote · i insert · Esc done · :w save & sync · :wq save & return · :q! discard';
// #618: after a :w of the note the winbar is NVIM_SAVED with nvim's HH:MM in
// place of TIME (snote stores each write, #97; the sync itself is not shown).
// #718: it leads with `last saved TIME` in its own colour (DiagnosticOk).
// proof: test/core/nvim-saved.test.ts
export const NVIM_SAVED = 'last saved TIME · :w save & sync · :wq save & return · :q! keep last save';
// #719: an edit not written for UNSAVED_WARN_MS, or UNSAVED_WARN_TYPED
// characters typed since the last write, turns the whole winbar
// DiagnosticWarn (orange in most themes); UNSAVED_ALERT_MS turns it
// DiagnosticError (red). Highlight groups of the user's own theme, not a
// colour value. proof: test/core/nvim-unsaved.test.ts
export const UNSAVED_WARN_MS = 30_000;
export const UNSAVED_WARN_TYPED = 200;
export const UNSAVED_ALERT_MS = 120_000;

// The hint as a Lua long-bracket string: a ' in the text could never break
// the chunk, and % is doubled so a stray one can never break the statusline
// format itself. The bracket level steps up if the text ever holds ']'.
function nvimHintLuaString(text: string): string {
  const level = text.includes(']') ? '=' : '';
  const safe = text.replaceAll('%', '%%');
  return '[' + level + '[' + safe + ']' + level + ']';
}

// #718: the part before the first ` · ` (vim.g.snote_lead) and the rest
// (vim.g.snote_rest), each as a Lua string.
function leadAndRest(text: string): [string, string] {
  const at = text.indexOf(' · ');
  return [nvimHintLuaString(text.slice(0, at)), nvimHintLuaString(text.slice(at))];
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
// #618: a BufWritePost of the note buffer swaps the text for NVIM_SAVED with
// the time (os.date, digits only); only a write of the note's own file
// counts: <afile>:p must equal vim.g.snote_file, the buffer name recorded at
// start, so `:w other` or a write after `:saveas` keeps it.
// #718 #719: _G.snote_bar() draws the winbar from vim.g (lead in
// vim.g.snote_hl, rest in Comment; the whole line in vim.g.snote_alert when
// set) on every non-floating window showing the note buffer, so a :split
// of the note, or a :wa from another window, repaints them all and leaves a
// window showing another buffer alone. _G.snote_tick, every second, sets
// vim.g.snote_alert from how long the note buffer has been modified and
// vim.g.snote_typed (InsertCharPre on the note buffer); a write or an undo
// back to the written text clears both.
// The timer and the InsertCharPre autocmd are made inside the first -c, so
// snote still takes 3 of nvim's 10 -c arguments.
// proof: test/core/nvim-saved.test.ts, test/core/nvim-unsaved.test.ts
export function nvimHintArgs(): string[] {
  const [hintLead, hintRest] = leadAndRest(NVIM_HINT);
  const [savedLead, savedRest] = leadAndRest(NVIM_SAVED);
  const isNote = 'vim.api.nvim_get_current_buf() == vim.g.snote_buf';
  const bar =
    '_G.snote_bar = function() local a = vim.g.snote_alert ' +
    'local s = a and ("%#" .. a .. "#" .. vim.g.snote_lead .. vim.g.snote_rest) ' +
    'or ("%#" .. vim.g.snote_hl .. "#" .. vim.g.snote_lead .. "%#Comment#" .. vim.g.snote_rest) ' +
    'for _, w in ipairs(vim.fn.win_findbuf(vim.g.snote_buf)) do ' +
    'if vim.api.nvim_win_get_config(w).relative == "" then vim.api.nvim_set_option_value("winbar", s, { win = w }) end end end';
  const tick =
    '_G.snote_tick = function() local b = vim.g.snote_buf if not vim.api.nvim_buf_is_valid(b) then return end local a = nil ' +
    'if vim.bo[b].modified then local now = vim.fn.localtime() if vim.g.snote_dirty == nil then vim.g.snote_dirty = now end ' +
    'local age = (now - vim.g.snote_dirty) * 1000 ' +
    'if age >= ' + UNSAVED_ALERT_MS + ' then a = "DiagnosticError" ' +
    'elseif age >= ' + UNSAVED_WARN_MS + ' or vim.g.snote_typed >= ' + UNSAVED_WARN_TYPED + ' then a = "DiagnosticWarn" end ' +
    'else vim.g.snote_dirty = nil vim.g.snote_typed = 0 end ' +
    'if a ~= vim.g.snote_alert then vim.g.snote_alert = a _G.snote_bar() end end';
  const recordBuf =
    'vim.g.snote_buf = vim.api.nvim_get_current_buf() vim.g.snote_file = vim.api.nvim_buf_get_name(0) ' +
    'vim.g.snote_lead = ' + hintLead + ' vim.g.snote_rest = ' + hintRest + ' vim.g.snote_hl = "Comment" vim.g.snote_typed = 0 ' +
    bar + ' ' + tick + ' _G.snote_bar() vim.fn.timer_start(1000, function() _G.snote_tick() end, { ["repeat"] = -1 }) ' +
    'vim.api.nvim_create_autocmd("InsertCharPre", { callback = function() if ' + isNote + ' then vim.g.snote_typed = vim.g.snote_typed + 1 end end })';
  const onWrite =
    'if tonumber(vim.fn.expand("<abuf>")) == vim.g.snote_buf and vim.fn.expand("<afile>:p") == vim.g.snote_file then ' +
    'vim.g.snote_lead = ((' + savedLead + '):gsub("TIME", os.date("%H:%M"))) vim.g.snote_rest = ' + savedRest +
    ' vim.g.snote_hl = "DiagnosticOk" vim.g.snote_dirty = nil vim.g.snote_typed = 0 vim.g.snote_alert = nil _G.snote_bar() end';
  const guard = 'if vim.api.nvim_win_get_config(0).relative == "" and ' + isNote + ' then _G.snote_bar() end';
  return [
    '-c',
    'lua ' + recordBuf,
    '-c',
    'autocmd BufWinEnter,WinEnter * lua ' + guard,
    '-c',
    'autocmd BufWritePost * lua ' + onWrite,
  ];
}

// #97: run the editor without blocking the event loop (spawnSync froze it:
// no heartbeats, so the server could drop the connection). Same argv, no
// shell. An error to start (ENOENT) resolves as `error`; a signal ends with
// status null, as spawnSync reported it.
// A terminal editor shares the terminal's stdin. Ink's suspend only removes
// its own listener; the stream keeps reading, so snote would take keys meant
// for the editor and replay them afterwards. On the tick after that removal
// the stream is paused, before the child starts, and resumed once it closed.
type Stdin = { pause(): unknown; resume(): unknown };
async function runChild(
  cmd: string,
  args: string[],
  stdio: StdioOptions,
  stdin: Stdin,
): Promise<{ error?: NodeJS.ErrnoException; status: number | null }> {
  const shared = stdio === 'inherit';
  if (shared) {
    await new Promise<void>((r) => setImmediate(r));
    stdin.pause();
  }
  const result = await new Promise<{ error?: NodeJS.ErrnoException; status: number | null }>((resolve) => {
    let done = false;
    const finish = (r: { error?: NodeJS.ErrnoException; status: number | null }) => {
      if (done) return;
      done = true;
      resolve(r);
    };
    try {
      const child = spawn(cmd, args, { stdio });
      child.once('error', (error) => finish({ error, status: null }));
      child.once('close', (status) => finish({ status }));
    } catch (error) {
      finish({ error: error as NodeJS.ErrnoException, status: null });
    }
  });
  if (shared) stdin.resume();
  return result;
}

const QUICK_RETURN = 'Set SNOTE_EDITOR to a command that waits, e.g. code --wait. Nothing was saved';

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
  opts?: { editor?: string; stdin?: Stdin; onWrite?: (text: string) => void },
): Promise<string | null> {
  const editor = opts?.editor ?? selectEditor(process.env);
  const noteId = editing;
  const fresh = creating; // #618: a new note's writes go to the id its first write creates
  const target = noteId ?? fresh?.id ?? null;
  editing = null;
  creating = null;
  const parts = editor.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  // mkdtemp creates the folder with mode 0700
  // proof: test/core/editor-drafts.test.tsx
  const tmpDir = secureMkdtemp(join(ensureDraftsDir(), 'snote-'));
  // Name the file after the note itself (same name the export would use),
  // so the editor's status bar shows which note is open. The .md suffix
  // keeps markdown highlighting; an empty note lands on 'untitled.md'.
  const stem = exportFileName(initial);
  const tmpFile = join(tmpDir, `${stem}.md`);
  secureWriteFileSync(tmpFile, initial);
  if (noteId !== null) writeSource(tmpDir, noteId, initial); // #89: an edit of an existing note names it
  // #97: while the editor is open each write goes to the note; the watcher loads now, not at start
  let stopWatch: (() => string) | undefined;
  let closed = false;
  let renewSidecar: ((text: string) => void) | undefined;
  const onWrite = opts?.onWrite ?? fresh?.onWrite;
  if (onWrite && target !== null) {
    // The sidecar follows the note on disk: after the save that holds a write it names that write's text, so a
    // restart finds the draft already in the note (or applies newer draft text to the same note). At most one save
    // callback waits per session, also while saves fail; it names the latest text and takes the draft's file time.
    // proof: test/core/editor-write-restart.test.tsx
    let sidecar: string | undefined;
    let stampedText: string | undefined;
    const handOn = (text: string): void => {
      stampedText = undefined; // A1: a later write attempt voids the stamp until its own save stamps it (the attempt may throw after the reducer)
      onWrite(text);
      const waiting = sidecar !== undefined;
      sidecar = text;
      if (!waiting) {
        afterNextSave(() => {
          try {
            if (sidecar !== undefined) {
              writeSource(tmpDir, target, sidecar, tmpFile);
              stampedText = sidecar;
            }
          } finally {
            sidecar = undefined; // #670: also when the rewrite throws, or no later write registers a callback
          }
        });
      }
    };
    // The editor can rewrite the same text, at close (vim `:wq` after `:w`,) or while it stays open (an identical
    // `:w`,), which moves the draft's file time but is not a write: the sidecar takes the new time only for the text
    // a completed save callback stamped. While a save waits, its own callback takes the time at the save; a write whose
    // hand-on threw was never stamped.
    // proof: test/core/editor-write-rewrite.test.tsx, test/core/editor-write-open-rewrite.test.tsx
    renewSidecar = (text) => {
      if (sidecar === undefined && text === stampedText) writeSource(tmpDir, target, text, tmpFile);
    };
    void import('./editor-write-watch')
      .then((m) => {
        if (!closed) stopWatch = m.watchDraftWrites(tmpFile, initial, readDraft, handOn, undefined, renewSidecar);
      })
      .catch(() => undefined); // no watcher: the close path stores the text, as before #97
  }

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
  const stdin = opts?.stdin ?? process.stdin;
  const ignored: StdioOptions = ['ignore', 'ignore', 'ignore'];
  const terminal = isTerminalEditor(cmd);
  const startedAt = performance.now();
  const result = terminal
    ? await runChild(cmd, [...args, ...hint, tmpFile], 'inherit', stdin)
    : uwsm
      ? await runChild('uwsm', ['app', '-S', 'both', '--', cmd, ...args, tmpFile], ignored, stdin)
      : await runChild(cmd, [...args, tmpFile], ignored, stdin);
  closed = true;
  const last = stopWatch?.() ?? initial; // #97: the last text a write handed on
  const kept = '. Your text is kept in ' + tmpFile;
  if (result.error) {
    throw new Error(
      'editor failed: ' +
        (result.error.code ?? result.error.message) +
        kept,
    );
  }
  if (result.status !== 0) {
    throw new Error('editor failed: exit ' + result.status + kept);
  }

  const edited = readFileSync(tmpFile, 'utf-8');
  if (edited === initial && last === initial) { // #97: a write back to the start text after a :w is stored
    removeDrafts([tmpDir]);
    const raw = process.env.SNOTE_EDITOR_QUICK_MS;
    const quick = raw !== undefined && /^\d{1,7}$/.test(raw) ? parseInt(raw, 10) : 2000;
    if (!terminal && quick > 0 && performance.now() - startedAt <= quick) {
      throw new Error(QUICK_RETURN);
    }
    return null;
  }
  if (edited === last) renewSidecar?.(edited); // the same text again after a write
  handedBack.push(tmpDir);
  return edited;
}
