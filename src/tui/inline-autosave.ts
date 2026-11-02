import { useLayoutEffect, useRef } from 'react';

/** #387: the inline editor stores its text this many ms after the last change */
export const AUTOSAVE_MS = 1500;
/** #387: and at the latest this many ms after the oldest change not yet stored */
export const AUTOSAVE_MAX_MS = 5000;

type Timer = ReturnType<typeof setTimeout> | undefined;

/**
 * #387: the autosave of one inline-editor session (one mount of the editor).
 * `text` is the editor's real text; call `changed()` after it changes, and
 * `close()` to store what is not stored yet at once and end the session (no
 * store runs after it). Unmounting closes too, synchronously, so a quit keeps
 * the text. Text equal to the last stored text is not stored again.
 */
export function useInlineAutosave(text: { current: string }, store: (text: string) => void): { changed: () => void; close: () => void } {
  const storeRef = useRef(store);
  storeRef.current = store;
  const ref = useRef<{ stored: string; seen: string; live: boolean; last: Timer; max: Timer } | null>(null);
  if (!ref.current) ref.current = { stored: text.current, seen: text.current, live: true, last: undefined, max: undefined };
  const s = ref.current;
  const flush = (): void => {
    clearTimeout(s.last);
    clearTimeout(s.max);
    s.last = s.max = undefined;
    const now = text.current;
    if (s.live && now !== s.stored) {
      s.stored = now;
      storeRef.current(now);
    }
  };
  const changed = (): void => {
    if (!s.live || text.current === s.seen) return;
    s.seen = text.current;
    clearTimeout(s.last);
    s.last = setTimeout(flush, AUTOSAVE_MS);
    if (!s.max) s.max = setTimeout(flush, AUTOSAVE_MAX_MS);
  };
  const close = (): void => {
    flush();
    s.live = false;
  };
  useLayoutEffect(() => close, []);
  return { changed, close };
}
