/**
 * #637: the one-line Prompt (export path, rename tag, check item) edits at a
 * cursor: Left/Right, Home/End, Ctrl+A/Ctrl+E, Backspace before the cursor,
 * Delete at it, Ctrl+U clears, typing inserts at it; an unchanged Enter calls
 * onKeep when given. Steps are whole characters (an emoji is one) and
 * every shown part is sanitised.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Prompt } from '../../src/tui/Prompt';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const LEFT = '\x1b[D';
const UP = '\x1b[A';
const DOWN = '\x1b[B';
const HOME = '\x1b[H';
const END = '\x1b[F';
const DEL = '\x1b[3~';
const BS = '\x7f';

async function open(initial: string, extra: { onKeep?: () => void } = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const r = render(<Prompt label="rename tag" initial={initial} onSubmit={onSubmit} onCancel={onCancel} {...extra} />);
  await waitForInput(r.stdin);
  return { ...r, onSubmit, onCancel };
}

// each key is its own write; the text a key produces is waited for before the next
async function keys(r: { stdin: { write: (s: string) => void }; lastFrame: () => string | undefined }, steps: [string, string | null][]) {
  for (const [k, want] of steps) {
    r.stdin.write(k);
    if (want !== null) await waitForFrame(r.lastFrame, `rename tag: ${want}`);
  }
}

describe('#637 the prompt edits at a cursor', () => {
  it('1: WHEN `ab.md` gets Left x3, Backspace, `X`, `Y` and Enter THEN onSubmit is called once with `aXY.md`', async () => {
    const r = await open('ab.md');
    await keys(r, [[LEFT, null], [LEFT, null], [LEFT, null], [BS, 'a.md'], ['X', 'aX.md'], ['Y', 'aXY.md']]);
    r.stdin.write('\r');
    await vi.waitFor(() => expect(r.onSubmit).toHaveBeenCalledTimes(1));
    expect(r.onSubmit).toHaveBeenCalledWith('aXY.md');
    r.unmount();
  });

  it('2: WHEN `ab.md` gets Home, Delete, `Z`, End, `q`, Ctrl+A, `<`, Ctrl+E, `>` and Enter THEN onSubmit is called once with `<Zb.mdq>`', async () => {
    const r = await open('ab.md');
    await keys(r, [[HOME, null], [DEL, 'b.md'], ['Z', 'Zb.md'], [END, null], ['q', 'Zb.mdq'], ['\x01', null], ['<', '<Zb.mdq'], ['\x05', null], ['>', '<Zb.mdq>']]);
    r.stdin.write('\r');
    await vi.waitFor(() => expect(r.onSubmit).toHaveBeenCalledTimes(1));
    expect(r.onSubmit).toHaveBeenCalledWith('<Zb.mdq>');
    r.unmount();
  });

  it('3: WHEN `ab` gets Ctrl+U, `n`, Up, Down, `x` and Enter THEN onSubmit is called once with `nx`', async () => {
    const r = await open('ab');
    await keys(r, [['\x15', null], ['n', 'n'], [UP, null], [DOWN, null], ['x', 'nx']]);
    r.stdin.write('\r');
    await vi.waitFor(() => expect(r.onSubmit).toHaveBeenCalledTimes(1));
    expect(r.onSubmit).toHaveBeenCalledWith('nx');
    r.unmount();
  });

  it('4: WHEN onKeep is given and Enter is pressed on the unchanged text THEN onKeep is called once and onSubmit and onCancel never; WHEN a fresh one gets Backspace and Escape THEN onCancel is called once and onKeep never', async () => {
    const onKeep = vi.fn();
    const a = await open('ab.md', { onKeep });
    a.stdin.write('\r');
    await vi.waitFor(() => expect(onKeep).toHaveBeenCalledTimes(1));
    expect(a.onSubmit).not.toHaveBeenCalled();
    expect(a.onCancel).not.toHaveBeenCalled();
    a.unmount();
    const onKeep2 = vi.fn();
    const b = await open('ab.md', { onKeep: onKeep2 });
    await keys(b, [[BS, null]]);
    b.stdin.write('\x1b');
    await vi.waitFor(() => expect(b.onCancel).toHaveBeenCalledTimes(1));
    expect(onKeep2).not.toHaveBeenCalled();
    expect(b.onSubmit).not.toHaveBeenCalled();
    b.unmount();
  });

  it('5: WHEN `x` and an emoji are typed, then Backspace and Enter THEN onSubmit is called once with exactly `x` (no lone surrogate)', async () => {
    const r = await open('');
    await keys(r, [['x', 'x'], ['\u{1F600}', 'x\u{1F600}'], [BS, null]]);
    r.stdin.write('\r');
    await vi.waitFor(() => expect(r.onSubmit).toHaveBeenCalledTimes(1));
    expect(r.onSubmit).toHaveBeenCalledWith('x');
    r.unmount();
  });

  it('6: WHEN `a\\u202Eb` is pasted and Left is pressed THEN the frame shows `ab` with no U+202E on either side of the cursor', async () => {
    const r = await open('');
    r.stdin.write('a‮b');
    await waitForFrame(r.lastFrame, 'rename tag: ab');
    r.stdin.write(LEFT);
    r.stdin.write('c');
    const frame = await waitForFrame(r.lastFrame, 'rename tag: acb');
    expect(frame).not.toContain('‮');
    r.unmount();
  });
});
