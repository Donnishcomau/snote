import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { headroomLevel, headroomLine } from '../helpers/headroom-reporter';

const root = resolve(__dirname, '../..');

describe('headroom reporter (#369c)', () => {
  it('1: WHEN the decision function gets a passed test of `2500` ms with timeout `3000` ms THEN it returns level `fail`', () => {
    expect(headroomLevel({ state: 'passed', durationMs: 2500, timeoutMs: 3000 })).toBe('fail');
  });

  it('2: WHEN it gets a passed test of `1600` ms with timeout `3000` ms THEN it returns level `warn`', () => {
    expect(headroomLevel({ state: 'passed', durationMs: 1600, timeoutMs: 3000 })).toBe('warn');
  });

  it('3: WHEN it gets a passed test of `1500` ms with timeout `3000` ms, or a skipped test, or a failed test of `2900` ms THEN it returns level `ok`', () => {
    expect(headroomLevel({ state: 'passed', durationMs: 1500, timeoutMs: 3000 })).toBe('ok');
    expect(headroomLevel({ state: 'skipped', durationMs: 2900, timeoutMs: 3000 })).toBe('ok');
    expect(headroomLevel({ state: 'failed', durationMs: 2900, timeoutMs: 3000 })).toBe('ok');
  });

  it('4: WHEN the line is formatted for file `test/a.test.ts`, test `x`, `2500` ms of `3000` ms THEN it is exactly `HEADROOM test/a.test.ts > x: 2500 ms of 3000 ms`', () => {
    expect(headroomLine('test/a.test.ts', 'x', 2500, 3000)).toBe('HEADROOM test/a.test.ts > x: 2500 ms of 3000 ms');
  });

  it('5: WHEN vitest.config.ts is read THEN its reporters list holds `default` and `./test/helpers/headroom-reporter.ts` and WHEN `make -n check-ci SHARD=1/3 SHARD_REPORT=r.json` is run THEN its vitest line holds `--reporter=./test/helpers/headroom-reporter.ts`', () => {
    const cfg = readFileSync(resolve(root, 'vitest.config.ts'), 'utf-8');
    expect(cfg).toMatch(/reporters:\s*\[[^\]]*'default'[^\]]*'\.\/test\/helpers\/headroom-reporter\.ts'[^\]]*\]/);
    const out = execFileSync('make', ['-n', 'check-ci', 'SHARD=1/3', 'SHARD_REPORT=r.json'], { cwd: root, encoding: 'utf-8' });
    const vitestLine = out.split('\n').find((l) => l.includes('npx vitest run')) ?? '';
    expect(vitestLine).toContain('--reporter=./test/helpers/headroom-reporter.ts');
  });

  it('6: WHEN the line is formatted for file `test/a.test.ts`, test `x\\n::add-mask::y\\x1b]52;c;Zm9v\\x07z`, `2500` ms of `3000` ms THEN it is exactly `HEADROOM test/a.test.ts > x ::add-mask::yz: 2500 ms of 3000 ms` (one line, no ESC, no BEL)', () => {
    const line = headroomLine('test/a.test.ts', 'x\n::add-mask::y\x1b]52;c;Zm9v\x07z', 2500, 3000);
    expect(line).toBe('HEADROOM test/a.test.ts > x ::add-mask::yz: 2500 ms of 3000 ms');
    expect(line).not.toMatch(/[\n\r\x1b\x07]/);
  });
});
