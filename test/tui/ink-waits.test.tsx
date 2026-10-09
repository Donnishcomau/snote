/**
 * T473 — tests for test/helpers/ink-waits.ts: waitForFrame resolves when
 * a frame matches (string or predicate), rejects with a named error on
 * timeout, and waitForInput waits until Ink's stdin `readable` listener
 * exists so a key written right after is received by `useInput`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text, useInput } from 'ink';
import React from 'react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { waitForFrame, waitForInput } from '../helpers/ink-waits.js';

function Switcher({ afterMs, text }: { afterMs: number; text: string }): React.ReactElement {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setReady(true), afterMs);
    return () => clearTimeout(t);
  }, [afterMs]);
  return <Text>{ready ? text : 'loading'}</Text>;
}

describe('T473 ink-waits helpers', () => {
  it("1: WHEN a component shows `loading` and switches to `ready` after 100 ms THEN `await waitForFrame(lastFrame, 'ready')` resolves with a frame containing `ready`", async () => {
    const { lastFrame } = render(<Switcher afterMs={100} text="ready" />);
    const frame = await waitForFrame(lastFrame, 'ready');
    expect(frame).toContain('ready');
  });

  it("2: WHEN `waitForFrame(lastFrame, (f) => f.includes('ready'))` is used on the same component THEN it resolves with a frame containing `ready`", async () => {
    const { lastFrame } = render(<Switcher afterMs={100} text="ready" />);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('ready'));
    expect(frame).toContain('ready');
  });

  it("3: WHEN the text `never-shown` never appears and `waitForFrame(lastFrame, 'never-shown', 300)` is awaited THEN it rejects within 1000 ms with a message containing `never-shown`", async () => {
    const { lastFrame } = render(<Switcher afterMs={100} text="ready" />);
    const start = Date.now();
    await expect(waitForFrame(lastFrame, 'never-shown', 300)).rejects.toThrow(/never-shown/);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it("4: WHEN a component with `useInput` is rendered and `await waitForInput(stdin)` resolves THEN `stdin.listenerCount('readable')` is greater than `0`, and a `j` written next is received by the component", async () => {
    let received = '';
    function Listener(): React.ReactElement {
      useInput((input) => {
        received += input;
      });
      return <Text>listening</Text>;
    }
    const { stdin, lastFrame } = render(<Listener />);
    await waitForInput(stdin);
    expect(stdin.listenerCount('readable')).toBeGreaterThan(0);
    stdin.write('j');
    await vi.waitFor(() => {
      expect(received).toContain('j');
    });
    expect(lastFrame()).toContain('listening');
  });

  it('5: WHEN test/helpers/ink-waits.ts is read THEN it contains `export async function waitForFrame(` and `export async function waitForInput(` and no `setTimeout(`', async () => {
    const url = new URL('../helpers/ink-waits.ts', import.meta.url);
    const src = await readFile(fileURLToPath(url), 'utf8');
    expect(src).toContain('export async function waitForFrame(');
    expect(src).toContain('export async function waitForInput(');
    expect(src).not.toContain('setTimeout(');
  });
});
