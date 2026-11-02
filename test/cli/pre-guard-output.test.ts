// #200: the lines main() prints before the output guard is on (usage error,
// endpoint warnings, `--check` report) carry argv and environment values; none may put an ESC byte on the screen.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../../src/cli/main';

const OSC = '\u001b]52;c;QUJD\u0007';
const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'snote-preguard-'));
  dirs.push(d);
  return d;
};

describe('main(): lines printed before the output guard (#200)', () => {
  it('3: WHEN an argument or the EDITOR value holds an `OSC 52` sequence THEN the usage error, the `--check` report and the default console output carry no ESC byte', async () => {
    const logged: string[] = [];
    const code = await main([`--${OSC}x`], { log: (t: string) => logged.push(t) });
    expect(code).toBe(2);
    expect(logged.join('\n')).toContain('error:');
    expect(logged.join('\n')).not.toContain('\u001b');
    expect(logged.join('\n')).not.toContain('\u0007');

    vi.stubEnv('EDITOR', `vi${OSC}`);
    const checked: string[] = [];
    expect(await main(['--check', '--data-dir', tmp()], { log: (t: string) => checked.push(t) })).toBe(0);
    expect(checked.join('\n')).toContain('vi');
    expect(checked.join('\n')).not.toContain('\u001b');

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await main([`--${OSC}y`])).toBe(2);
    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) expect(String(call[0])).not.toContain('\u001b');
  });

  it('6: WHEN the arguments and the environment are normal THEN `--help` logs the usage text unchanged and `--version` logs `snote` and the version', async () => {
    const help: string[] = [];
    expect(await main(['--help', '--data-dir', tmp()], { log: (t: string) => help.push(t) })).toBe(0);
    const usage = help.join('\n');
    expect(usage).toContain('\n');
    expect(usage).toContain('--check');
    const ver: string[] = [];
    expect(await main(['--version'], { log: (t: string) => ver.push(t) })).toBe(0);
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    expect(ver).toEqual([`snote ${pkg.version}`]);
  });

  it('5: WHEN src/cli/main.tsx is scanned THEN every console or stream write inside main() before `guardOutputStream(process.stdout)` goes through `sanitizeForTerminal`', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'cli', 'main.tsx'), 'utf8');
    const start = src.indexOf('export async function main(');
    const guard = src.indexOf('guardOutputStream(process.stdout)');
    expect(start).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(start);
    const before = src.slice(start, guard);
    const raw = before.split('\n').filter((l) => /console\.(log|error|warn|info)|process\.(stdout|stderr)\.write/.test(l));
    expect(raw).toEqual(['  const rawLog = io?.log ?? console.log;']);
    expect(before).toContain('const log = (text: string): void => rawLog(sanitizeForTerminal(text));');
    // nothing calls rawLog except the wrapper
    expect(before.split('rawLog(').length - 1).toBe(1);
    expect(src.slice(guard).includes('rawLog(')).toBe(false);
  });
});
