import * as fs from 'node:fs';
import * as path from 'node:path';
import React, { useRef, useState } from 'react';
import { useInput } from 'ink';

import { blogOriginFromEnv } from '../core/blog-origin';
import { loadBlogSend } from '../core/blog-status';
import { dataRoot } from '../core/data-root';
import { useReadGate } from './read-gate';

export interface BlogSendAskActions {
  onYes: () => void;
  onNo: () => void;
}

export type BlogPhase =
  | { kind: 'origin' }
  | { kind: 'token'; origin: string }
  | { kind: 'send' }
  | { kind: 'resend' };

interface BlogSendAskState {
  blogSendAsk: null | BlogSendAskActions;
  setBlogSendAsk: (v: null | BlogSendAskActions) => void;
  closeBlogSend: () => void;
  blogOpen: boolean;
}

// the send-to-blog question (`b`), a module cell like exportAskRef,
// so App/handleNoteKey can open it while BottomArea renders and closes it.
const cell: { current: BlogSendAskState } = {
  current: {
    blogSendAsk: null,
    setBlogSendAsk: () => {},
    closeBlogSend: () => {},
    blogOpen: false,
  },
};

export function useBlogSendAsk(): BlogSendAskState {
  return cell.current;
}

/**
 * Owns the send-to-blog question state for BottomArea.
 *
 * The Confirm's onNo runs inside Ink's useInput dispatch, where a setState
 * is lost before React commits the unmount, so the close is routed through
 * an effect: setCloseTick wakes React, the effect reads the flag and closes
 * the question after the commit.
 *
 * The `send`/`resend` y/n keys are handled here, not by a freshly-mounted
 * <Confirm>: Ink's own useInput registers its listener in a passive effect,
 * so a Confirm that mounts fresh on every open has a brief window, right
 * after opening, where a fast second `y` (send, then immediately resend)
 * is silently dropped. This hook's own useInput is called unconditionally
 * on every render, so it is registered once, when BottomArea first mounts,
 * well before any key is pressed — no reopen ever re-registers it.
 */
export function useBlogSendAskState(
  noteId: string | null,
  content: string,
  setNotice: (message: string) => void,
  setNoticeError: (message: string) => void,
): {
  phase: BlogPhase | null;
  request: (next: BlogPhase | 'close') => void;
} {
  const [phase, setPhase] = useState<BlogPhase | null>(null);
  const pending = useRef<BlogPhase | 'close' | null>(null);
  const [tick, setTick] = useState(0);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;
  const contentRef = useRef(content);
  contentRef.current = content;

  // Prompt handlers run inside Ink's useInput, which drops a setState that
  // unmounts the prompt. A tick survives; the effect applies the next phase.
  React.useLayoutEffect(() => {
    if (tick === 0) return;
    const next = pending.current;
    // A second run of this effect (same tick) has already consumed `pending`.
    // Treating that as "close" drops the origin/token prompt.
    if (next === null) return;
    pending.current = null;
    setPhase(next === 'close' ? null : next);
  }, [tick]);

  const request = (next: BlogPhase | 'close') => {
    pending.current = next;
    setTick((t) => t + 1);
  };

  // the send/resend question is a y/n confirm of the
  // read gate, so only a read that is exactly one key answers it
  useReadGate({ confirm: phase?.kind === 'send' || phase?.kind === 'resend' });
  // Always registered (see the doc comment above): only acts while `phase`
  // is `send` or `resend`, a no-op otherwise.
  useInput((input, key) => {
    if (phase?.kind !== 'send' && phase?.kind !== 'resend') return;
    const resend = phase.kind === 'resend';
    if (key.escape || input === 'n' || input === 'N') {
      request('close');
      return;
    }
    if (input === 'y' || input === 'Y') {
      request('close');
      const id = noteIdRef.current;
      if (!id) return;
      const dir = dataRoot();
      // Issue 235: the question said "send" because no record existed when `b`
      // opened it; if a send finished while it was open a record exists now,
      // and force=false would come back { already: true } having asked the
      // server nothing. Re-decide at `y`: this answer sends a draft.
      const force = resend || Boolean(loadBlogSend(dir, id));
      // snote-diet: the send code loads only when a send is confirmed.
      import('../core/blog-send').then((m) => m.sendNoteToBlog({
        dir,
        noteId: id,
        content: contentRef.current,
        force,
        now: new Date().toISOString(),
      })).then(
        () => setNotice('draft sent to your blog'),
        (error: unknown) => {
          const msg = error instanceof Error ? error.message.trim().toLowerCase() : '';
          setNoticeError(msg !== '' ? msg : 'send to blog failed');
        },
      );
    }
  });

  const setBlogSendAsk = (v: BlogSendAskActions | null) => {
    if (v === null) {
      request('close');
      return;
    }
    const dir = dataRoot();
    const configured = fs.existsSync(path.join(dir, 'blog.json'));
    const id = noteIdRef.current;
    if (!configured) request({ kind: 'token', origin: blogOriginFromEnv(process.env) });
    else if (id && loadBlogSend(dir, id)) request({ kind: 'resend' });
    else request({ kind: 'send' });
  };

  const closeBlogSend = () => request('close');
  cell.current = {
    blogSendAsk: phase ? { onYes: () => {}, onNo: closeBlogSend } : null,
    setBlogSendAsk,
    closeBlogSend,
    blogOpen: phase !== null,
  };
  return { phase, request };
}
