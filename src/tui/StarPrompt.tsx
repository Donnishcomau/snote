// #971: the one star line. Keys are answered in star-prompt.ts. Hooks come from the static host so this file imports no Ink.
import type { ReactNode } from 'react';
import { starAsk, starConsent, starIgnores, starNo, starShows, starYes } from '../core/star-prompt';

export function StarPrompt(p: {
  useReadGate: (role: { confirm: boolean }) => void;
  useInput: (fn: (input: string, key: { escape?: boolean }) => void) => void;
  renderLine: (line: string) => ReactNode;
}): ReactNode {
  const { useReadGate, useInput, renderLine } = p;
  useReadGate({ confirm: starConsent() });
  useInput((input, key) => {
    if (starShows() === '') return;
    if (starIgnores()) return;
    if (starConsent()) {
      if (input === 'y') { void starYes(); return; }
      starNo();
      return;
    }
    starAsk(input, key.escape === true);
  });
  const line = starShows();
  if (line === '') return null;
  return renderLine(line);
}
