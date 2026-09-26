import { delimiter, join } from 'node:path';
import fs from 'node:fs';

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

export function envReport(
  env: { EDITOR?: string; PATH?: string },
  exists: (file: string) => boolean = fs.existsSync
): string {
  const editorRaw = env.EDITOR?.trim() ?? '';
  const editorCommand = editorRaw ? editorRaw.split(/\s+/)[0] : 'nvim';

  const commands = [editorCommand, 'wl-copy', 'omarchy-launch-tui'];
  const lines: string[] = [];

  for (const cmd of commands) {
    const found = findOnPath(cmd, env.PATH, exists);
    if (found) {
      lines.push(`ok       ${cmd}: ${found}`);
    } else {
      lines.push(`missing  ${cmd}`);
    }
  }

  return lines.join('\n');
}
