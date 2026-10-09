import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('SNOTE_NODE comments (T476)', () => {
  it('1: WHEN packaging/omarchy/setup is read THEN it does not contain `just like in find_node` and does not contain `(test mode)`, and contains `/usr/bin/node`', () => {
    const setup = read('packaging/omarchy/setup');
    expect(setup.length).toBeGreaterThan(0);
    expect(setup).not.toContain('just like in find_node');
    expect(setup).not.toContain('(test mode)');
    expect(setup).toContain('/usr/bin/node');
  });

  it('2: WHEN test/packaging/omarchy-setup-prebuilt.test.ts is read THEN it does not contain `test-only`', () => {
    const text = read('test/packaging/omarchy-setup-prebuilt.test.ts');
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('test-only');
  });

  it('3: WHEN `bash -n packaging/omarchy/setup` runs THEN it exits `0`', () => {
    const run = spawnSync('bash', ['-n', 'packaging/omarchy/setup'], { encoding: 'utf8', cwd: process.cwd() });
    expect(run.status).toBe(0);
  });
});
