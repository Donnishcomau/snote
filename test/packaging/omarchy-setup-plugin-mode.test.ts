// #294: packaging/omarchy/setup claims the plugin directory is 0700 (the
// checked and rolled-back marks live there). Direct proof for that claim.
// Linux only, like its neighbours; setup is synchronous. Each case runs in
// its own mkdtemp sandbox; nothing touches the real HOME.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, chmodSync, existsSync, statSync } from 'node:fs';
import { type Sandbox, cleanup, makeSandbox, runSetup } from '../helpers/omarchy-sandbox';

let sb: Sandbox | undefined;
let prevUmask = 0;

beforeEach(() => {
  prevUmask = process.umask(0o022);
});

afterEach(() => {
  process.umask(prevUmask);
  cleanup(sb);
  sb = undefined;
});

describe('setup keeps the plugin directory private (#294)', () => {
  it('12: WHEN `setup` installs into a sandbox whose plugin directory already exists with mode `0o777` and umask is `022` THEN afterwards the plugin directory has mode `0o700`; and WHEN it did not exist before THEN it is created with mode `0o700`', () => {
    sb = makeSandbox('1.0.0');
    mkdirSync(sb.pluginDir, { recursive: true });
    chmodSync(sb.pluginDir, 0o777);
    expect(statSync(sb.pluginDir).mode & 0o777).toBe(0o777);
    const first = runSetup(sb);
    expect(first.status).toBe(0);
    expect(statSync(sb.pluginDir).mode & 0o777).toBe(0o700);

    cleanup(sb);
    sb = makeSandbox('1.0.0');
    expect(existsSync(sb.pluginDir)).toBe(false);
    const second = runSetup(sb);
    expect(second.status).toBe(0);
    expect(statSync(sb.pluginDir).mode & 0o777).toBe(0o700);
  });
});
