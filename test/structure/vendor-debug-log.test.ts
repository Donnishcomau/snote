/**
 * T421: the vendored InMemoryBucket must not ship dead debug logging.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const BUCKET = 'vendor/simplenote/state/simperium/functions/in-memory-bucket.ts';

describe('T421 vendored in-memory bucket carries no dead debug logging', () => {
  it('1: WHEN in-memory-bucket.ts is read THEN it contains no `console.log(` and no `[TEST]`, and still contains `put(` and `this.entities.set(id, data)`.', () => {
    const source = read(BUCKET);
    expect(source).not.toContain('console.log(');
    expect(source).not.toContain('[TEST]');
    expect(source).toContain('put(');
    expect(source).toContain('this.entities.set(id, data)');
  });

  it('2: WHEN it is read THEN it contains `simperium 1.1.4 calls put only on ghost stores` and does not contain `called during indexing`, and its first line starts with `// OMARCHY: modified for snote`.', () => {
    const source = read(BUCKET);
    expect(source).toContain('simperium 1.1.4 calls put only on ghost stores');
    expect(source).not.toContain('called during indexing');
    expect(source.split('\n')[0]).toMatch(/^\/\/ OMARCHY: modified for snote/);
  });
});
