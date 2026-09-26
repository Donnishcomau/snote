import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Prompt, Confirm } from '../../src/tui/Prompt';

describe('Prompt and Confirm components', () => {
  it('1: WHEN the Prompt is rendered THEN the frame contains "rename tag: work" and no callback was called', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { lastFrame, unmount } = render(
      <Prompt label="rename tag" initial="work" onSubmit={onSubmit} onCancel={onCancel} />
    );

    await new Promise(r => setTimeout(r, 50));

    expect(lastFrame()).toContain('rename tag: work');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    unmount();
  });

  it('2: WHEN backspace 6 times then job THEN the frame contains "rename tag: job"; WHEN a space and \\r follow THEN onSubmit was called exactly once with "job" and onCancel 0 times', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <Prompt label="rename tag" initial="work" onSubmit={onSubmit} onCancel={onCancel} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Send 6 backspaces (more than "work" length of 4)
    for (let i = 0; i < 6; i++) {
      stdin.write('\x7f');
      await new Promise(r => setTimeout(r, 0));
    }

    // Type "job"
    stdin.write('job');
    await new Promise(r => setTimeout(r, 0));

    expect(lastFrame()).toContain('rename tag: job');

    // Send space and return
    stdin.write(' ');
    await new Promise(r => setTimeout(r, 0));
    stdin.write('\r');
    await new Promise(r => setTimeout(r, 0));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('job');
    expect(onCancel).not.toHaveBeenCalled();

    unmount();
  });

  it('3: WHEN \\r is sent with the text unchanged THEN onCancel was called exactly once and onSubmit 0 times; the same holds WHEN the text was first emptied with 4 backspaces', async () => {
    // Case A: return with unchanged text
    const onSubmitA = vi.fn();
    const onCancelA = vi.fn();

    const { stdin: stdinA, unmount: unmountA } = render(
      <Prompt label="rename tag" initial="work" onSubmit={onSubmitA} onCancel={onCancelA} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdinA.write('\r');
    await new Promise(r => setTimeout(r, 0));

    expect(onCancelA).toHaveBeenCalledTimes(1);
    expect(onSubmitA).not.toHaveBeenCalled();

    unmountA();

    // Case B: empty with backspaces then return
    const onSubmitB = vi.fn();
    const onCancelB = vi.fn();

    const { stdin: stdinB, unmount: unmountB } = render(
      <Prompt label="rename tag" initial="work" onSubmit={onSubmitB} onCancel={onCancelB} />
    );

    await new Promise(r => setTimeout(r, 50));

    // 4 backspaces to empty
    for (let i = 0; i < 4; i++) {
      stdinB.write('\x7f');
      await new Promise(r => setTimeout(r, 0));
    }

    stdinB.write('\r');
    await new Promise(r => setTimeout(r, 0));

    expect(onCancelB).toHaveBeenCalledTimes(1);
    expect(onSubmitB).not.toHaveBeenCalled();

    unmountB();
  });

  it('4: WHEN zz and then \\u001b are sent to the Prompt and 50 ms have passed THEN onCancel was called exactly once and onSubmit 0 times', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { stdin, lastFrame, unmount } = render(
      <Prompt label="rename tag" initial="work" onSubmit={onSubmit} onCancel={onCancel} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin.write('zz');
    await new Promise(r => setTimeout(r, 0));

    expect(lastFrame()).toContain('rename tag: workzz');

    stdin.write('\u001b');
    await new Promise(r => setTimeout(r, 50));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    unmount();
  });

  it('5: WHEN the Confirm is rendered THEN the frame contains "delete tag work? y/n"; WHEN y is sent THEN onYes was called exactly once and onNo 0 times; on a fresh Confirm Y does the same', async () => {
    // Case A: initial render
    const onSubmitA = vi.fn();
    const onCancelA = vi.fn();

    const { lastFrame: lastFrameA, unmount: unmountA } = render(
      <Prompt label="rename tag" initial="work" onSubmit={onSubmitA} onCancel={onCancelA} />
    );

    await new Promise(r => setTimeout(r, 50));

    // Now test Confirm
    const onYes = vi.fn();
    const onNo = vi.fn();

    const { lastFrame: lastFrameB, stdin, unmount: unmountB } = render(
      <Confirm question="delete tag work?" onYes={onYes} onNo={onNo} />
    );

    await new Promise(r => setTimeout(r, 50));

    expect(lastFrameB()).toContain('delete tag work? y/n');

    // Send y
    stdin.write('y');
    await new Promise(r => setTimeout(r, 0));

    expect(onYes).toHaveBeenCalledTimes(1);
    expect(onNo).not.toHaveBeenCalled();

    unmountA();
    unmountB();
  });

  it('5 (continued): on a fresh Confirm Y does the same', async () => {
    const onYes = vi.fn();
    const onNo = vi.fn();

    const { stdin, unmount } = render(
      <Confirm question="delete tag work?" onYes={onYes} onNo={onNo} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdin.write('Y');
    await new Promise(r => setTimeout(r, 0));

    expect(onYes).toHaveBeenCalledTimes(1);
    expect(onNo).not.toHaveBeenCalled();

    unmount();
  });

  it('6: WHEN x and then n are sent to the Confirm THEN onYes was called 0 times and onNo exactly once; on a fresh Confirm \\u001b (wait 50 ms) also calls onNo exactly once', async () => {
    // Case A: x then n
    const onYesA = vi.fn();
    const onNoA = vi.fn();

    const { stdin: stdinA, unmount: unmountA } = render(
      <Confirm question="delete tag work?" onYes={onYesA} onNo={onNoA} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdinA.write('x');
    await new Promise(r => setTimeout(r, 0));

    stdinA.write('n');
    await new Promise(r => setTimeout(r, 0));

    expect(onYesA).not.toHaveBeenCalled();
    expect(onNoA).toHaveBeenCalledTimes(1);

    unmountA();

    // Case B: Escape
    const onYesB = vi.fn();
    const onNoB = vi.fn();

    const { stdin: stdinB, unmount: unmountB } = render(
      <Confirm question="delete tag work?" onYes={onYesB} onNo={onNoB} />
    );

    await new Promise(r => setTimeout(r, 50));

    stdinB.write('\u001b');
    await new Promise(r => setTimeout(r, 50));

    expect(onYesB).not.toHaveBeenCalled();
    expect(onNoB).toHaveBeenCalledTimes(1);

    unmountB();
  });
});
