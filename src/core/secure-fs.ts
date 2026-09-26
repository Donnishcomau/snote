import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';

/**
 * Create a directory (recursively) and force its mode to 0o700.
 * The recursive mkdir only applies `mode` to directories IT creates, and
 * even then masked by umask, so the unconditional chmod afterwards is what
 * guarantees an already-existing group/other-readable dir gets tightened
 * on every call.
 */
export function secureMkdir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

/**
 * Write a file with mode 0o600.  The `mode` option only applies when the
 * file is created, so the unconditional chmod afterwards also fixes up a
 * file that already existed with a looser mode (same pattern as
 * token.ts's saveToken).
 */
export function secureWriteFileSync(path: string, data: string): void {
  writeFileSync(path, data, { mode: 0o600 });
  chmodSync(path, 0o600);
}
