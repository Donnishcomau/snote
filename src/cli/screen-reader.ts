/**
 * #17 — screen-reader mode is opt-in. Accepted argv shapes, exactly:
 * `--screen-reader` (on) and `--no-screen-reader` (off). Accepted env:
 * `SNOTE_SCREEN_READER=1` (on). Any other value, and Ink's own
 * INK_SCREEN_READER, leave the mode off. A flag wins over the env; with both
 * flags present the mode is off.
 */
export const SCREEN_READER_FLAG = '--screen-reader';
export const NO_SCREEN_READER_FLAG = '--no-screen-reader';

export function screenReaderMode(
  argv: string[],
  env: Record<string, string | undefined>,
): { args: string[]; on: boolean } {
  const off = argv.includes(NO_SCREEN_READER_FLAG);
  const on = argv.includes(SCREEN_READER_FLAG);
  const args = argv.filter((a) => a !== SCREEN_READER_FLAG && a !== NO_SCREEN_READER_FLAG);
  if (off) return { args, on: false };
  if (on) return { args, on: true };
  return { args, on: env.SNOTE_SCREEN_READER === '1' };
}
