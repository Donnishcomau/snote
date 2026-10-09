import { defaultDataDir } from './token';

// T408: the data root main() resolved (`--data-dir`, else defaultDataDir()).
// The blog files (blog.json, blog-sent.json) live at this root, so the four
// blog sites in src/tui read the directory snote actually started with
// instead of re-deriving the default. null resets to the default.
let root: string | null = null;

export function setDataRoot(dir: string | null): void {
  root = dir;
}

export function dataRoot(): string {
  return root ?? defaultDataDir();
}
