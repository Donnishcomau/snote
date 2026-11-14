// #448: the one listed rule for the test files that need Linux tools (flock, setsid, /proc, GNU userland, a pty)
// and so cannot run on macOS by design. test/linux-only.txt is the list (one `<path>\t<reason>` per line, `#`
// comments); vitest.config.ts excludes the listed files on darwin only. Nothing is deleted: on Linux every file runs.
// The list is private (scripts/export.d/exclude): it names private test files, so the public export has no list and skips nothing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LinuxOnlyEntry { path: string; reason: string }

export function readLinuxOnly(root: string): LinuxOnlyEntry[] {
  return readFileSync(join(root, 'test/linux-only.txt'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'))
    .map((line) => {
      const [path, reason = ''] = line.split('\t');
      return { path: path.trim(), reason: reason.trim() };
    });
}

export function linuxOnlyExclude(platform: string, root: string): string[] {
  if (platform !== 'darwin' || !existsSync(join(root, 'test/linux-only.txt'))) return [];
  return readLinuxOnly(root).map((entry) => entry.path);
}
