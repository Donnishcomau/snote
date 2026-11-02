/** #115 trim: each helper the sync-8 lane shares is defined once in src/. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

function srcFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? srcFiles(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));
}
const all = srcFiles(path.join(process.cwd(), 'src')).map((f) => fs.readFileSync(f, 'utf8'));
const count = (re: RegExp): number => all.reduce((n, t) => n + (t.match(re)?.length ?? 0), 0);

describe('#115 shared helpers appear once', () => {
  it('the line-count helper is defined once and the conflict-block text is written once', () => {
    expect(count(/function lineCounts\(/g)).toBe(1);
    expect(count(/conflicting change from another device/g)).toBe(1);
  });
});
