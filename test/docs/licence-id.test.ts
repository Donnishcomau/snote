/**
 * #615: snote is GPL-2.0-only (it vendors GPLv2 code with no "or later" grant). Every file that ships a licence
 * field or statement (package.json, the root of package-lock.json, manifest.json, the PKGBUILD, README.md, NOTICE and
 * scripts/vendor.sh) uses that SPDX id, and none of the text files among them uses the deprecated `GPL-2.0` alone.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string): string => readFileSync(p, 'utf8');

describe('#615 one licence id: GPL-2.0-only', () => {
  it('1: WHEN package.json, the root entry of package-lock.json and manifest.json are read THEN each license field is `GPL-2.0-only`', () => {
    const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, { license?: string }> };
    expect({
      pkg: (JSON.parse(read('package.json')) as { license?: string }).license,
      lock: lock.packages[''].license,
      manifest: (JSON.parse(read('manifest.json')) as { license?: string }).license,
    }).toEqual({ pkg: 'GPL-2.0-only', lock: 'GPL-2.0-only', manifest: 'GPL-2.0-only' });
  });

  it("2: WHEN packaging/aur/PKGBUILD, README.md, NOTICE and scripts/vendor.sh are read THEN the PKGBUILD says license=('GPL-2.0-only'), README has the line `GPL-2.0-only.`, NOTICE names `GPL-2.0-only`, vendor.sh says snote is `GPL-2.0-only`, and none of them nor package.json or manifest.json has a bare `GPL-2.0`", () => {
    const text = ['packaging/aur/PKGBUILD', 'README.md', 'NOTICE', 'scripts/vendor.sh', 'package.json', 'manifest.json'];
    expect({
      pkgbuild: read('packaging/aur/PKGBUILD').includes("license=('GPL-2.0-only')"),
      readme: read('README.md').split('\n').includes('GPL-2.0-only.'),
      notice: read('NOTICE').includes('GPL-2.0-only'),
      vendorsh: read('scripts/vendor.sh').includes('snote as a whole is GPL-2.0-only (LICENSE)'),
      bare: text.filter((p) => /GPL-2\.0(?!-only)/.test(read(p))),
    }).toEqual({ pkgbuild: true, readme: true, notice: true, vendorsh: true, bare: [] });
  });

  it("3: WHEN NOTICE is read THEN it names the snote copyright holder `Copyright (C) 2026 Donnish Pty Ltd` and repeats README's affiliation sentence word for word", () => {
    const flat = (t: string): string => t.replace(/\s+/g, ' ');
    const affiliation = 'It is not affiliated with, endorsed by, or supported by Automattic.';
    expect({
      holder: flat(read('NOTICE')).includes('Copyright (C) 2026 Donnish Pty Ltd, for snote\'s own code.'),
      readme: read('README.md').includes(affiliation),
      notice: flat(read('NOTICE')).includes(affiliation),
    }).toEqual({ holder: true, readme: true, notice: true });
  });

  it("4: WHEN NOTICE and the 24 vendored notices are read THEN NOTICE says a notice's date is the day it was added and a later change is dated by the first release that ships it, and each notice carries the day it was added to its file", () => {
    const flat = read('NOTICE').replace(/\s+/g, ' ');
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const dated = walk('vendor/simplenote').flatMap((f) => {
      const m = /^\/\/ OMARCHY: modified for snote from Automattic's simplenote-electron \(GPLv2\); see NOTICE \((\d{4}-\d{2}-\d{2})\)\.$/.exec(read(f).split('\n')[0]);
      return m ? [[f.slice('vendor/simplenote/'.length), m[1]] as const] : [];
    });
    expect({
      rule: flat.includes("The date in a file's notice is the day snote added that notice to the file; a later change to the file is dated by the first snote release that ships it."),
      notices: dated.length,
      // the day each notice was added (git log of the private repo, #615 rev3); the other 17 were added on 2026-09-23
      later: Object.fromEntries(dated.filter(([, d]) => d !== '2026-09-23')),
    }).toEqual({
      rule: true,
      notices: 24,
      later: {
        'search/index.ts': '2026-10-23',
        'state/action-types.ts': '2026-11-07',
        'state/selectors.ts': '2026-11-07',
        'state/simperium/functions/bucket-queue.test.ts': '2026-11-07',
        'state/simperium/functions/connection-monitor.ts': '2026-10-21',
        'state/simperium/functions/unconfirmed-changes.ts': '2026-11-07',
        'utils/tag-hash.ts': '2026-10-28',
      },
    });
  });

  it("5: WHEN the 5 changed vendored lines of are read THEN each carries `// OMARCHY:` or its statement starts under an `// OMARCHY:` line, and NOTICE says changed lines are marked `on the line or above the changed block`", () => {
    // (#832): changed lines against upstream 9fddf71c that carried no marker. [file, the changed line's text, how many
    // lines above it the marker sits: 0 = on the line; otherwise the marker line opens the statement that holds the change,
    // because esbuild keeps a comment inside an expression in the bundle and drops one before a statement (start bytes, #817)]
    const changed: [string, string, number][] = [
      ['state/simperium/middleware.ts', 'ghostStoreProvider: ghostStoreProvider', 0],
      ['state/simperium/middleware.ts', 'confirmBeforeClosingTab();', 0],
      ['state/simperium/middleware.ts', "noteBucket.channel.on('update', announceNoteUpdates())", 4],
      ['state/simperium/middleware.ts', '(action as { noteId?: T.EntityId }).noteId ??', 2],
      ['state/simperium/functions/connection-monitor.ts', "client.on('message', (data: string) => {", 0],
    ];
    const marked = changed.map(([f, text, up]) => {
      const lines = read(join('vendor/simplenote', f)).split('\n');
      const at = lines.findIndex((l) => l.includes(text));
      if (at < up) return false;
      return up === 0 ? lines[at].includes('// OMARCHY:') : lines[at - up].trim().startsWith('// OMARCHY:');
    });
    expect({
      marked,
      notice: read('NOTICE').replace(/\s+/g, ' ').includes('changed lines are marked with `// OMARCHY:` comments, on the line or above the changed block.'),
    }).toEqual({ marked: [true, true, true, true, true], notice: true });
  });
});
