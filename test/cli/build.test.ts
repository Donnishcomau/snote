import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, rmSync, statSync } from 'node:fs';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bundle } from '../../scripts/build.mjs';

vi.setConfig({ testTimeout: 15000 });

// ---- fixtures ----

const tmpRoot = join('/tmp', 'snote-build-test-' + Date.now() + '-' + Math.random());
let outfile: string;

function setupOutfile(): string {
  return join(tmpRoot, 'bundle-' + Math.random() + '.js');
}

beforeEach(async () => {
  outfile = setupOutfile();
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ---- constants ----

const SIMPERIUM =
  "import createClient from 'simperium'; console.log(typeof createClient);";

const INK =
  "import { Text } from 'ink'; console.log(typeof Text);";

const KEYS =
  "import { keymap } from './src/core/keymap'; console.log('keys ' + (keymap.length > 0));";

const BROKEN =
  "import x from './does-not-exist'; console.log(x);";

const IMPORT_ONLY =
  "import('./scripts/build.mjs').then((m) => console.log(typeof m.bundle))";

// ---- tests ----

describe('build', () => {
  it('1: WHEN bundle({ contents: SIMPERIUM, outfile }) has resolved and the file is run THEN the exit status is 0, trimmed stdout is "function", the file first line is "#!/usr/bin/env node" and the file contains "createRequire"', async () => {
    const testOutfile = join(tmpRoot, 'simperium.js');
    await bundle({ contents: SIMPERIUM, outfile: testOutfile });
    const result = spawnSync(process.execPath, [testOutfile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('function');
    const fileContent = require('node:fs').readFileSync(testOutfile, 'utf8');
    const lines = fileContent.split('\n');
    expect(lines[0]).toBe('#!/usr/bin/env node');
    expect(fileContent).toContain('createRequire');
  });

  it('2: WHEN bundle({ contents: INK, outfile }) has resolved and the file is run THEN the exit status is 0, stdout contains "function" and stderr does not contain "react-devtools-core"', async () => {
    const testOutfile = join(tmpRoot, 'ink.js');
    await bundle({ contents: INK, outfile: testOutfile });
    const result = spawnSync(process.execPath, [testOutfile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('function');
    expect(result.stderr).not.toContain('react-devtools-core');
  });

  it('3: WHEN bundle({ contents: KEYS, outfile }) (project TypeScript, resolved from the repo root) has resolved and the file is run THEN the exit status is 0 and stdout contains "keys true"', async () => {
    const testOutfile = join(tmpRoot, 'keys.js');
    await bundle({ contents: KEYS, outfile: testOutfile });
    const result = spawnSync(process.execPath, [testOutfile], {
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('keys true');
  });

  it('4: WHEN bundle({ contents: BROKEN, outfile }) is awaited THEN the promise rejects (rejects.toThrow) and fs.existsSync(outfile) is false', async () => {
    const testOutfile = join(tmpRoot, 'broken.js');
    await expect(
      bundle({ contents: BROKEN, outfile: testOutfile }),
    ).rejects.toThrow();
    expect(existsSync(testOutfile)).toBe(false);
  });

  it('5: WHEN a child process runs IMPORT_ONLY THEN its stdout contains "function", and dist/cli.js has the same existsSync result and the same mtimeMs as before (importing the script builds nothing)', async () => {
    // Ensure dist/cli.js exists or not before
    const beforePath = 'dist/cli.js';
    const beforeExists = existsSync(beforePath);
    const beforeMtimeMs = beforeExists
      ? fs.statSync(beforePath).mtimeMs
      : null;

    const result = spawnSync(
      process.execPath,
      ['-e', IMPORT_ONLY],
      { encoding: 'utf8', timeout: 10000 },
    );

    expect(result.stdout).toContain('function');

    const afterExists = existsSync(beforePath);
    expect(afterExists).toBe(beforeExists);

    if (beforeExists && afterExists) {
      const afterMtimeMs = fs.statSync(beforePath).mtimeMs;
      expect(afterMtimeMs).toBe(beforeMtimeMs);
    }
  });

  it('6: WHEN package.json is read THEN scripts.build is "node scripts/build.mjs", bin.snote is "dist/cli.js", scripts.test is still "vitest run" and type is still "module"', async () => {
    const pkg = JSON.parse(
      require('node:fs').readFileSync('package.json', 'utf8'),
    );
    expect(pkg.scripts.build).toBe('node scripts/build.mjs');
    expect(pkg.bin.snote).toBe('dist/cli.js');
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.type).toBe('module');
  });
});
