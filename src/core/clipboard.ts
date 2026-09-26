import { spawnSync } from 'node:child_process';

/**
 * Copies *text* to the Wayland clipboard by piping it into a command
 * (default `wl-copy`). Returns `true` on success, `false` on failure.
 *
 * Never throws.
 */
export function copyToClipboard(
  text: string,
  command: string[] = ['wl-copy'],
): boolean {
  if (!text || command.length === 0) {
    return false;
  }

  const result = spawnSync(command[0], command.slice(1), {
    input: text,
    stdio: ['pipe', 'ignore', 'ignore'],
  });

  return result.error === undefined && result.status === 0;
}
