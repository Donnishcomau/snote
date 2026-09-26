import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const readme = readFileSync('README.md', 'utf8');
const lines = readme.split('\n');

describe('README — no private build-loop content (T307)', () => {
  it('1: private loop strings are absent from README.md', () => {
    expect(readme).not.toContain('TASKS.md');
    expect(readme).not.toContain('.loop/task-');
    expect(readme).not.toContain('scripts/run-loop.sh');
    expect(readme).not.toContain('scripts/check-model.sh');
  });

  it('2: forbidden personal strings remain absent', () => {
    // Assembled at runtime so this file never contains the literals itself.
    const forbiddenIpPrefix = ['192', '168'].join('.');
    const forbiddenUsername = ['quin', 'no'].join('');
    expect(readme).not.toContain(forbiddenIpPrefix);
    expect(readme).not.toContain(forbiddenUsername);
    expect(readme).not.toContain('launchctl');
    expect(readme).not.toContain('.bak');
    expect(readme).not.toContain('oMLX');
    expect(readme).not.toContain('opencode');
    expect(readme).not.toContain('settings.json');
    expect(readme).not.toContain('.loop');
    expect(readme).not.toContain('LOOP_MODEL');
    expect(readme).not.toContain('OMLX');
  });

  it('3: the three loop headings are gone', () => {
    expect(readme).not.toContain('## Autonomous build loop');
    expect(readme).not.toContain('## Loop gates, handoff, and rollback switches');
  });

  it('4: the README keeps its public spine in order and stays under 200 lines', () => {
    const installIdx = readme.indexOf('## Install on Omarchy');
    const keysIdx = readme.indexOf('## Keys');
    const creditIdx = readme.indexOf('## Credit and licence');
    const developIdx = readme.indexOf('## Develop');
    expect(installIdx).toBeGreaterThan(-1);
    expect(keysIdx).toBeGreaterThan(-1);
    expect(creditIdx).toBeGreaterThan(-1);
    expect(developIdx).toBeGreaterThan(-1);
    expect(installIdx).toBeLessThan(keysIdx);
    expect(keysIdx).toBeLessThan(creditIdx);
    expect(creditIdx).toBeLessThan(developIdx);
    expect(lines.length).toBeLessThan(200);
  });
});
