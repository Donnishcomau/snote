import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const forbiddenUsername = ['quin', 'no'].join('');
const forbiddenIpPrefix = ['192', '168'].join('.');

describe('no-personal-data', () => {
  it('1: WHEN every .ts/.tsx file under test/ is read THEN none of them contains the string built by [\'quin\', \'no\'].join(\'\').', () => {
    const allFiles: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = dir + '/' + entry;
        const stat = require('node:fs').statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          allFiles.push(full);
        }
      }
    }
    walk('test');

    for (const file of allFiles) {
      const content = read(file);
      expect(content).not.toContain(forbiddenUsername);
    }
  });

  it('2: WHEN every .ts/.tsx file under test/ is read THEN none of them contains the string built by [\'192\', \'168\'].join(\'.\').', () => {
    const allFiles: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = dir + '/' + entry;
        const stat = require('node:fs').statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          allFiles.push(full);
        }
      }
    }
    walk('test');

    for (const file of allFiles) {
      const content = read(file);
      expect(content).not.toContain(forbiddenIpPrefix);
    }
  });

  it('3: WHEN test/core/browser-shim-getter.test.ts is read THEN it contains import.meta.url and does not contain /home/.', () => {
    const content = read('test/core/browser-shim-getter.test.ts');
    expect(content).toContain('import.meta.url');
    expect(content).not.toContain('/home/');
  });

  it('4: WHEN test/docs/readme-loop.test.ts is read THEN it contains .join(\'\') and .join(\'.\'), proving the two forbidden values are still assembled and checked, not simply deleted.', () => {
    const content = read('test/docs/readme-loop.test.ts');
    expect(content).toContain(".join('')");
    expect(content).toContain(".join('.')");
  });
});
