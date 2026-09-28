// T323 — `snote --version` prints the version (release 0.1.2).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { main } from '../../src/cli/main';
import { USAGE } from '../../src/cli/args';
import { VERSION } from '../../src/cli/version';

describe('cli version', () => {
  it('1: WHEN main([\'--version\'], io) runs THEN it resolves 0 and logged is exactly [\'snote 0.1.2\']', async () => {
    const logged: string[] = [];
    const io = { log: (text: string) => logged.push(text) };
    const code = await main(['--version'], io);
    expect(code).toBe(0);
    expect(logged).toEqual(['snote 0.1.2']);
  });

  it('2: WHEN main([\'-v\'], io) runs THEN it resolves 0 and logged is exactly [\'snote 0.1.2\']', async () => {
    const logged: string[] = [];
    const io = { log: (text: string) => logged.push(text) };
    const code = await main(['-v'], io);
    expect(code).toBe(0);
    expect(logged).toEqual(['snote 0.1.2']);
  });

  it('3: WHEN USAGE is read THEN it contains --version, -v', () => {
    expect(USAGE).toContain('--version, -v');
  });

  it('4: WHEN package.json is read THEN its version is 0.1.2 and VERSION from src/cli/version.ts equals it', () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    ) as { version: string };
    expect(pkg.version).toBe('0.1.2');
    expect(VERSION).toBe(pkg.version);
  });
});
