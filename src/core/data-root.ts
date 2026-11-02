import { defaultDataDir, keptElsewhereCount } from './token';

// the data root main() resolved (`--data-dir`, else defaultDataDir()).
// The blog files (blog.json, blog-sent.json) live at this root, so the four
// blog sites in src/tui read the directory snote actually started with
// instead of re-deriving the default. null resets to the default.
let root: string | null = null;

export function setDataRoot(dir: string | null): void {
  root = dir;
}

// F237b: the signed-in account (set by Root), so the logout warning can count
// what the OTHER accounts' folders keep. null = no account known (0 kept).
let account: { root: string; ownFolder: string } | null = null;
export function setActiveAccount(root: string, ownFolder: string): void {
  account = { root, ownFolder };
}
export function keptElsewhere(): number {
  return account === null ? 0 : keptElsewhereCount(account.root, account.ownFolder);
}

export function dataRoot(): string {
  return root ?? defaultDataDir();
}
