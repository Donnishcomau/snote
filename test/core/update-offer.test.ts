/**
 * Issue #30 L5a1: the update offer and the y request. The offer is the banner, only after main() allowed it for an
 * install canOfferUpdate accepts with the check on, and only while both versions are plain digits; a y records the
 * hand-off only while an offer stands. Nothing here starts a process.
 */
import * as fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { publishBanner, resetBanner } from '../../src/core/update-banner';
import { allowUpdateOffer, currentOffer, handOffRequested, requestHandOff, resetUpdateOffer } from '../../src/core/update-offer';

afterEach(() => {
  resetBanner();
  resetUpdateOffer();
});

describe('issue #30 L5a1 update offer', () => {
  it('1: WHEN a banner `0.2.11` -> `0.2.12` is published and no offer was allowed THEN currentOffer is null, requestHandOff returns false and handOffRequested is null', () => {
    publishBanner('0.2.11', '0.2.12');
    expect(currentOffer()).toBeNull();
    expect(requestHandOff()).toBe(false);
    expect(handOffRequested()).toBeNull();
  });

  it('2: WHEN the plugin offer is allowed and a banner `0.2.11` -> `0.2.12` is published THEN currentOffer is that pair, requestHandOff returns true and handOffRequested is `plugin`', () => {
    allowUpdateOffer('plugin');
    expect(requestHandOff()).toBe(false);
    publishBanner('0.2.11', '0.2.12');
    expect(currentOffer()).toEqual({ running: '0.2.11', available: '0.2.12' });
    expect(requestHandOff()).toBe(true);
    expect(handOffRequested()).toBe('plugin');
  });

  it('3: WHEN a published version is `0.2.12; rm -rf ~`, `v0.2.12`, `0.2.12\\n`, `0.2.12\\x1b]52;c;ZXZpbA==\\x07` or `０.２.１２` THEN currentOffer is null and requestHandOff returns false for a plugin install', () => {
    allowUpdateOffer('plugin');
    for (const bad of ['0.2.12; rm -rf ~', 'v0.2.12', '0.2.12\n', '0.2.12\x1b]52;c;ZXZpbA==\x07', '０.２.１２']) {
      resetBanner();
      publishBanner('0.2.11', bad);
      expect({ bad, offer: currentOffer(), y: requestHandOff() }).toEqual({ bad, offer: null, y: false });
      resetBanner();
      publishBanner(bad, '0.2.12');
      expect({ bad, offer: currentOffer(), y: requestHandOff() }).toEqual({ bad, offer: null, y: false });
    }
    expect(handOffRequested()).toBeNull();
  });

  it('4: WHEN src/cli/main.tsx is read THEN the offer is allowed only inside the lazy install-kind block, after the updateCheckEnabled and updateChecksFor returns, as `if (canOfferUpdate(runningInstallKind())) allowUpdateOffer(runningInstallKind());`, and src/core/update-offer.ts imports install-kind only as a type and holds no `child_process`, `spawn` or `exec`', () => {
    const main = fs.readFileSync('src/cli/main.tsx', 'utf8');
    const enabled = main.indexOf('if (!updateCheckEnabled(process.env)) return;');
    const checks = main.indexOf('if (!updateChecksFor(runningInstallKind())) return;');
    const allow = main.indexOf('if (canOfferUpdate(runningInstallKind())) allowUpdateOffer(runningInstallKind());');
    expect({ enabled: enabled > 0, checks: checks > enabled, allow: allow > checks }).toEqual({ enabled: true, checks: true, allow: true });
    expect(main.split('allowUpdateOffer(').length - 1).toBe(1); // the one call
    const offer = fs.readFileSync('src/core/update-offer.ts', 'utf8');
    expect(offer).toContain("import type { InstallKind } from './install-kind';");
    expect(offer).not.toMatch(/child_process|spawn|exec/);
  });
});
