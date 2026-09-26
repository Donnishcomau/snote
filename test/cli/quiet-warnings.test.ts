import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';

const QUIET_ENTRY = 'test/fixtures/warn-quiet-entry.ts';
const LOUD_ENTRY = 'test/fixtures/warn-loud-entry.ts';

let quietOutfile: string;
let loudOutfile: string;

function runBundle(outfile: string): Promise<{ status: number | null; out: string; err: string }> {
  return new Promise((res) => {
    const p = spawn('node', [outfile]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (status) => res({ status, out, err }));
  });
}

describe('T201 quiet warnings', () => {
  beforeAll(async () => {
    quietOutfile = join(mkdtempSync(join(tmpdir(), 't201-quiet-')), 'entry.js');
    loudOutfile = join(mkdtempSync(join(tmpdir(), 't201-loud-')), 'entry.js');
    await bundle({ entry: QUIET_ENTRY, outfile: quietOutfile });
    await bundle({ entry: LOUD_ENTRY, outfile: loudOutfile });
  }, 20000);

  afterAll(() => {
    if (quietOutfile) rmSync(quietOutfile, { force: true });
    if (loudOutfile) rmSync(loudOutfile, { force: true });
  });

  it('1: WHEN the bundled warn-quiet-entry is run THEN the exit status is 0, stdout contains done, and stderr does not contain snote-test-warning and does not contain Warning', async () => {
    const result = await runBundle(quietOutfile);
    expect(result.status).toBe(0);
    expect(result.out).toContain('done');
    expect(result.err).not.toContain('snote-test-warning');
    expect(result.err).not.toContain('Warning');
  }, 15000);

  it('2: WHEN the bundled warn-loud-entry is run THEN stdout contains done and stderr contains snote-test-warning', async () => {
    const result = await runBundle(loudOutfile);
    expect(result.out).toContain('done');
    expect(result.err).toContain('snote-test-warning');
  }, 15000);

  it('3: WHEN src/cli/index.ts is read THEN its first line is exactly import \'./quiet-warnings\'; and it still contains main(process.argv.slice(2))', async () => {
    const content = readFileSync('src/cli/index.ts', 'utf8');
    const firstLine = content.split('\n')[0];
    expect(firstLine).toBe("import './quiet-warnings';");
    expect(content).toContain('main(process.argv.slice(2))');
  });

  it('4: WHEN src/cli/quiet-warnings.ts is read THEN it contains process.noDeprecation = true and process.removeAllListeners(\'warning\'), and it contains no import', async () => {
    const content = readFileSync('src/cli/quiet-warnings.ts', 'utf8');
    expect(content).toContain('process.noDeprecation = true');
    expect(content).toContain("process.removeAllListeners('warning')");
    expect(content).not.toContain('import');
  });
});
