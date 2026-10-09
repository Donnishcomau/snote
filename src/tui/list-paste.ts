import { usePaste } from 'ink';

import type { Key } from 'ink';

import { recordKeyEvent } from './app-keys';

/**
 * T481 — the notes list refuses a bracketed paste instead of replaying it
 * key by key. While `active` is true the hook claims Ink's paste channel
 * (usePaste is active, so App never sees the text on the input channel),
 * records one ring entry in text mode — the ring stores it as '<text>',
 * never verbatim — and hands `onIgnored` the message to show. The pasted
 * text itself is dropped on the floor: never stored, never passed on.
 */
export function useListPaste(active: boolean, onIgnored: (message: string) => void): void {
  usePaste((text: string): void => {
    // OMARCHY: boundary cast — the ring only reads key flags, a paste has none
    recordKeyEvent(text, {} as Key, true);
    onIgnored('Paste ignored — press / to search');
  }, { isActive: active });
}
