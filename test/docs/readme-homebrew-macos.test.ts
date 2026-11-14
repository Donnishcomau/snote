/**
 * #448: README and SECURITY.md give the macOS Homebrew install (Apple silicon, Terminal, the flock formula, data at the
 * XDG path, no bar button, pbcopy), in the same shape as the Linux Homebrew text of #445, and say how the macOS lock and
 * copy programs are run.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { flockBin } from '../../src/core/instance-lock';

const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
const security = fs.readFileSync(path.join(process.cwd(), 'SECURITY.md'), 'utf8');
const section = (text: string, heading: string): string => {
  const at = text.indexOf(heading + '\n');
  const next = text.indexOf('\n## ', at + heading.length);
  return at < 0 ? '' : text.slice(at, next < 0 ? undefined : next);
};

describe('#448 macOS Homebrew install text', () => {
  it('1: WHEN README.md is read THEN `## Install on macOS (Homebrew)` comes after `## Install on other Linux (Homebrew)` and before `## Updating`, links https://brew.sh before `brew install donnishcomau/snote/snote`, says Homebrew installs Node.js and `flock`, keeps notes in `~/.local/share/snote` not under `~/Library`, and names no bar button, `pbcopy` and the `snote --check` sentence', () => {
    const lx = readme.indexOf('## Install on other Linux (Homebrew)\n');
    const mac = readme.indexOf('## Install on macOS (Homebrew)\n');
    const up = readme.indexOf('## Updating\n');
    expect([lx > -1, mac > lx, up > mac]).toEqual([true, true, true]);
    const s = section(readme, '## Install on macOS (Homebrew)');
    expect(s.indexOf('then run `brew install donnishcomau/snote/snote`')).toBeGreaterThan(s.indexOf('https://brew.sh'));
    expect(s.indexOf('https://brew.sh')).toBeGreaterThan(-1);
    for (const line of ['Apple silicon', 'Homebrew installs Node.js and `flock` for snote', '`~/.local/share/snote`', 'not under `~/Library`', '`brew uninstall snote` leaves that folder', 'no bar button on macOS', '`pbcopy`', 'Run `snote --check` to see whether `/usr/bin/pbcopy` was found.']) expect(s).toContain(line);
    expect(s).not.toMatch(/one[ -]step/i);
  });

  it('2: WHEN SECURITY.md `## Install, update and uninstall` is read THEN the Homebrew bullet says `Linux and macOS`, and a macOS bullet says flock runs only from `/opt/homebrew/opt/flock/bin/flock` (Apple silicon) or `/usr/local/opt/flock/bin/flock` (Intel), never from `PATH`, copy uses `/usr/bin/pbcopy` never through a shell, and a missing flock is said at start', () => {
    const s = section(security, '## Install, update and uninstall').replace(/\n {2}/g, ' ');
    for (const line of [
      '(`brew install donnishcomau/snote/snote`, Linux and macOS)',
      'snote runs it only from `/opt/homebrew/opt/flock/bin/flock` (Apple silicon) or `/usr/local/opt/flock/bin/flock` (Intel), never from your `PATH`',
      'copies with `/usr/bin/pbcopy`, the text on its input and never through a shell',
      'snote says at start that it runs without the kernel lock',
    ]) expect(s).toContain(line);
  });

  it('3: WHEN the source is read THEN the paths SECURITY.md names are the ones snote runs: flockBin() gives `/opt/homebrew/opt/flock/bin/flock` on darwin arm64 and `/usr/local/opt/flock/bin/flock` on darwin x64 (src/core/instance-lock.ts), and `/usr/bin/pbcopy` is the darwin row of src/core/clipboard.ts', () => {
    const src = (f: string) => fs.readFileSync(path.join(process.cwd(), 'src', 'core', f), 'utf8');
    expect([flockBin('darwin', 'arm64'), flockBin('darwin', 'x64'), src('clipboard.ts').includes("darwin: ['/usr/bin/pbcopy']")]).toEqual(['/opt/homebrew/opt/flock/bin/flock', '/usr/local/opt/flock/bin/flock', true]);
  });

  it('4: WHEN README.md is read THEN the paragraph holding `bash snote-install` has `This installer is for Linux only; on a Mac, use "Install on macOS (Homebrew)" below.` between `bash snote-install` and `It writes only`, once, and the heading `## Install on macOS (Homebrew)` exists', () => {
    const sentence = 'This installer is for Linux only; on a Mac, use "Install on macOS (Homebrew)" below.';
    const at = readme.indexOf('bash snote-install');
    const start = readme.lastIndexOf('\n', at) + 1;
    const end = readme.indexOf('\n', at);
    const paragraph = readme.slice(start, end);
    const install = paragraph.indexOf('bash snote-install');
    const words = paragraph.indexOf(sentence);
    const writes = paragraph.indexOf('It writes only');
    expect([readme.split(sentence).length - 1, words > install, writes > words]).toEqual([1, true, true]);
    // L1: the heading the sentence calls "below" comes after this paragraph, so moving the section above it fails.
    expect(readme.indexOf('## Install on macOS (Homebrew)\n')).toBeGreaterThan(end);
  });

  it('5: WHEN README.md is read THEN the lines from `## What it is` up to `## How it works` are each at most 100 characters, the text lines between the two headings and `## How it works` number exactly 5, and the text holds `Simperium`, `16 ANSI` and `Electron`', () => {
    const start = readme.indexOf('## What it is');
    const end = readme.indexOf('\n## How it works');
    const lines = readme.slice(start, end).split('\n').filter((line) => line !== '');
    const text = lines.filter((line) => !line.startsWith('## '));
    expect([start > -1, end > start, lines.every((line) => line.length <= 100), text.length]).toEqual([true, true, true, 5]);
    for (const word of ['Simperium', '16 ANSI', 'Electron']) expect(readme.slice(start, end)).toContain(word);
  });
});
