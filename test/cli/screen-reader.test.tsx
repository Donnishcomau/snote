import { readdirSync, readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import React from 'react';
import { render, Text } from 'ink';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { screenReaderMode } from '../../src/cli/screen-reader';
import { main } from '../../src/cli/main';

const none = {};

/** Render one labelled Text through Ink's real renderer with the given mode and return what it wrote. */
async function frameWith(on: boolean): Promise<string> {
  const stdout = new PassThrough();
  Object.assign(stdout, { columns: 80, rows: 24, isTTY: false });
  const chunks: string[] = [];
  stdout.on('data', (c: Buffer) => chunks.push(c.toString()));
  const { unmount } = render(<Text aria-label="LABEL">PLAIN</Text>, {
    stdout: stdout as never,
    stdin: new PassThrough() as never,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
    isScreenReaderEnabled: on,
  });
  await new Promise((r) => setTimeout(r, 30));
  unmount();
  return chunks.join('');
}

describe('#17 screen-reader opt-in', () => {
  it('1: WHEN argv is `--screen-reader` with an empty env THEN the mode is `true` and the flag is removed from args, and WHEN argv is empty, `--screen-reader=1`, `--Screen-Reader` or `screen-reader` THEN the mode is `false` and args are unchanged', () => {
    expect(screenReaderMode(['--screen-reader', '--new'], none)).toEqual({ args: ['--new'], on: true });
    for (const argv of [[], ['--screen-reader=1'], ['--Screen-Reader'], ['screen-reader']]) {
      expect(screenReaderMode(argv, none)).toEqual({ args: argv, on: false });
    }
  });

  it('2: WHEN SNOTE_SCREEN_READER is `1` and there is no flag THEN the mode is `true`, and WHEN it is `0`, an empty string, `true`, `yes`, ` 1` or unset THEN the mode is `false`', () => {
    expect(screenReaderMode([], { SNOTE_SCREEN_READER: '1' }).on).toBe(true);
    for (const v of ['0', '', 'true', 'yes', ' 1', undefined]) {
      expect(screenReaderMode([], { SNOTE_SCREEN_READER: v }).on).toBe(false);
    }
  });

  it('3: WHEN INK_SCREEN_READER is `true` or `1` and there is no flag and no SNOTE_SCREEN_READER THEN the mode is `false` and Ink renders `PLAIN` and not `LABEL`, and WHEN `--screen-reader` is given with the same env THEN Ink renders `LABEL`', async () => {
    const saved = process.env.INK_SCREEN_READER;
    try {
      for (const v of ['true', '1']) {
        process.env.INK_SCREEN_READER = v;
        const mode = screenReaderMode([], { ...process.env, SNOTE_SCREEN_READER: undefined });
        expect(mode.on).toBe(false);
        const shown = await frameWith(mode.on);
        expect(shown).toContain('PLAIN');
        expect(shown).not.toContain('LABEL');
      }
      process.env.INK_SCREEN_READER = 'true';
      const on = screenReaderMode(['--screen-reader'], process.env);
      expect(on.on).toBe(true);
      expect(await frameWith(on.on)).toContain('LABEL');
    } finally {
      if (saved === undefined) delete process.env.INK_SCREEN_READER;
      else process.env.INK_SCREEN_READER = saved;
    }
  });

  it('4: WHEN `--no-screen-reader` meets SNOTE_SCREEN_READER `1` THEN the mode is `false`, WHEN `--screen-reader` meets SNOTE_SCREEN_READER `0` THEN it is `true`, and WHEN both flags are given THEN it is `false`', () => {
    expect(screenReaderMode(['--no-screen-reader'], { SNOTE_SCREEN_READER: '1' })).toEqual({ args: [], on: false });
    expect(screenReaderMode(['--screen-reader'], { SNOTE_SCREEN_READER: '0' })).toEqual({ args: [], on: true });
    expect(screenReaderMode(['--screen-reader', '--no-screen-reader'], none).on).toBe(false);
  });

  it('5: WHEN main runs with `--screen-reader` and `--help` THEN it resolves `0` and prints `--screen-reader`, `SNOTE_SCREEN_READER=1`, `one linear column, no colour` and `Help and the editor hand-off work`, and WHEN it runs with `--screen-reader=1` THEN it resolves `2`', async () => {
    const logged: string[] = [];
    const io = { log: (t: string) => logged.push(t) };
    expect(await main(['--screen-reader', '--help'], io)).toBe(0);
    const shown = logged.join('\n');
    expect(shown).toContain('--screen-reader');
    expect(shown).toContain('SNOTE_SCREEN_READER=1');
    expect(shown).toContain('one linear column, no colour');
    expect(shown).toContain('Help and the editor hand-off work');
    logged.length = 0;
    expect(await main(['--screen-reader=1'], io)).toBe(2);
  });

  it('6: WHEN src/cli/main.tsx is read THEN it contains `isScreenReaderEnabled: screenReader, exitOnCtrlC: false` and `screenReaderMode(argsWithoutNew, process.env)`, and not `INK_SCREEN_READER`, and no file in `src/tui` contains `aria-label`', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli/main.tsx'), 'utf8');
    expect(src).toContain('isScreenReaderEnabled: screenReader, exitOnCtrlC: false');
    expect(src).toContain('screenReaderMode(argsWithoutNew, process.env)');
    expect(src).not.toContain('INK_SCREEN_READER');
    // no screen-reader label is built from note, tag or account text anywhere in the UI
    for (const f of readdirSync(join(process.cwd(), 'src/tui'))) {
      expect(readFileSync(join(process.cwd(), 'src/tui', f), 'utf8')).not.toContain('aria-label');
    }
  });
});
