import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { theme } from './theme';
import { sanitizeForTerminal } from '../core/sanitize';
import { currentBanner, dismissBanner, onBanner } from '../core/update-banner';

/**
 * The update banner row (#66): `Update available: <running> -> <new>`
 * above the panes while a newer release is known and not dismissed,
 * and nothing otherwise. It sits outside the notice line, so a key
 * press does not clear it. A banner published before the first render
 * still shows.
 */
export function BannerRow(): React.JSX.Element | null {
  const [banner, setBanner] = useState(currentBanner);
  useEffect(() => {
    setBanner(currentBanner());
    return onBanner(() => setBanner(currentBanner()));
  }, []);
  if (banner === null) {
    return null;
  }
  return (
    <Text color={theme.warning.color} wrap="truncate-end">
      {sanitizeForTerminal(`Update available: ${banner.running} -> ${banner.available}`)}
    </Text>
  );
}

/**
 * Escape in the plain list hides the banner for the version it names.
 * Returns true when it did, so the key does nothing else; false when
 * the key is not Escape or no banner is showing.
 */
export function dismissOnEscape(keyName: string): boolean {
  if (keyName === 'Escape' && currentBanner() !== null) {
    dismissBanner();
    return true;
  }
  return false;
}
