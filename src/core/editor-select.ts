import { findOnPath } from '../cli/env-check.js';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface EditorEnv {
  SNOTE_EDITOR?: string;
  EDITOR?: string;
  PATH?: string;
  HOME?: string;
  XDG_STATE_HOME?: string;
}

// Terminal editors run inline with inherited stdio (they redraw the whole
// screen themselves); anything else is treated as a GUI editor that needs
// isolating (see editor.ts). One source of truth for that classification.
const TERMINAL_EDITORS = new Set(['nvim', 'vim', 'vi', 'nano', 'micro', 'hx', 'helix', 'fresh']);

export function isTerminalEditor(cmd: string): boolean {
  const first = cmd.trim().split(/\s+/)[0] ?? '';
  return TERMINAL_EDITORS.has(basename(first));
}

function defaultReadFirstLine(file: string): string | null {
  try {
    const content = readFileSync(file, 'utf-8');
    const first = content.split('\n')[0]?.trim();
    return first ? first : null;
  } catch {
    return null;
  }
}

export function selectEditor(
  env: EditorEnv,
  exists: (file: string) => boolean = existsSync,
  readFirstLine: (file: string) => string | null = defaultReadFirstLine,
): string {
  const snoteEditor = env.SNOTE_EDITOR?.trim();
  if (snoteEditor) {
    return snoteEditor;
  }

  // Omarchy's chosen default editor, when we can tell HOME/XDG_STATE_HOME.
  // Test env objects that only set PATH/EDITOR/SNOTE_EDITOR never reach this
  // branch, since stateDir stays null for them.
  const stateDir = env.XDG_STATE_HOME ?? (env.HOME ? join(env.HOME, '.local/state') : null);
  if (stateDir) {
    const defaultsFile = join(stateDir, 'omarchy/defaults/editor');
    if (exists(defaultsFile)) {
      const line = readFirstLine(defaultsFile)?.trim();
      if (line) {
        const firstToken = line.split(/\s+/)[0];
        if (findOnPath(firstToken, env.PATH, exists)) {
          return line;
        }
      }
    }
  }

  // Omarchy's own fallback when no default is set: nvim inline, same window.
  if (findOnPath('nvim', env.PATH, exists)) {
    return 'nvim';
  }

  // Omarchy sets EDITOR="omarchy-launch-editor --inline"; that launcher
  // detaches GUI editors with setsid, so snote would read the file back
  // before the user finished. Treat that value as unset and fall through.
  const editor = env.EDITOR?.trim();
  if (editor && !editor.startsWith('omarchy-launch-editor')) {
    return editor;
  }

  if (findOnPath('omawrite', env.PATH, exists)) {
    return 'omawrite';
  }

  return 'vi';
}

export function editorFinishHint(editorCmd: string): string {
  const cmd = editorCmd.split(/\s+/)[0];
  const name = basename(cmd);

  if (name === 'omawrite') {
    return 'save with Ctrl+S and close the window to return';
  }
  if (name === 'nvim' || name === 'vim') {
    return 'Esc then :wq to save and return';
  }
  return 'save and close the editor to return';
}
