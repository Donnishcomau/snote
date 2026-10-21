/**
 * Issue #83: the running version is shown inside the app. Help's first line is
 * `snote <version>`; the status line ends in `v<version>` at 80 columns or more.
 * main() sets the version once at start; these tests set it the same way.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';

import { main } from '../../src/cli/main';
import { VERSION } from '../../src/cli/version';
import { setShownVersion } from '../../src/core/shown-version';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { Help } from '../../src/tui/Help';
import { StatusBar } from '../../src/tui/StatusBar';
import { waitForFrame, waitForInput } from '../helpers/ink-waits';

const strip = (s: string | undefined): string => (s ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const lines = (s: string | undefined): string[] => strip(s).split('\n');

/** The first line inside the Help box (the line after the top border), border characters and padding removed. */
const firstHelpLine = (frame: string | undefined): string =>
  (lines(frame)[1] ?? '').replace(/[│┌┐└┘─]/g, '').trim();

afterEach(() => setShownVersion(undefined));

describe('issue #83 the running version is shown inside the app', () => {
  it('1: WHEN Help (`?`) is open THEN its first line shows `snote <version>` (the same string `snote --version` prints)', async () => {
    const logged: string[] = [];
    expect(await main(['--version'], { log: (t: string) => logged.push(t) })).toBe(0);
    expect(logged).toEqual([`snote ${VERSION}`]);
    setShownVersion(VERSION);
    // sectioned (80x24), wide (120x40) and the scrolling list (60x20) are the three layouts
    for (const [w, h] of [[80, 24], [120, 40], [60, 20]]) {
      const r = render(<Help width={w} height={h} editor="nvim" />);
      expect(firstHelpLine(r.lastFrame()), `${w}x${h}`).toContain(logged[0]);
      expect(firstHelpLine(r.lastFrame()), `${w}x${h}`).toContain('Help - Keyboard Shortcuts');
      r.unmount();
    }
    // and through the App: `?` opens it
    const store = makeStore({ stubClient: {} });
    const app = render(<App store={store} width={80} height={24} />);
    await waitForInput(app.stdin);
    app.stdin.write('?');
    const frame = await waitForFrame(app.lastFrame, (f) => f.includes('Help - Keyboard Shortcuts') && f.includes(logged[0]));
    expect(firstHelpLine(frame)).toContain(logged[0]);
    app.unmount();
    // main() is what sets it: the call sits between setDataRoot and the render
    const src = readFileSync(join(process.cwd(), 'src', 'cli', 'main.tsx'), 'utf8');
    const set = src.indexOf('setShownVersion(VERSION)');
    expect(set).toBeGreaterThan(src.indexOf('setDataRoot(dataDir)'));
    expect(src.indexOf('const { waitUntilExit, unmount, clear } = render(')).toBeGreaterThan(set);
  });

  it('2: WHEN the list view is shown at 80 columns or wider THEN the status line shows `v<version>` at its right end without wrapping or pushing other status text', async () => {
    setShownVersion(VERSION);
    const tag = `v${VERSION}`;
    for (const w of [80, 100]) {
      const r = render(<StatusBar connected={false} count={4} width={w} />);
      expect(strip(r.lastFrame())).toBe('[offline] 4 notes'.padEnd(w - tag.length) + tag);
      r.unmount();
    }
    const withPending = render(<StatusBar connected={true} count={1} width={80} pending={2} label="trash" />);
    expect(strip(withPending.lastFrame())).toBe('[connected] 1 note 2 pending trash'.padEnd(80 - tag.length) + tag);
    withPending.unmount();
    // no room beside the left text: the tag is left out, nothing is cut or wrapped
    const full = render(<StatusBar connected={false} count={4} width={80} label={'x'.repeat(61)} />);
    expect(strip(full.lastFrame())).toBe('[offline] 4 notes ' + 'x'.repeat(61));
    full.unmount();
    // in the App at 80x24: the status line is the last line that holds the count, ends in the tag and fits
    const store = makeStore({ stubClient: {} });
    const app = render(<App store={store} width={80} height={24} />);
    await waitForInput(app.stdin);
    const frame = await waitForFrame(app.lastFrame, (f) => lines(f).some((l) => l.startsWith('[connecting] 0 notes') && l.trimEnd().endsWith(tag)));
    for (const l of lines(frame)) expect(l.length).toBeLessThanOrEqual(80);
    app.unmount();
  });

  it('3: WHEN the terminal is narrower than 80 columns THEN the status line omits the version and Help still shows it', () => {
    setShownVersion(VERSION);
    for (const w of [79, 60, 40]) {
      const r = render(<StatusBar connected={false} count={4} width={w} />);
      expect(strip(r.lastFrame())).toBe('[offline] 4 notes');
      r.unmount();
    }
    const help = render(<Help width={79} height={24} editor="nvim" />);
    expect(firstHelpLine(help.lastFrame())).toContain(`snote ${VERSION}`);
    help.unmount();
    // before main() sets a version nothing is added anywhere
    setShownVersion(undefined);
    const bare = render(<StatusBar connected={false} count={4} width={100} />);
    expect(strip(bare.lastFrame())).toBe('[offline] 4 notes');
    bare.unmount();
    const bareHelp = render(<Help width={80} height={24} editor="nvim" />);
    expect(firstHelpLine(bareHelp.lastFrame())).toBe('Help - Keyboard Shortcuts');
    bareHelp.unmount();
  });
});
