import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { guardOutputStream, setPlainOutput } from '../../src/core/output-guard';

const ESC = String.fromCharCode(27);
const BIDI = '\u061c\u200b\u200c\u200e\u200f\u2028\u2029\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069';

function recorded(): { stream: { write(chunk: unknown, ...rest: unknown[]): unknown }; out: string[] } {
  const out: string[] = [];
  const stream = { write: (chunk: unknown) => { out.push(String(chunk)); return true; } };
  return { stream: guardOutputStream(stream), out };
}

describe('#17 plain output (screen-reader mode)', () => {
  afterEach(() => setPlainOutput(false));

  it('1: WHEN plain output is on and `ESC[1;31mred`, an SGR split across two writes, the zero-width and bidi characters, a CR and `ESC[2K` are written THEN the stream receives `red ab` followed by `ESC[2K` only, and WHEN it is off THEN the SGR stays; and src/cli/main.tsx calls `setPlainOutput(screenReader)` before `guardOutputStream(process.stdout)`', () => {
    setPlainOutput(true);
    const on = recorded();
    on.stream.write(`${ESC}[1;31mred${ESC}[0`);
    on.stream.write(`m a${BIDI}b\r${ESC}[2K`);
    expect(on.out.join('')).toBe(`red ab${ESC}[2K`);

    setPlainOutput(false);
    const off = recorded();
    off.stream.write(`${ESC}[1;31mred${ESC}[0m a${BIDI}b\r`);
    expect(off.out.join('')).toBe(`${ESC}[1;31mred${ESC}[0m a${BIDI}b\r`);

    const src = readFileSync(join(process.cwd(), 'src/cli/main.tsx'), 'utf8');
    const plainAt = src.indexOf('setPlainOutput(screenReader)');
    expect(plainAt).toBeGreaterThan(-1);
    expect(plainAt).toBeLessThan(src.indexOf('guardOutputStream(process.stdout)'));
  });

  it('19: WHEN plain output is on and a Buffer and a Uint8Array carry `ESC[31m`, U+202E split across the two writes and `ESC]52;c;ZXZpbA==BEL` THEN the stream receives `ok` only', () => {
    setPlainOutput(true);
    const on = recorded();
    const rlo = Buffer.from('\u202e', 'utf8');
    on.stream.write(Buffer.concat([Buffer.from(`${ESC}[31mo`), rlo.subarray(0, 1)]));
    on.stream.write(new Uint8Array(Buffer.concat([rlo.subarray(1), Buffer.from(`k${ESC}]52;c;ZXZpbA==\u0007`)])));
    expect(on.out.join('')).toBe('ok');
  });
});
