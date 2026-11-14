/**
 * #442: a Homebrew install is its own kind. The running cli.js lies in a keg
 * `<prefix>/Cellar/snote/<version>/` for any prefix; that kind runs no update
 * check, is never offered the one-key update, and `snote --check` names it and
 * its one updater (`brew upgrade snote`), and the plugin build when both exist.
 * No network: the update check is never reached.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';

import { canOfferUpdate, installKind, installReport, updateChecksFor } from '../../src/core/install-kind';
import { main } from '../../src/cli/main';

const tmps: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-brew-'));
  tmps.push(d);
  return fs.realpathSync(d);
};
const saved = { argv1: process.argv[1], xdg: process.env.XDG_DATA_HOME, path: process.env.PATH };
afterEach(() => {
  process.argv[1] = saved.argv1;
  if (saved.xdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = saved.xdg;
  process.env.PATH = saved.path;
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const identity = (p: string): string => p;

/** Every file under `dir` with its size and mtime, to show nothing wrote there. */
function listing(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const st = fs.lstatSync(p);
      out.push(`${path.relative(dir, p)} ${st.size} ${st.mtimeMs}`);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}

describe('#442 homebrew install kind', () => {
  it('1: WHEN the real cli.js path lies in `<prefix>/Cellar/snote/<version>/` for `/opt/homebrew`, `/usr/local`, `/home/linuxbrew/.linuxbrew` and a custom prefix THEN the kind is `homebrew`, and `/usr/local/lib/snote/cli.js` is still `package`', () => {
    const data = mk();
    const kind = (entry: string) => installKind({ entry, dataHome: data, realpath: identity, hasGit: () => false });
    expect(
      ['/opt/homebrew', '/usr/local', '/home/linuxbrew/.linuxbrew', '/srv/brew'].map((prefix) => [
        prefix,
        kind(`${prefix}/Cellar/snote/0.2.12/libexec/cli.js`),
      ])
    ).toEqual([
      ['/opt/homebrew', 'homebrew'],
      ['/usr/local', 'homebrew'],
      ['/home/linuxbrew/.linuxbrew', 'homebrew'],
      ['/srv/brew', 'homebrew'],
    ]);
    expect(kind('/usr/local/lib/snote/cli.js')).toBe('package');
    expect(kind('/opt/homebrew/Cellar/other/1.0/libexec/cli.js')).toBe('unknown');
    expect(kind('/opt/homebrew/Cellar/snote/cli.js')).toBe('unknown');
  });

  it('2: WHEN the kind is `homebrew` THEN `updateChecksFor` and `canOfferUpdate` are both false (no git ls-remote, no one-key update)', () => {
    expect([updateChecksFor('homebrew'), canOfferUpdate('homebrew')]).toEqual([false, false]);
    expect(updateChecksFor('plugin')).toBe(true);
  });

  it('3: WHEN `installReport` is asked for `homebrew` without and with the plugin build THEN it is `install: homebrew (updates come from brew upgrade snote)`, then that line and `install: plugin too (update the Omarchy bar plugin with omarchy plugin update)`; for `plugin` with the build it is `install: plugin` only', () => {
    expect(installReport('homebrew', false)).toBe('install: homebrew (updates come from brew upgrade snote)');
    expect(installReport('homebrew', true)).toBe(
      'install: homebrew (updates come from brew upgrade snote)\ninstall: plugin too (update the Omarchy bar plugin with omarchy plugin update)'
    );
    expect(installReport('plugin', true)).toBe('install: plugin');
  });

  it("4: WHEN process.argv[1] is a cli.js in a temp keg `<tmp>/Cellar/snote/0.2.12/libexec/` and main(['--check', '--data-dir', dir], io) runs THEN it resolves 0, the logged text holds `install: homebrew (updates come from brew upgrade snote)` and the keg's listing is unchanged", async () => {
    const prefix = mk();
    const keg = path.join(prefix, 'Cellar', 'snote', '0.2.12');
    fs.mkdirSync(path.join(keg, 'libexec'), { recursive: true });
    fs.writeFileSync(path.join(keg, 'libexec', 'cli.js'), '');
    const before = listing(keg);
    const dir = mk();
    process.env.XDG_DATA_HOME = mk();
    process.env.PATH = '/nonexistent-snote';
    process.argv[1] = path.join(keg, 'libexec', 'cli.js');
    const logged: string[] = [];
    const code = await main(['--check', '--data-dir', dir], { log: (text: string) => logged.push(text) });
    expect(code).toBe(0);
    expect(logged.join('\n')).toContain('install: homebrew (updates come from brew upgrade snote)');
    expect(listing(keg)).toEqual(before);
  });
});
