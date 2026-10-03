/**
 * T315.1 — standalone vet harness for `react-ink-textarea` 0.4.0. Not wired
 * to any snote component yet: this proves the library itself handles the
 * cases the built-in editor will need (10,000-line virtualization,
 * bracketed-paste multi-line insert, grapheme-aware backspace, undo, and
 * that Ctrl+S reaches a `useInput` handler under Ink's own raw-mode fake
 * stdin) before any product code depends on it.
 *
 * Acceptance line 5's manual-`foot` check: NOT performed in this session
 * (no interactive terminal available in this sandboxed environment). Only
 * the ink-testing-library / node-pty raw-mode path below was verified for
 * real. See the test body for exactly what was and was not proven.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { useInput } from 'ink';
import React from 'react';
import { TextArea } from 'react-ink-textarea';

// T315.1 found that `react-ink-textarea`'s package.json "development"
// export condition (its raw, untranspiled TS source) renders a dead
// <TextArea> under plain `vitest run`. T315.2 fixed this at the root with
// a `vitest.config.ts` alias that points the bare `react-ink-textarea`
// specifier straight at the package's built `dist/index.js` — the same
// file esbuild's own bundling of the real CLI already resolves to. All 5
// cases below now use the ordinary bare import; case 6 is new and asserts
// directly that the alias is doing its job (a live, responsive component),
// so a future revert of that alias fails loudly here rather than silently.

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

async function waitFor(predicate: () => boolean, maxMs = 1500, intervalMs = 15): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

describe('T315.1 vet react-ink-textarea', () => {
  it('1: WHEN a `<TextArea>` is rendered with `value` set to a 10,000-line string (each line `line ${i}`) and `viewportLines` set to `20` THEN `lastFrame()` contains fewer than `25` newline-separated rows', async () => {
    const value = Array.from({ length: 10000 }, (_, i) => `line ${i}`).join('\n');
    const { lastFrame } = render(
      <TextArea
        focus={false}
        onSubmit={() => {}}
        value={value}
        cursorPosition={[0, 0]}
        onChange={() => {}}
        viewportLines={20}
      />
    );

    await waitFor(() => (lastFrame() ?? '').includes('line 0'));

    const frame = lastFrame() ?? '';
    expect(frame).toContain('line 0');
    const rows = frame.split('\n');
    expect(rows.length).toBeLessThan(25);
  });

  it('2: WHEN the bracketed-paste sequence `\\x1b[200~line1\\nline2\\nline3\\x1b[201~` is written to `stdin` THEN the `onChange` value passed out contains `line1`, `line2`, and `line3` each on their own line', async () => {
    const onChange = vi.fn();
    const { stdin } = render(<TextArea focus={true} onSubmit={() => {}} onChange={onChange} />);

    stdin.write(`${PASTE_START}line1\nline2\nline3${PASTE_END}`);

    await waitFor(() => onChange.mock.calls.length > 0);

    const lastValue = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string;
    const lines = lastValue.split('\n');
    expect(lines).toContain('line1');
    expect(lines).toContain('line2');
    expect(lines).toContain('line3');
  });

  it('3: WHEN the text `a🇯🇵` is set as `value` with `cursorPosition` after the flag emoji and Backspace (`\\x7F`) is written THEN the resulting `onChange` value is `a` (the whole grapheme is removed, not a broken half-codepoint)', async () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <TextArea
        focus={true}
        onSubmit={() => {}}
        value={'a🇯🇵'}
        cursorPosition={[0, 5]}
        onChange={onChange}
      />
    );

    stdin.write('\x7F');

    await waitFor(() => onChange.mock.calls.length > 0);

    expect(onChange).toHaveBeenLastCalledWith('a');
  });

  it('4: WHEN `Ctrl+Z` is written after an insert THEN the value reported by `onChange` reverts to the pre-insert string', async () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <TextArea focus={true} onSubmit={() => {}} onChange={onChange} undoGroupDelay={0} />
    );

    stdin.write('a');
    await waitFor(() => onChange.mock.calls.length >= 1);
    expect(onChange).toHaveBeenLastCalledWith('a');

    onChange.mockClear();

    stdin.write('\x1a'); // Ctrl+Z
    await waitFor(() => onChange.mock.calls.length >= 1);

    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it("5: WHEN a fake raw-mode stdin harness writes `\\x13` (Ctrl+S) THEN `useInput`'s callback receives `key.ctrl === true` and `input === 's'`", async () => {
    // This proves only that ink-testing-library's fake stdin, in raw mode,
    // delivers Ctrl+S to useInput without the keystroke being eaten first
    // (e.g. by XON/XOFF flow control, which only exists on a real PTY, or
    // by react-ink-textarea's own input handler, which early-returns on
    // key.ctrl before this assertion could ever see it misrouted).
    // ink-testing-library's fake stdin has no termios/IXON layer at all, so
    // it cannot prove real-terminal flow-control behaviour one way or the
    // other — that remains unverified in this session; no `foot` terminal
    // was available to drive this check interactively. Task 3 should treat
    // Ctrl+S as the save key provisionally and keep Ctrl+X/F2 as a
    // documented one-line fallback if a real-terminal check later finds it
    // swallowed.
    const received: { ctrl: boolean; input: string }[] = [];

    function Harness(): React.ReactElement {
      useInput((input, key) => {
        received.push({ ctrl: key.ctrl, input });
      });
      return <TextArea focus={true} onSubmit={() => {}} />;
    }

    const { stdin } = render(<Harness />);

    stdin.write('\x13');

    await waitFor(() => received.length > 0);

    expect(received[0].ctrl).toBe(true);
    expect(received[0].input).toBe('s');
  });

  it("6: WHEN `<TextArea>` is rendered via the bare `react-ink-textarea` import (not a relative dist path) with value `seed` THEN `lastFrame()` is non-empty and contains `seed`, and WHEN `x` is then written to `stdin` THEN `onChange` fires with a value containing `x` (proves the vitest.config.ts alias resolves the bare specifier to a live, responsive component, not the dead development-condition source)", async () => {
    const onChange = vi.fn();
    const { stdin, lastFrame } = render(
      <TextArea focus={true} onSubmit={() => {}} value="seed" cursorPosition={[0, 4]} onChange={onChange} />
    );

    await waitFor(() => (lastFrame() ?? '').includes('seed'));
    expect(lastFrame()).toBeTruthy();
    expect(lastFrame()).toContain('seed');

    stdin.write('x');
    await waitFor(() => onChange.mock.calls.length > 0);

    expect(onChange).toHaveBeenCalled();
    const lastValue = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string;
    expect(lastValue).toContain('x');
  });
});
