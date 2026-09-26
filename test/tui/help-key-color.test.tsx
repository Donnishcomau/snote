/**
 * Help overlay: highlight the key, not the whole line (T254).
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Help } from '../../src/tui/Help';
import { keymap } from '../../src/core/keymap';

/**
 * Dynamically load chalk from within ink's node_modules so we can
 * force ANSI output (level 3) for tests.
 */
async function forceChalkLevel3(): Promise<void> {
  const createRequire = (await import('module')).createRequire;
  const path = await import('path');
  const { pathToFileURL } = await import('url');
  const inkResolved = createRequire(import.meta.url).resolve('ink');
  const inkPkgDir = path.dirname(
    path.dirname(inkResolved)
  );
  const chalkPath = path.join(inkPkgDir, 'node_modules/chalk/source/index.js');
  const chalk = await import(
    pathToFileURL(chalkPath).href
  );
  (chalk.default as any).level = 3;
}

describe('Help key color (T254)', () => {
  it('1: WHEN <Help width={80} height={24} entries={[{key:\'j\',action:\'move_down\',description:\'Move down\'}]} /> renders with chalk forced to level 3 THEN the frame contains the exact \\u001b[36mj       \\u001b[39m  Move down', async () => {
    await forceChalkLevel3();
    const { frames, unmount } = render(
      <Help
        width={80}
        height={24}
        entries={[{ key: 'j', action: 'move_down', description: 'Move down' }]}
      />
    );
    await new Promise((r) => setTimeout(r, 50));
    const joined = frames.join('\n');
    expect(joined).toContain('\u001b[36mj       \u001b[39m  Move down');
    unmount();
  });

  it('2: WHEN the same renders WITHOUT forcing chalk THEN the frame contains the exact line \\u2502  j         Move down and no \\u001b[ escape appears anywhere in the frame', async () => {
    // Reset chalk level (may still be 3 from test 1 since they share process)
    const { createRequire } = await import('module');
    const pathPkg = await import('path');
    const { pathToFileURL } = await import('url');
    const inkResolved = createRequire(import.meta.url).resolve('ink');
    const inkPkgDir = pathPkg.dirname(pathPkg.dirname(inkResolved));
    const chalkPath = pathPkg.join(inkPkgDir, 'node_modules/chalk/source/index.js');
    const chalkModule = await import(pathToFileURL(chalkPath).href);
    (chalkModule.default as any).level = 0;

    const { frames, unmount } = render(
      <Help
        width={80}
        height={24}
        entries={[{ key: 'j', action: 'move_down', description: 'Move down' }]}
      />
    );
    await new Promise((r) => setTimeout(r, 50));
    const joined = frames.join('\n');
    // the visible line with the box drawing character and padded key
    expect(joined).toContain('│  j         Move down');
    // no ANSI escapes appear in the frame when chalk is not forced
    expect(joined).not.toMatch(/\x1b\[/);
    unmount();
  });

  it('3: WHEN <Help width={80} height={24} entries={[{key:\'Escape\',action:\'close\',description:\'Close overlay / back\'}]} /> renders with chalk forced THEN the frame contains the exact \\u001b[36mEscape  \\u001b[39m  Close overlay / back', async () => {
    await forceChalkLevel3();
    const { frames, unmount } = render(
      <Help
        width={80}
        height={24}
        entries={[
          { key: 'Escape', action: 'close', description: 'Close overlay / back' },
        ]}
      />
    );
    await new Promise((r) => setTimeout(r, 50));
    const joined = frames.join('\n');
    expect(joined).toContain('\u001b[36mEscape  \u001b[39m  Close overlay / back');
    unmount();
  });
});
