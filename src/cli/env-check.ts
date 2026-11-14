import { delimiter, join } from 'node:path';
import fs from 'node:fs';
import { copyCommand } from '../core/clipboard';

export function findOnPath(
  command: string,
  pathVar: string | undefined,
  exists: (file: string) => boolean = fs.existsSync
): string | null {
  if (command.includes('/')) {
    return exists(command) ? command : null;
  }
  if (!pathVar) return null;
  const dirs = pathVar.split(delimiter);
  for (const dir of dirs) {
    if (dir === '') continue;
    const candidate = join(dir, command);
    if (exists(candidate)) return candidate;
  }
  return null;
}

/**
 * #443: the commands snote uses that Omarchy ships, with what each is for. On
 * Omarchy (its `bin` folder, `/omarchy/bin`, is on PATH) a missing one is
 * `missing`; elsewhere (Homebrew on Ubuntu or Fedora) it is `optional`.
 * Growth by data: a new platform-only command is a row here.
 */
const PLATFORM_COMMANDS: ReadonlyArray<{ cmd: string; purpose: string }> = [
  { cmd: 'wl-copy', purpose: 'copies a note to the clipboard on Wayland' },
  { cmd: 'omarchy-launch-tui', purpose: 'opens snote from the Omarchy launcher' },
];
/**
 * #447: macOS has its own row set; there is no Omarchy launcher. The pbcopy row looks up `at`, the exact
 * program the copy runs (copyCommand in src/core/clipboard.ts), not a pbcopy found on PATH.
 */
const PLATFORM_ROWS: Readonly<Partial<Record<NodeJS.Platform, ReadonlyArray<{ cmd: string; at?: string; purpose: string }>>>> = {
  darwin: [{ cmd: 'pbcopy', at: copyCommand('darwin')[0], purpose: 'copies a note to the clipboard' }],
};

export function envReport(
  env: { EDITOR?: string; PATH?: string },
  exists: (file: string) => boolean = fs.existsSync,
  platform: NodeJS.Platform = process.platform
): string {
  const editorRaw = env.EDITOR?.trim() ?? '';
  const editorCommand = editorRaw ? editorRaw.split(/\s+/)[0] : 'nvim';
  const onOmarchy = (env.PATH ?? '').split(delimiter).some((dir) => dir.replace(/\/+$/, '').endsWith('/omarchy/bin'));

  const commands: ReadonlyArray<{ cmd: string; at?: string; purpose: string }> = [{ cmd: editorCommand, purpose: '' }, ...(PLATFORM_ROWS[platform] ?? PLATFORM_COMMANDS)];
  const lines: string[] = [];

  for (const { cmd, at, purpose } of commands) {
    const found = findOnPath(at ?? cmd, env.PATH, exists);
    if (found) {
      lines.push(`ok       ${cmd}: ${found}`);
    } else if (purpose === '' || onOmarchy) {
      lines.push(`missing  ${cmd}`);
    } else {
      lines.push(`optional ${cmd}: not found (${purpose})`);
    }
  }

  return lines.join('\n');
}

/**
 * #442: the `install:` lines of `snote --check` (how snote was installed and
 * its one updater). install-kind loads with import(), so it stays a lazy chunk.
 */
export async function installLines(): Promise<string> {
  return (await import('../core/install-kind')).runningInstallReport();
}
