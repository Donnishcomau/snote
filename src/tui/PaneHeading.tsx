import React from 'react';
import { Text } from 'ink';

import { theme } from './theme';

/**
 * One shared pane heading, styled by the theme's heading roles.
 */
export function PaneHeading({ label, focused = false }: { label: string; focused?: boolean }): React.JSX.Element {
  return (
    <Text {...(focused ? theme.headingFocused : { ...theme.accent, ...theme.heading })}>
      {label}
    </Text>
  );
}

export default PaneHeading;
