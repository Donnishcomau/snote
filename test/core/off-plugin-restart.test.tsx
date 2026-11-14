/**
 * #443: the plugin clone holds a newer downloaded build. Off
 * the plugin install, restarting snote does not run that build, so the notice
 * is the off-plugin one (no `the bar`, no `omarchy plugin update`); the plugin
 * install keeps its restart notice. The local answer needs no git call.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';

import { runUpdateChecks } from '../../src/core/update-run';
import { currentUpdate, resetUpdateSignal } from '../../src/core/update-signal';
import { pluginCloneDir } from '../../src/core/update-state';
import type { GitRunner } from '../../src/core/update-check';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame } from '../helpers/ink-waits';

const tmps: string[] = [];
afterEach(() => {
  resetUpdateSignal();
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A temp home whose plugin clone holds plugin-dist/VERSION 0.2.4, and a git runner that counts its calls. */
function homeWithNewerClone(): { home: string; run: GitRunner; calls: string[][] } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-offrestart-'));
  tmps.push(home);
  const clone = pluginCloneDir(home);
  fs.mkdirSync(path.join(clone, 'plugin-dist'), { recursive: true });
  fs.writeFileSync(path.join(clone, 'plugin-dist', 'VERSION'), '0.2.4\n');
  const calls: string[][] = [];
  const run: GitRunner = async (args) => {
    calls.push(args);
    return { code: 0, stdout: '' };
  };
  return { home, run, calls };
}

describe('#443 a newer downloaded clone off the plugin install', () => {
  it("1: WHEN the clone holds 0.2.4, snote 0.2.3 runs with `offPlugin: true` THEN currentUpdate() is `{ kind: 'available', offPlugin: true }`, no git call ran, and the App frame shows the off-plugin text with neither `the bar` nor `omarchy plugin update`", async () => {
    const { home, run, calls } = homeWithNewerClone();
    await runUpdateChecks({ version: '0.2.3', home, env: {}, stateDir: path.join(home, 'data'), now: 1000000, run, offPlugin: true });
    expect([currentUpdate(), calls.length]).toEqual([{ kind: 'available', offPlugin: true }, 0]);
    const { lastFrame } = render(<App store={makeStore({ stubClient: {} })} width={100} height={24} />);
    const frame = await waitForFrame(lastFrame, (f) => f.includes('update available: a newer snote is out, see github.com/donnishcomau/snote/releases') && !f.includes('the bar') && !f.includes('omarchy plugin update'));
    expect([frame.includes('a newer snote is out'), frame.includes('the bar'), frame.includes('omarchy plugin update')]).toEqual([true, false, false]);
  });

  it("2: WHEN the same clone and snote 0.2.3 run without `offPlugin` THEN currentUpdate() is `{ kind: 'restart', available: '0.2.4' }` (the plugin notice, unchanged) and no git call ran", async () => {
    const { home, run, calls } = homeWithNewerClone();
    await runUpdateChecks({ version: '0.2.3', home, env: {}, stateDir: path.join(home, 'state'), now: 1000000, run });
    expect([currentUpdate(), calls.length]).toEqual([{ kind: 'restart', available: '0.2.4' }, 0]);
  });
});
