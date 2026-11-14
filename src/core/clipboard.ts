import { spawnSync } from 'node:child_process';

// #219: a clipboard helper that never exits (a hung compositor) must not freeze snote; copy fails instead.
const COPY_TIMEOUT_MS = 1000;

/**
 * #447: the copy command per platform, a row each: macOS `/usr/bin/pbcopy` (a
 * system path), anything else `wl-copy`. Always an argv with the text on stdin,
 * and no shell; no OSC 52 (marketplace finding #10063).
 */
const COPY_COMMAND: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> = { darwin: ['/usr/bin/pbcopy'] };
export const copyCommand = (platform: NodeJS.Platform = process.platform): string[] => [...(COPY_COMMAND[platform] ?? ['wl-copy'])];

/**
 * Copies *text* to the clipboard by piping it into a command (default
 * `copyCommand()`). Returns `true` on success, `false` on failure.
 *
 * Never throws. The kill signal is SIGKILL (#219): a helper that traps
 * SIGTERM must not outlive the timeout.
 * proof: test/core/clipboard-timeout.test.tsx
 */
export function copyToClipboard(
  text: string,
  command: string[] = copyCommand(),
): boolean {
  if (!text || command.length === 0) {
    return false;
  }

  const result = spawnSync(command[0], command.slice(1), {
    input: text,
    stdio: ['pipe', 'ignore', 'ignore'],
    timeout: COPY_TIMEOUT_MS,
    killSignal: 'SIGKILL', // #219, see the docstring
    maxBuffer: 1048576,
  });

  return result.error === undefined && result.status === 0;
}
