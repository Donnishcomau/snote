/**
 * #556 L3: a snote whose real entry path is under `<home>/.local/share/snote-app/app` (the
 * packaging/direct/install layout) is the install kind `direct`; it runs the update check like
 * any non-package kind, and since #30 lane L5c it is offered the one-key update like the plugin.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { canOfferUpdate, installKind, updateChecksFor } from '../../src/core/install-kind';

const tmps: string[] = [];
const mk = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'snote-kind-direct-'));
  tmps.push(d);
  return fs.realpathSync(d);
};
afterEach(() => {
  for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('#556 L3 install kind direct', () => {
  it('1: WHEN the real entry path is under `<home>/.local/share/snote-app/app` THEN the kind is `direct` (also through a symlinked share folder and with XDG_DATA_HOME elsewhere), a sibling folder, a missing share folder or no home parameter is not, and `updateChecksFor` and `canOfferUpdate` are both true (#30 L5c)', () => {
    const home = mk();
    const share = path.join(home, '.local', 'share');
    const app = path.join(share, 'snote-app', 'app');
    fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(app, 'cli.js'), '');
    const xdg = mk();
    expect(installKind({ entry: path.join(app, 'cli.js'), dataHome: xdg, home })).toBe('direct');
    // the plugin folder still wins its own path
    const plugin = path.join(xdg, 'omarchy-snote-plugin', 'app');
    fs.mkdirSync(plugin, { recursive: true });
    fs.writeFileSync(path.join(plugin, 'cli.js'), '');
    expect(installKind({ entry: path.join(plugin, 'cli.js'), dataHome: xdg, home })).toBe('plugin');
    // a share folder reached through a symlink resolves to the same real path
    const home2 = mk();
    fs.mkdirSync(path.join(home2, '.local'));
    fs.symlinkSync(share, path.join(home2, '.local', 'share'));
    expect(installKind({ entry: path.join(app, 'cli.js'), dataHome: xdg, home: home2 })).toBe('direct');
    // a look-alike sibling, no home parameter, and a home without a share folder
    const sib = path.join(share, 'snote-app', 'app2');
    fs.mkdirSync(sib);
    fs.writeFileSync(path.join(sib, 'cli.js'), '');
    expect(installKind({ entry: path.join(sib, 'cli.js'), dataHome: xdg, home })).toBe('unknown');
    expect(installKind({ entry: path.join(app, 'cli.js'), dataHome: xdg })).toBe('unknown');
    expect(installKind({ entry: path.join(app, 'cli.js'), dataHome: xdg, home: mk() })).toBe('unknown');
    expect(installKind({ entry: path.join(plugin, 'cli.js'), dataHome: xdg, home: mk() })).toBe('plugin');
    expect(updateChecksFor('direct')).toBe(true);
    expect(canOfferUpdate('direct')).toBe(true);
  });
});
