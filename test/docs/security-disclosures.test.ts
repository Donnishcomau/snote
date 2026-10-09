// Acceptance tests for T428: SECURITY.md, README.md and manifest.json must
// disclose what snote sends over the network, what the bar shows, and what
// install, update and uninstall do or leave behind.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const security = readFileSync('SECURITY.md', 'utf8');
const readme = readFileSync('README.md', 'utf8');

function section(md: string, heading: string): string {
  const start = md.indexOf('## ' + heading);
  expect(start).toBeGreaterThan(-1);
  const next = md.indexOf('\n## ', start);
  return next === -1 ? md.slice(start) : md.slice(start, next);
}

describe('security disclosures in SECURITY.md, README.md and manifest.json (T428)', () => {
  it('1: WHEN SECURITY.md is read THEN it contains `## What snote sends over the network`, `auth.simperium.com`, `app.simplenote.com`, `skryf.art`, `bearer token`, `SNOTE_UPDATE_CHECK=off` and `no telemetry`.', () => {
    expect(security).toContain('## What snote sends over the network');
    expect(security).toContain('auth.simperium.com');
    expect(security).toContain('app.simplenote.com');
    expect(security).toContain('skryf.art');
    expect(security).toContain('bearer token');
    expect(security).toContain('SNOTE_UPDATE_CHECK=off');
    expect(security).toContain('no telemetry');
  });

  it('2: WHEN SECURITY.md is read THEN it contains `## What the bar shows`, `40 characters` and `status.json`, and `## Install, update and uninstall` with `omarchy-install-dev-env node`, `mise`, `~/.local/share/snote`, `~/.local/state/snote` and `reviewed, released commits`.', () => {
    expect(security).toContain('## What the bar shows');
    expect(security).toContain('40 characters');
    expect(security).toContain('status.json');
    expect(security).toContain('## Install, update and uninstall');
    expect(security).toContain('omarchy-install-dev-env node');
    expect(security).toContain('mise');
    expect(security).toContain('~/.local/share/snote');
    expect(security).toContain('~/.local/state/snote');
    expect(security).toContain('reviewed, released commits');
  });

  it('3: WHEN SECURITY.md is read THEN it contains `INK_SCREEN_READER`, and still contains `security advisories`.', () => {
    expect(security).toContain('INK_SCREEN_READER');
    expect(security).toContain('security advisories');
  });

  it('4: WHEN README.md is read THEN `split(\'\\n\').length` is at most `199`, its `## Updating` section contains `reviewed, released commits`, its `## Sync and data` section contains `skryf.art` and `SECURITY.md`, and it contains `INK_SCREEN_READER`.', () => {
    expect(readme.split('\n').length).toBeLessThanOrEqual(199);
    expect(section(readme, 'Updating')).toContain('reviewed, released commits');
    const sync = section(readme, 'Sync and data');
    expect(sync).toContain('skryf.art');
    expect(sync).toContain('SECURITY.md');
    expect(readme).toContain('INK_SCREEN_READER');
  });

  it('5: WHEN manifest.json is parsed THEN `description` contains `install Node.js through Omarchy (mise)` and `no build step` and has at most `500` characters.', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as { description: string };
    expect(manifest.description).toContain('install Node.js through Omarchy (mise)');
    expect(manifest.description).toContain('no build step');
    expect(manifest.description.length).toBeLessThanOrEqual(500);
  });
});
