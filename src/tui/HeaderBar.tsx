import { Text, useIsScreenReaderEnabled } from 'ink';
import React from 'react';
import { theme } from './theme';

/**
 * #134: the header row at the top of the main screen, the snote mark `>_ snote`
 * (`>_` in the accent blue, `snote` bold). Fixed text only: no note, tag, search
 * or server text reaches it. Screen-reader mode shows the plain word `snote`.
 * Root draws it from 8 rows up.
 * proof: test/tui/header-bar.test.tsx
 */
export function HeaderBar(): React.JSX.Element {
  if (useIsScreenReaderEnabled()) return <Text>snote</Text>;
  return (
    <Text>
      <Text {...theme.accent}>{'>_'}</Text>
      <Text bold>{' snote'}</Text>
    </Text>
  );
}
