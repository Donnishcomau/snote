// OMARCHY: boundary cast — the vendored simperium util module is untyped JS;
// reuse its own diff/transform/apply primitives rather than reimplementing them.
import { diff, transform, apply } from 'simperium/lib/simperium/util/change';

type Patch = Record<string, unknown>;

/**
 * T299: merge what the external editor returned against a remote change that
 * landed in the store while the editor was open, so neither side is silently
 * dropped by EDIT_NOTE's last-write-wins on `content`.
 */
export function mergeEditorReturn(
  base: string,
  local: string,
  current: string
): { content: string; conflict: boolean } {
  // nothing remote arrived while the editor was open: keep the local edit
  if (current === base) {
    return { content: local, conflict: false };
  }

  const b = { content: base };
  const l = { content: local };
  const c = { content: current };

  const localDiff = diff(b, l) as Patch;
  const remoteDiff = diff(b, c) as Patch;

  // no local edit to lose: the remote version wins cleanly
  if (local === base) {
    return { content: current, conflict: false };
  }

  let merged: { content?: string } | undefined;
  try {
    const transformed = transform(localDiff, remoteDiff, b);
    if (transformed && Object.keys(transformed).length > 0) {
      merged = apply(transformed, c) as { content?: string };
    }
  } catch {
    merged = undefined;
  }

  if (merged && typeof merged.content === 'string') {
    return { content: merged.content, conflict: false };
  }

  // unmergeable conflict (transform came back empty): keep both versions
  return {
    content: `${local}\n\n--- conflicting change from another device ---\n${current}`,
    conflict: true,
  };
}
