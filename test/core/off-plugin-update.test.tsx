/**
 * #443: an install that is not the Omarchy plugin keeps its update cache in
 * snote's own data folder (nothing creates `omarchy-snote-plugin`), and its
 * update notice never says `omarchy plugin update`. A plugin install keeps
 * today's folder and text. No network: the git runner is a fake.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';

import { updateStateDir, type InstallKind } from '../../src/core/install-kind';
import { runUpdateChecks } from '../../src/core/update-run';
import { currentUpdate, publishUpdate, resetUpdateSignal } from '../../src/core/update-signal';
import { pluginCloneDir } from '../../src/core/update-state';
import type { GitRunner } from '../../src/core/update-check';
import { makeStore } from '../../src/core/store';
import { App } from '../../src/tui/App';
import { waitForFrame } from '../helpers/ink-waits';

const tmps: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-offplugin-'));
  tmps.push(d);
  return d;
};
afterEach(() => {
  resetUpdateSignal();
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A temp home with a plugin clone at VERSION 0.2.3 whose origin HEAD differs (an update is available). */
function homeWithUpdate(): { home: string; run: GitRunner } {
  const home = mk();
  const clone = pluginCloneDir(home);
  fs.mkdirSync(path.join(clone, 'plugin-dist'), { recursive: true });
  fs.writeFileSync(path.join(clone, 'plugin-dist', 'VERSION'), '0.2.3\n');
  fs.mkdirSync(path.join(clone, '.git'), { recursive: true });
  fs.writeFileSync(path.join(clone, '.git', 'config'), '[remote "origin"]\n\turl = https://example.invalid/snote.git\n');
  const run: GitRunner = async (args) => ({ code: 0, stdout: args.includes('rev-parse') ? 'aaa\n' : 'bbb\tHEAD\n' });
  return { home, run };
}

describe('#443 update cache and notice off the plugin install', () => {
  it('1: WHEN updateStateDir is asked for each kind THEN `plugin` gets the plugin folder and `homebrew`, `package`, `dev` and `unknown` get the data folder', () => {
    const kinds: InstallKind[] = ['plugin', 'homebrew', 'package', 'dev', 'unknown'];
    expect(kinds.map((k) => [k, updateStateDir(k, '/p/omarchy-snote-plugin', '/d/snote')])).toEqual([
      ['plugin', '/p/omarchy-snote-plugin'],
      ['homebrew', '/d/snote'],
      ['package', '/d/snote'],
      ['dev', '/d/snote'],
      ['unknown', '/d/snote'],
    ]);
  });

  it("2: WHEN runUpdateChecks finds an update with `offPlugin: true` and stateDir = a data folder THEN `currentUpdate()` is `{ kind: 'available', offPlugin: true }`, `update-check.json` is in the data folder and no `omarchy-snote-plugin` folder exists under the data home", async () => {
    const { home, run } = homeWithUpdate();
    const dataHome = mk();
    const dataDir = path.join(dataHome, 'snote');
    await runUpdateChecks({ version: '0.2.3', home, env: {}, stateDir: updateStateDir('dev', path.join(dataHome, 'omarchy-snote-plugin'), dataDir), now: 1000000, run, offPlugin: true });
    expect(currentUpdate()).toEqual({ kind: 'available', offPlugin: true });
    expect([fs.existsSync(path.join(dataDir, 'update-check.json')), fs.existsSync(path.join(dataHome, 'omarchy-snote-plugin'))]).toEqual([true, false]);
  });

  it("3: WHEN runUpdateChecks finds an update without `offPlugin` THEN `currentUpdate()` is `{ kind: 'available' }` (the plugin signal, unchanged)", async () => {
    const { home, run } = homeWithUpdate();
    await runUpdateChecks({ version: '0.2.3', home, env: {}, stateDir: path.join(home, 'state'), now: 1000000, run });
    expect(currentUpdate()).toEqual({ kind: 'available' });
  });

  it("4: WHEN the App shows publishUpdate({ kind: 'available', offPlugin: true }) THEN the frame holds `update available: a newer snote is out, see github.com/donnishcomau/snote/releases` and not `omarchy plugin update`", async () => {
    const { lastFrame } = render(<App store={makeStore({ stubClient: {} })} width={100} height={24} />);
    publishUpdate({ kind: 'available', offPlugin: true });
    const frame = await waitForFrame(lastFrame, (f) => f.includes('update available: a newer snote is out, see github.com/donnishcomau/snote/releases') && !f.includes('omarchy plugin update'));
    expect(frame).toContain('update available: a newer snote is out, see github.com/donnishcomau/snote/releases');
  });

  it("5: WHEN src/cli/main.tsx is read THEN the update block sets `const stateDir = updateStateDir(kind, statusDir(process.env), dataDir);` after `const kind = runningInstallKind();`, and passes `offPlugin: kind !== 'plugin'` to runUpdateChecks", () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'cli', 'main.tsx'), 'utf8');
    const kindAt = src.indexOf('const kind = runningInstallKind();');
    const dirAt = src.indexOf('const stateDir = updateStateDir(kind, statusDir(process.env), dataDir);');
    expect([kindAt > -1, dirAt > kindAt, src.includes("offPlugin: kind !== 'plugin'")]).toEqual([true, true, true]);
  });
});
