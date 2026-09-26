/**
 * Shared guard+split for bunched paste chunks (T292).
 *
 * A paste arrives as ONE Ink input event with every `key.*` flag false and
 * the whole chunk in `input`. Multi-character chunks without an escape
 * sequence must be replayed per character so an embedded `\r` still commits
 * (Ink never sets `key.return` for a `\r` bunched with other characters).
 *
 * Returns the per-character array when the guard holds, `null` otherwise.
 */
export function splitPastedInput(input: string): string[] | null {
  if (input.length > 1 && !input.includes('\x1b')) {
    return [...input];
  }
  return null;
}
