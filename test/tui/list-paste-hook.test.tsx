import { render } from 'ink-testing-library';
import { Text, useInput } from 'ink';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useListPaste } from '../../src/tui/list-paste';
import { getKeyLog, resetKeyLog } from '../../src/tui/app-keys';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const joinedInputs = (): string => getKeyLog().map((e) => e.input).join('');

function Probe({ active }: { active: boolean }) {
  const [n, setN] = useState('');
  useListPaste(active, setN);
  // raw mode only, so Ink attaches its stdin reader even while the paste
  // hook is inactive; the handler ignores every key (as App would, per T482)
  useInput(() => {}, { isActive: true });
  return <Text>{n || 'idle'}</Text>;
}

describe('list paste hook ignores a bracketed paste (T481)', () => {
  beforeEach(() => {
    resetKeyLog();
  });

  it("1: WHEN `Probe` is rendered with `active` true and `\\x1b[200~dDxL hunter2\\x1b[201~` is written THEN the frame contains `Paste ignored — press / to search`, the last ring input is `<text>`, and no ring input contains `hunter2`", async () => {
    const { stdin, lastFrame } = render(<Probe active={true} />);
    await waitForInput(stdin);

    stdin.write('\x1b[200~dDxL hunter2\x1b[201~');

    await waitForFrame(lastFrame, 'Paste ignored — press / to search');

    await vi.waitFor(
      () => {
        const log = getKeyLog();
        expect(log.length).toBe(1);
        expect(log[log.length - 1].input).toBe('<text>');
        expect(joinedInputs()).not.toContain('hunter2');
      },
      { timeout: 2000, interval: 10 },
    );
  });

  it("2: WHEN `Probe` is rendered with `active` false and the same paste is written THEN the frame contains `idle` and the ring has no entry", async () => {
    const { stdin, lastFrame } = render(<Probe active={false} />);
    await waitForInput(stdin);

    stdin.write('\x1b[200~dDxL hunter2\x1b[201~');

    await waitForFrame(lastFrame, 'idle');

    await vi.waitFor(
      () => {
        expect(lastFrame()).toContain('idle');
        expect(getKeyLog().length).toBe(0);
      },
      { timeout: 2000, interval: 10 },
    );
  });

  it('3: WHEN src/tui/list-paste.ts is read THEN it contains `export function useListPaste(` and `usePaste(` and does not contain `useInput(`', () => {
    const src = read('src/tui/list-paste.ts');
    expect(src).toContain('export function useListPaste(');
    expect(src).toContain('usePaste(');
    expect(src).not.toContain('useInput(');
  });
});
