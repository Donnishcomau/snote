/**
 * #83: the version snote shows inside the app (Help first line, status line).
 * main() sets it once at start (`setShownVersion(VERSION)`); until then
 * nothing is shown, so a bare render of a component stays unchanged.
 */

let shown: string | undefined;

export function setShownVersion(version: string | undefined): void {
  shown = version;
}

export function shownVersion(): string | undefined {
  return shown;
}

/** `Help - Keyboard Shortcuts` becomes `Help - Keyboard Shortcuts  snote 0.2.7` once a version is set. */
export function withVersion(title: string): string {
  return shown === undefined ? title : `${title}  snote ${shown}`;
}

/** The right-hand status tag `v0.2.7`, or '' when no version is set. */
export function statusTag(): string {
  return shown === undefined ? '' : `v${shown}`;
}
