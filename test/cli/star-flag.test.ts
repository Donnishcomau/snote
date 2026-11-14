import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parseCli, starPromptFlag, USAGE } from '../../src/cli/args';
import { recordLaunch, resetStarPrompt, starOff } from '../../src/core/star-prompt';

const HELP = '  --no-star-prompt     Never show the one-time request to star snote on GitHub';

describe('star prompt flag', () => {
  afterEach(() => {
    delete process.env.SNOTE_STAR_PROMPT;
    resetStarPrompt();
  });

  it('12: WHEN starPromptFlag sees --no-star-prompt THEN the option is gone and the flag is true; off and 0 turn the prompt off; parseCli keeps its 6 keys; USAGE has the help line once', () => {
    expect(starPromptFlag(['--data-dir', '/x', '--no-star-prompt', '--check'])).toEqual({
      args: ['--data-dir', '/x', '--check'],
      noStarPrompt: true,
    });
    expect(starPromptFlag(['--check'])).toEqual({ args: ['--check'], noStarPrompt: false });
    const rest = starPromptFlag(['--help', '--no-star-prompt']).args;
    const parsed = parseCli(rest);
    expect(Object.keys(parsed).sort()).toEqual(['appId', 'check', 'dataDir', 'help', 'logout', 'server']);
    expect(parsed).toEqual(parseCli(['--help']));
    expect(USAGE.split('\n').filter((l) => l.includes('--no-star-prompt'))).toEqual([HELP]);
    process.env.SNOTE_STAR_PROMPT = 'off';
    expect(starOff(process.env, false)).toBe(true);
    process.env.SNOTE_STAR_PROMPT = '0';
    expect(starOff(process.env, false)).toBe(true);
    process.env.SNOTE_STAR_PROMPT = 'no';
    expect(starOff(process.env, false)).toBe(false);
    delete process.env.SNOTE_STAR_PROMPT;
    expect(starOff(process.env, true)).toBe(true);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-971-flag-'));
    try {
      process.env.SNOTE_STAR_PROMPT = 'off';
      expect(recordLaunch(dir, 1)).toBe(false);
      expect(fs.existsSync(path.join(dir, 'star-prompt.json'))).toBe(false);
      process.env.SNOTE_STAR_PROMPT = '0';
      expect(recordLaunch(dir, 1)).toBe(false);
      expect(fs.readdirSync(dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
