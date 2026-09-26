import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const makefilePath = resolve(__dirname, '../../Makefile');
const makefileContent = readFileSync(makefilePath, 'utf-8');

describe('Makefile vitest timeout guard (T216)', () => {
  it('1: WHEN Makefile is read THEN it contains VITEST_TIMEOUT ?= 600 and the check recipe contains timeout $(VITEST_TIMEOUT) npx vitest run --passWithNoTests', () => {
    expect(makefileContent).toContain('VITEST_TIMEOUT ?= 600');
    expect(makefileContent).toContain('timeout $(VITEST_TIMEOUT) npx vitest run --passWithNoTests');
  });

  it('2: WHEN Makefile is read THEN it still contains npm run -s typecheck, npm run -s lint and @echo "CHECK OK", and CHECK OK appears exactly 1 time', () => {
    expect(makefileContent).toContain('npm run -s typecheck');
    expect(makefileContent).toContain('npm run -s lint');
    expect(makefileContent).toContain('@echo "CHECK OK"');
    const count = (makefileContent.match(/CHECK OK/g) || []).length;
    expect(count).toBe(1);
  });

  it('3: WHEN the guard shape is run as bash -c \'timeout 1 sleep 5 || { code=$?; if [ $code -eq 124 ]; then echo "FAIL: vitest did not finish"; fi; exit $code; }\' THEN it exits with status 124 and its output contains FAIL: vitest did not finish', () => {
    try {
      execFileSync('bash', ['-c',
        'timeout 1 sleep 5 || { code=$?; if [ $code -eq 124 ]; then echo "FAIL: vitest did not finish"; fi; exit $code; }'
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      expect.fail('expected execFileSync to throw');
    } catch (err: any) {
      expect(err.status).toBe(124);
      expect(err.stdout).toContain('FAIL: vitest did not finish');
    }
  });

  it('4: WHEN the same shape is run with timeout 5 true instead THEN it exits with status 0 and its output is empty', () => {
    const result = execFileSync('bash', ['-c',
      'timeout 5 true || { code=$?; if [ $code -eq 124 ]; then echo "FAIL: vitest did not finish"; fi; exit $code; }'
    ], { encoding: 'utf-8' });
    expect(result).toBe('');
  });

  it('5: WHEN the same shape is run with timeout 5 false instead THEN it exits with status 1 and its output does not contain FAIL: vitest did not finish', () => {
    try {
      execFileSync('bash', ['-c',
        'timeout 5 false || { code=$?; if [ $code -eq 124 ]; then echo "FAIL: vitest did not finish"; fi; exit $code; }'
      ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      expect.fail('expected execFileSync to throw');
    } catch (err: any) {
      expect(err.status).toBe(1);
      expect(err.stdout).not.toContain('FAIL: vitest did not finish');
    }
  });
});
