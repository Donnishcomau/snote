import { usePaste } from 'ink';

import type { Key } from 'ink';

import { recordKeyEvent } from './app-keys';

/**
 * the notes list refuses a bracketed paste instead of replaying it
 * key by key. While `active` is true the hook claims Ink's paste channel
 * (usePaste is active, so App does not see the text on the input channel),
 * records one ring entry in text mode — the ring stores it as '<text>',
 * never verbatim — and hands `onIgnored` the message to show. The pasted
 * text itself is dropped on the floor while `active`: it is not stored or
 * passed on. If the list leaves while a paste waits in the read gate, the
 * gate hands the text to the input channel (read-gate.ts `emit`), into the
 * text mode then on screen; the key ring masks it as '<text>' either way.
 */
export function useListPaste(active: boolean, onIgnored: (message: string) => void): void {
  usePaste((text: string): void => {
    // OMARCHY: boundary cast — the ring only reads key flags, a paste has none
    recordKeyEvent(text, {} as Key, true);
    onIgnored('Paste ignored — press / to search');
  }, { isActive: active });
}
