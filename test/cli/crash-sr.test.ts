import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { bundle } from '../../scripts/build.mjs';

// SGR, any other ESC, C1, BEL, CR, BS, zero-width and bidi characters.
const FORBIDDEN = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200b\u200c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

let outfile: string;

describe('#17 crash path in screen-reader mode', () => {
  beforeAll(async () => {
    outfile = join(mkdtempSync(join(tmpdir(), 'crash-sr-')), 'entry.js');
    await bundle({ entry: 'test/fixtures/crash-entry-sr.ts', outfile });
  }, 20000);

  it('27: WHEN a render error whose message carries the hostile corpus `CRASHMSG` stops snote started with `--screen-reader` THEN it exits `1`, the terminal output and the saved report hold the calm lines and no SGR, ESC, C1, BEL, CR, zero-width or bidi character, and the report is JSON that does not carry `CRASHMSG`', async () => {
    const state = mkdtempSync(join(tmpdir(), 'crash-sr-state-'));
    const { status, combined } = await new Promise<{ status: number | null; combined: string }>((res) => {
      const p = spawn('node', [outfile, state], {
        env: { ...process.env, XDG_STATE_HOME: state },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', (s) => res({ status: s, combined: out }));
    });
    const dir = join(state, 'snote');
    const file = readdirSync(dir).filter((f) => f.startsWith('crash-'))[0] ?? '';
    const report = file ? readFileSync(join(dir, file), 'utf8') : '';
    const forbidden = (text: string) => text.replace(/\n/g, '').match(FORBIDDEN);
    expect(status).toBe(1);
    expect(combined).toContain('snote hit a bug and stopped.');
    expect(forbidden(combined.replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, ''))).toBeNull();
    expect(report).not.toContain('CRASHMSG');
    expect(JSON.parse(report).error.name).toBe('Error');
    expect(forbidden(report)).toBeNull();
  }, 20000);
});
