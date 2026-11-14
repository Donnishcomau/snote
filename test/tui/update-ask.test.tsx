/**
 * Issue #30 L5a2: the U key asks. With an update offer the banner adds `, press U to update`; U opens
 * `Update snote <running> to <new>? (y/n)`; y records the hand-off and quits through the q path; n or Escape changes
 * nothing; other keys are ignored while it is open. No offer (another kind, the check off, non-digit versions): U does nothing.
 * An offer that goes while the question is open closes it, so no key stays held (tests 8 and 9, #905 review).
 */
import * as fs from 'node:fs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { publishBanner, resetBanner } from '../../src/core/update-banner';
import { allowUpdateOffer, handOffRequested, resetUpdateOffer } from '../../src/core/update-offer';
import { keymap } from '../../src/core/keymap';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const ASK = 'Update snote 0.2.11 to 0.2.12? (y/n)';
const TAIL = 'Update available: 0.2.11 -> 0.2.12, press U to update';

function renderApp(onQuit?: () => void) {
  return render(<App store={makeStore({ stubClient: {} })} width={80} height={24} onQuit={onQuit} />);
}

afterEach(() => {
  resetBanner();
  resetUpdateOffer();
});

describe('issue #30 L5a2 the U key asks', () => {
  it('1: WHEN an offer is allowed and a banner `0.2.11` -> `0.2.12` is published THEN the banner reads `Update available: 0.2.11 -> 0.2.12, press U to update` and Escape hides it, and WHEN no offer is allowed THEN it reads `Update available: 0.2.11 -> 0.2.12` without `press U`', async () => {
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const a = renderApp();
    await waitForInput(a.stdin);
    expect(await waitForFrame(a.lastFrame, TAIL)).toContain(TAIL);
    a.stdin.write('\u001b');
    expect(await waitForFrame(a.lastFrame, (f) => !f.includes('Update available'))).not.toContain('Update available');
    a.unmount();
    resetBanner();
    resetUpdateOffer();
    publishBanner('0.2.11', '0.2.12');
    const b = renderApp();
    await waitForInput(b.stdin);
    const plain = await waitForFrame(b.lastFrame, (f) => f.includes('Update available: 0.2.11 -> 0.2.12') && !f.includes('press U'));
    expect({ plain: plain.includes('Update available: 0.2.11 -> 0.2.12'), tail: plain.includes('press U') }).toEqual({ plain: true, tail: false });
    b.unmount();
  });

  it('2: WHEN U is pressed THEN the frame shows `Update snote 0.2.11 to 0.2.12? (y/n)`, and n closes it back to the banner, calls no onQuit and requests no hand-off', async () => {
    const quit = vi.fn();
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const { stdin, lastFrame, unmount } = renderApp(quit);
    await waitForInput(stdin);
    stdin.write('U');
    await waitForFrame(lastFrame, ASK);
    stdin.write('n');
    await waitForFrame(lastFrame, (f) => f.includes(TAIL) && !f.includes('(y/n)'));
    expect({ quit: quit.mock.calls.length, handOff: handOffRequested() }).toEqual({ quit: 0, handOff: null });
    unmount();
  });

  it('3: WHEN the question is open and Escape, then q, then j are pressed THEN Escape closes it without hiding the banner, and while it was open no other key acted (no onQuit, no hand-off)', async () => {
    const quit = vi.fn();
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const { stdin, lastFrame, unmount } = renderApp(quit);
    await waitForInput(stdin);
    stdin.write('U');
    await waitForFrame(lastFrame, ASK);
    stdin.write('q');
    stdin.write('j');
    await waitForFrame(lastFrame, ASK);
    stdin.write('\u001b');
    await waitForFrame(lastFrame, (f) => f.includes(TAIL) && !f.includes('(y/n)'));
    expect({ quit: quit.mock.calls.length, handOff: handOffRequested() }).toEqual({ quit: 0, handOff: null });
    unmount();
  });

  it('4: WHEN U then y are pressed THEN onQuit (the function `q` calls) runs once and the plugin hand-off is requested', async () => {
    const quit = vi.fn();
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const { stdin, lastFrame, unmount } = renderApp(quit);
    await waitForInput(stdin);
    stdin.write('U');
    await waitForFrame(lastFrame, ASK);
    stdin.write('y');
    await vi.waitFor(() => expect({ quit: quit.mock.calls.length, handOff: handOffRequested() }).toEqual({ quit: 1, handOff: 'plugin' }));
    unmount();
  });

  it('5: WHEN q is pressed with an offer showing THEN onQuit runs and no hand-off is requested', async () => {
    const quit = vi.fn();
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const { stdin, lastFrame, unmount } = renderApp(quit);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, TAIL);
    stdin.write('q');
    await vi.waitFor(() => expect({ quit: quit.mock.calls.length, handOff: handOffRequested() }).toEqual({ quit: 1, handOff: null }));
    unmount();
  });

  it('6: WHEN no offer is allowed (another install kind, or the check off or disabled) or a published version is `0.2.12; rm -rf ~` THEN U opens no question and Help still lists `U` with `Update snote (when offered)`, and the keymap holds `U` once', async () => {
    for (const [allowed, available] of [[false, '0.2.12'], [true, '0.2.12; rm -rf ~']] as const) {
      if (allowed) allowUpdateOffer('plugin');
      publishBanner('0.2.11', available);
      const { stdin, lastFrame, unmount } = renderApp();
      await waitForInput(stdin);
      stdin.write('U');
      stdin.write('?');
      const help = await waitForFrame(lastFrame, (f) => f.includes('Update snote (when offered)') && !f.includes('(y/n)'));
      expect({ available, help: help.includes('Update snote (when offered)'), ask: help.includes('(y/n)') }).toEqual({ available, help: true, ask: false });
      unmount();
      resetBanner();
      resetUpdateOffer();
    }
    expect(keymap.filter((k) => k.key === 'U')).toEqual([{ key: 'U', action: 'update_snote', description: 'Update snote (when offered)' }]);
  });

  it('7: WHEN src/tui/update-ask.tsx is read THEN it starts no process (no `child_process`, `spawn` or `exec`) and imports neither install-kind nor update-handoff', () => {
    const text = fs.readFileSync('src/tui/update-ask.tsx', 'utf8');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/child_process|spawn|exec|install-kind|update-handoff/);
  });

  it('8: WHEN the question is open and the offer goes (a published version `0.2.12; rm -rf ~`) THEN the question closes to the plain banner, a newer offer `0.2.13` shows its banner and not the question, and q then runs onQuit once with no hand-off', async () => {
    const quit = vi.fn();
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const { stdin, lastFrame, unmount } = renderApp(quit);
    await waitForInput(stdin);
    stdin.write('U');
    await waitForFrame(lastFrame, ASK);
    publishBanner('0.2.11', '0.2.12; rm -rf ~');
    const gone = await waitForFrame(lastFrame, (f) => f.includes('Update available: 0.2.11 -> 0.2.12; rm') && !f.includes('(y/n)'));
    expect({ banner: gone.includes('Update available: 0.2.11 -> 0.2.12; rm'), ask: gone.includes('(y/n)') }).toEqual({ banner: true, ask: false });
    publishBanner('0.2.11', '0.2.13');
    const newer = await waitForFrame(lastFrame, (f) => f.includes('Update available: 0.2.11 -> 0.2.13, press U to update') && !f.includes('(y/n)'));
    expect({ tail: newer.includes('0.2.13, press U to update'), ask: newer.includes('(y/n)') }).toEqual({ tail: true, ask: false });
    stdin.write('q');
    await vi.waitFor(() => expect({ quit: quit.mock.calls.length, handOff: handOffRequested() }).toEqual({ quit: 1, handOff: null }));
    unmount();
  });

  it('9: WHEN the question for `0.2.13` is open and the offer goes with no redraw (the dismissed `0.2.12` is published again) THEN the first q only closes the question (no onQuit, no hand-off) and the second q runs onQuit once', async () => {
    const quit = vi.fn();
    allowUpdateOffer('plugin');
    publishBanner('0.2.11', '0.2.12');
    const { stdin, lastFrame, unmount } = renderApp(quit);
    await waitForInput(stdin);
    await waitForFrame(lastFrame, TAIL);
    stdin.write('\u001b');
    await waitForFrame(lastFrame, (f) => !f.includes('Update available'));
    publishBanner('0.2.11', '0.2.13');
    await waitForFrame(lastFrame, 'Update available: 0.2.11 -> 0.2.13, press U to update');
    stdin.write('U');
    await waitForFrame(lastFrame, 'Update snote 0.2.11 to 0.2.13? (y/n)');
    publishBanner('0.2.11', '0.2.12');
    stdin.write('q');
    const closed = await waitForFrame(lastFrame, (f) => !f.includes('(y/n)'));
    expect({ ask: closed.includes('(y/n)'), quit: quit.mock.calls.length, handOff: handOffRequested() }).toEqual({ ask: false, quit: 0, handOff: null });
    stdin.write('q');
    await vi.waitFor(() => expect({ quit: quit.mock.calls.length, handOff: handOffRequested() }).toEqual({ quit: 1, handOff: null }));
    unmount();
  });
});
