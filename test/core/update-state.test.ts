import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  checkLocalUpdate,
  compareVersions,
  pluginCloneDir,
} from '../../src/core/update-state';

describe('update-state', () => {
  let tmpDir: string;

  const writeVersion = (contents: string): string => {
    const dist = path.join(tmpDir, 'plugin-dist');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'VERSION'), contents);
    return tmpDir;
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-upd-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1: WHEN the running version is `0.2.2` and the temp clone's `plugin-dist/VERSION` holds `0.2.3\\n` THEN checkLocalUpdate returns { state: 'restart', installed: '0.2.2', available: '0.2.3' }", () => {
    const cloneDir = writeVersion('0.2.3\n');

    const result = checkLocalUpdate('0.2.2', cloneDir);

    expect(result).toEqual({
      state: 'restart',
      installed: '0.2.2',
      available: '0.2.3',
    });
  });

  it("2: WHEN the running version is `0.2.3` and the file holds `0.2.3\\n` THEN it returns { state: 'current' }", () => {
    const cloneDir = writeVersion('0.2.3\n');

    const result = checkLocalUpdate('0.2.3', cloneDir);

    expect(result).toEqual({ state: 'current' });
  });

  it("3: WHEN the file is missing, and again when it holds `banana` THEN it returns { state: 'current' } both times without throwing", () => {
    expect(() => checkLocalUpdate('0.2.2', tmpDir)).not.toThrow();
    expect(checkLocalUpdate('0.2.2', tmpDir)).toEqual({ state: 'current' });

    const cloneDir = writeVersion('banana');
    expect(() => checkLocalUpdate('0.2.2', cloneDir)).not.toThrow();
    expect(checkLocalUpdate('0.2.2', cloneDir)).toEqual({ state: 'current' });
  });

  it("4: WHEN the running version is `0.2.9` and the file holds `0.2.10` THEN state is `restart`; WHEN running is `0.2.10` and the file holds `0.2.9` THEN state is `current`", () => {
    const cloneDir = writeVersion('0.2.10');
    expect(checkLocalUpdate('0.2.9', cloneDir).state).toBe('restart');

    expect(compareVersions('0.2.10', '0.2.9')).toBeGreaterThan(0);

    const other = writeVersion('0.2.9');
    expect(checkLocalUpdate('0.2.10', other).state).toBe('current');
  });

  it("5: WHEN `pluginCloneDir('/tmp/h')` runs THEN it returns `/tmp/h/.config/omarchy/plugins/io.github.donnishcomau.snote-simplenote`", () => {
    expect(pluginCloneDir('/tmp/h')).toBe(
      '/tmp/h/.config/omarchy/plugins/io.github.donnishcomau.snote-simplenote'
    );
  });
});
