/**
 * Issue #30 L5a1: the update hand-off after a confirmed y. It starts only after a save that left nothing unsaved,
 * only with a bar-update that is a regular file, and only as a detached launcher with a fixed argv, no shell, stdio
 * ignored and NODE_OPTIONS removed. Every refusal is one fixed line and exit 1, and nothing is started.
 */
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { persistOnChange } from '../../src/core/persistence';
import { pluginHandOffArgv, startHandOff } from '../../src/core/update-handoff';

const NOT_SAVED = 'snote did not update: your notes could not be saved';
const NO_UPDATER = 'snote did not update: the update script was not found';
const NO_TERMINAL = 'snote did not update: the update terminal could not be started';
const barPath = (home: string) => path.join(home, '.config', 'omarchy', 'plugins', 'io.github.donnishcomau.snote-simplenote', 'packaging', 'omarchy', 'bar-update');

let home: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'l5a1-'));
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

type Call = { cmd: string; args: string[]; opts: Record<string, unknown> };
function fakeSpawn(calls: Call[], event: 'spawn' | 'error') {
  return ((cmd: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ cmd, args, opts });
    const child = Object.assign(new EventEmitter(), { unref: () => {} });
    setImmediate(() => child.emit(event, event === 'error' ? Object.assign(new Error('x'), { code: 'ENOENT' }) : undefined));
    return child;
  }) as never;
}
function barUpdate(): string {
  const p = barPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '#!/bin/sh\n', { mode: 0o700 });
  return p;
}

describe('issue #30 L5a1 update hand-off', () => {
  it('1: WHEN the quit save left notes unsaved (saved false) THEN startHandOff starts nothing and returns code 1 with the line `snote did not update: your notes could not be saved`', async () => {
    barUpdate();
    const calls: Call[] = [];
    expect(await startHandOff({ kind: 'plugin', saved: false, home, env: {}, run: fakeSpawn(calls, 'spawn') })).toEqual({ code: 1, line: NOT_SAVED });
    expect(calls).toEqual([]);
  });

  it('2: WHEN bar-update is missing, is a directory or is a symlink to a regular file THEN startHandOff starts nothing and returns code 1 with the line `snote did not update: the update script was not found`', async () => {
    const calls: Call[] = [];
    const p = barPath(home);
    expect(await startHandOff({ kind: 'plugin', saved: true, home, env: {}, run: fakeSpawn(calls, 'spawn') })).toEqual({ code: 1, line: NO_UPDATER });
    fs.mkdirSync(p, { recursive: true });
    expect(await startHandOff({ kind: 'plugin', saved: true, home, env: {}, run: fakeSpawn(calls, 'spawn') })).toEqual({ code: 1, line: NO_UPDATER });
    fs.rmdirSync(p);
    fs.writeFileSync(path.join(home, 'real'), '#!/bin/sh\n');
    fs.symlinkSync(path.join(home, 'real'), p);
    expect(await startHandOff({ kind: 'plugin', saved: true, home, env: {}, run: fakeSpawn(calls, 'spawn') })).toEqual({ code: 1, line: NO_UPDATER });
    expect(calls).toEqual([]);
  });

  it('3: WHEN the save held and bar-update is a regular file THEN startHandOff spawns once `omarchy-launch-floating-terminal-with-presentation` with exactly the pluginHandOffArgv inner command, detached, stdio `ignore`, no shell option, an env without NODE_OPTIONS, and returns code 0 with an empty line', async () => {
    barUpdate();
    const calls: Call[] = [];
    const env = { HOME: home, NODE_OPTIONS: '--require /x.js', XDG_DATA_HOME: path.join(home, 'data') };
    expect(await startHandOff({ kind: 'plugin', saved: true, home, env, run: fakeSpawn(calls, 'spawn') })).toEqual({ code: 0, line: '' });
    expect(calls).toHaveLength(1);
    expect([calls[0].cmd, ...calls[0].args]).toEqual(pluginHandOffArgv(home, env));
    expect(calls[0].cmd).toBe('omarchy-launch-floating-terminal-with-presentation');
    expect(calls[0].opts).toEqual({ detached: true, stdio: 'ignore', env: { HOME: home, XDG_DATA_HOME: path.join(home, 'data') }, timeout: 10_000 });
    expect(env.NODE_OPTIONS).toBe('--require /x.js');
  });

  it('4: WHEN the launcher cannot start (the spawn emits ENOENT) THEN startHandOff returns code 1 with the line `snote did not update: the update terminal could not be started`', async () => {
    barUpdate();
    const calls: Call[] = [];
    expect(await startHandOff({ kind: 'plugin', saved: true, home, env: {}, run: fakeSpawn(calls, 'error') })).toEqual({ code: 1, line: NO_TERMINAL });
  });

  it('5: WHEN the store changed and the final state.json write fails (a directory named state.json.tmp) THEN the persistOnChange stop returns false, and WHEN the write succeeds THEN it returns true', () => {
    const state = { data: { notes: new Map() } };
    const listeners: Array<() => void> = [];
    const store = { getState: () => state as never, subscribe: (l: () => void) => (listeners.push(l), () => {}) };
    fs.mkdirSync(path.join(home, 'state.json.tmp'));
    const stopBad = persistOnChange(store, home, 60_000);
    listeners[0]();
    expect(stopBad()).toBe(false);
    const good = path.join(home, 'good');
    const stopGood = persistOnChange(store, good, 60_000);
    listeners[1]();
    expect(stopGood()).toBe(true);
    expect(fs.existsSync(path.join(good, 'state.json'))).toBe(true);
  });

  it('6: WHEN src/cli/main.tsx is read THEN the store wrapper keeps the save result (`stopSaving = () => (saved = built.stopSaving());`), its end saves first (`  stopSaving();`), returns 1 for a locked store, and only then reads handOffRequested and loads update-handoff with import() passing `saved`, and no src file imports update-handoff statically', () => {
    const main = fs.readFileSync('src/cli/main.tsx', 'utf8');
    expect(main.split('stopSaving = () => (saved = built.stopSaving());').length - 1).toBe(1);
    expect(main).toContain('startHandOff({ kind: handOff, saved, log })');
    const save = main.lastIndexOf('  stopSaving();\n');
    const locked = main.lastIndexOf('if (locked) return 1;');
    const asked = main.lastIndexOf('const handOff = handOffRequested();');
    const load = main.indexOf("await import('../core/update-handoff')");
    expect({ save: save > 0, locked: locked > save, asked: asked > locked, load: load > asked }).toEqual({ save: true, locked: true, asked: true, load: true });
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    expect(walk('src').filter((f) => /from\s+['"][./]+(core\/)?update-handoff['"]/.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
  });

  it("7: WHEN kind is 'direct' (or any non-plugin kind) and a regular bar-update exists at the plugin path THEN startHandOff spawns nothing and returns code 1 with the line `snote did not update: the update script was not found`", async () => {
    barUpdate();
    const calls: Call[] = [];
    for (const kind of ['direct', 'homebrew', 'package', 'dev', 'unknown'] as const) {
      expect(await startHandOff({ kind, saved: true, home, env: {}, run: fakeSpawn(calls, 'spawn') })).toEqual({ code: 1, line: NO_UPDATER });
    }
    expect(calls).toEqual([]);
    expect(await startHandOff({ kind: 'plugin', saved: true, home, env: {}, run: fakeSpawn(calls, 'spawn') })).toEqual({ code: 0, line: '' });
  });
});
