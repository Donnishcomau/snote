/**
 * Issue #30 L5b: the bar's update ask opens the SAME question as the U key (L5a2), only while the list is idle and an
 * offer stands, and ignores every key for 300 ms after it opened. The request alone requests no hand-off (I1).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { publishBanner, resetBanner } from '../../src/core/update-banner';
import { allowUpdateOffer, handOffRequested, resetUpdateOffer } from '../../src/core/update-offer';
import { openUpdateAskFromBar, updateAskOpen } from '../../src/tui/update-ask';
import { getKeyLog, resetKeyLog } from '../../src/tui/app-keys';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const ASK = 'Update snote 0.2.11 to 0.2.12? (y/n)';
const TAIL = 'Update available: 0.2.11 -> 0.2.12, press U to update';

function renderApp(onQuit?: () => void) {
  return render(<App store={makeStore({ stubClient: {} })} width={80} height={24} onQuit={onQuit} />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetBanner();
  resetUpdateOffer();
});

describe('issue #30 L5b the bar ask opens the U question', () => {
  it('7: WHEN the bar ask arrives while an update is offered and the list is idle THEN the frame shows `Update snote 0.2.11 to 0.2.12? (y/n)` with no hand-off requested; a y inside 300 ms of the open does nothing (n then closes it), and on the next ask a y after 300 ms calls onQuit once and requests the plugin hand-off', async () => {
    const quit = vi.fn();
    const real = Date.now.bind(Date);
    let skew = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => real() + skew);
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const { stdin, lastFrame, unmount } = renderApp(quit);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, TAIL);
    openUpdateAskFromBar();
    await waitForFrame(lastFrame, ASK);
    const asked = handOffRequested();
    skew = -1000;
    resetKeyLog();
    stdin.write('y');
    await vi.waitFor(() => expect(getKeyLog().length).toBe(1)); // App logs the key after UpdateAsk's handler saw it
    skew = 1000;
    stdin.write('n');
    await waitForFrame(lastFrame, (f) => f.includes(TAIL) && !f.includes('(y/n)'));
    const early = { quit: quit.mock.calls.length, handOff: handOffRequested() };
    skew = 0;
    openUpdateAskFromBar();
    await waitForFrame(lastFrame, ASK);
    skew = 1000;
    stdin.write('y');
    await waitForFrame(lastFrame, () => quit.mock.calls.length > 0);
    expect({ asked, early, quit: quit.mock.calls.length, handOff: handOffRequested() }).toEqual({ asked: null, early: { quit: 0, handOff: null }, quit: 1, handOff: 'plugin' });
    unmount();
  });

  it('8: WHEN the search box is open, or Help is shown, or no offer is allowed (the update check off, or an install that is not offered updates) THEN the bar ask opens no question, and none is open after Help closes', async () => {
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const a = renderApp();
    await waitForInput(a.stdin);
    await waitForFrame(a.lastFrame, TAIL);
    a.stdin.write('/');
    await waitForFrame(a.lastFrame, 'search: ');
    openUpdateAskFromBar();
    expect(updateAskOpen()).toBe(false);
    a.stdin.write('\u001b');
    await waitForFrame(a.lastFrame, (f) => !f.includes('search: '));
    a.stdin.write('?');
    await waitForFrame(a.lastFrame, 'Show this help');
    openUpdateAskFromBar();
    expect(updateAskOpen()).toBe(false);
    a.stdin.write('\u001b');
    await waitForFrame(a.lastFrame, (f) => !f.includes('Show this help'));
    expect(await waitForFrame(a.lastFrame, (f) => f.includes('Update available') || f.includes('(y/n)'))).not.toContain('(y/n)');
    a.unmount();
    resetUpdateOffer();
    const b = renderApp();
    await waitForInput(b.stdin);
    await waitForFrame(b.lastFrame, 'Update available: 0.2.11 -> 0.2.12');
    openUpdateAskFromBar();
    expect(updateAskOpen()).toBe(false);
    b.unmount();
  });

  it('9: WHEN U opens the question in a 30x12 terminal THEN the frame is at most 12 lines and shows `(y/n)` (#932)', async () => {
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const { stdin, stdout, lastFrame } = render(<App store={makeStore({ stubClient: {} })} width={30} height={12} />);
    Object.defineProperty(stdout, 'columns', { get: () => 30, configurable: true });
    Object.defineProperty(stdout, 'rows', { get: () => 12, configurable: true });
    stdout.emit('resize');
    await waitForInput(stdin);
    stdin.write('U');
    const f = await waitForFrame(lastFrame, 'Update snote');
    expect({ lines: f.split('\n').length <= 12, width: f.split('\n').every((l) => l.length <= 30), yn: f.includes('(y/n)') }).toEqual({ lines: true, width: true, yn: true });
  });

  it('12: WHEN the bar ask has opened the question and, with the injected clock moved past its key guard, a second bar ask arrives while it is still open THEN a y right after that second ask calls onQuit once and requests the plugin hand-off (the second ask does not restart the key guard)', async () => {
    const quit = vi.fn();
    const real = Date.now.bind(Date);
    let skew = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => real() + skew);
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const { stdin, lastFrame, unmount } = renderApp(quit);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, TAIL);
    openUpdateAskFromBar();
    await waitForFrame(lastFrame, ASK);
    skew = 1000;
    openUpdateAskFromBar();
    resetKeyLog();
    stdin.write('y');
    await vi.waitFor(() => expect(getKeyLog().length).toBe(1)); // App logs the key after UpdateAsk's handler saw it
    expect({ quit: quit.mock.calls.length, handOff: handOffRequested() }).toEqual({ quit: 1, handOff: 'plugin' });
    unmount();
  });
});
