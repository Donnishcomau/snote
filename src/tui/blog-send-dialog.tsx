import { Box, Text } from 'ink';
import React from 'react';

import { DEFAULT_BLOG_ORIGIN, saveBlogConfig } from '../core/blog-config';
import { dataRoot } from '../core/data-root';
import { Prompt } from './Prompt';
import type { BlogPhase } from './blog-send-ask';

const SEND_QUESTION = 'Send this note to your blog as a draft?';
const RESEND_QUESTION = 'Already sent as a draft. Send again as a new draft?';

export function BlogSendDialog({
  phase,
  setNoticeError,
  request,
}: {
  phase: BlogPhase;
  setNoticeError: (message: string) => void;
  request: (next: BlogPhase | 'close') => void;
}): React.JSX.Element {
  if (phase.kind === 'origin') {
    return (
      <Prompt
        key="origin"
        label="Blog origin"
        initial=""
        onSubmit={(origin) => request({ kind: 'token', origin })}
        onCancel={() => request('close')}
      />
    );
  }

  if (phase.kind === 'token') {
    const origin = phase.origin;
    const label =
      origin === DEFAULT_BLOG_ORIGIN
        ? 'Skryf token (create one at https://skryf.art/settings/keys)'
        : 'Blog token';
    return (
      <Prompt
        key="token"
        label={label}
        initial=""
        onSubmit={(token) => {
          const dir = dataRoot();
          saveBlogConfig(dir, { origin, token }).then(
            () => request({ kind: 'send' }),
            (error: unknown) => {
              const msg = error instanceof Error ? error.message : 'blog setup failed';
              setNoticeError(msg);
              request('close');
            },
          );
        }}
        onCancel={() => request('close')}
      />
    );
  }

  // T340-401fix: the y/n keys for send/resend are handled by a persistent
  // useInput in useBlogSendAskState (see its doc comment) rather than by a
  // freshly-mounted <Confirm>, so this is display-only.
  const resend = phase.kind === 'resend';
  return (
    <Box>
      <Text>{(resend ? RESEND_QUESTION : SEND_QUESTION) + ' y/n'}</Text>
    </Box>
  );
}
