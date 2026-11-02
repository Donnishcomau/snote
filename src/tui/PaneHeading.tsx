import React from 'react';
import { Box, Text } from 'ink';

import { theme } from './theme';

/**
 * One shared pane heading, styled by the theme's heading roles.
 * #73: given the pane width, the focused heading is a full-width accent bar;
 * the one-line box clips the padding to the width the pane really gets.
 */
export function PaneHeading({ label, focused = false, width }: { label: string; focused?: boolean; width?: number }): React.JSX.Element {
  if (focused && width !== undefined) {
    return (
      <Box height={1} overflow="hidden">
        <Text {...theme.headingFocused} {...theme.accent}>
          {label.padEnd(width)}
        </Text>
      </Box>
    );
  }
  return (
    <Text {...(focused ? theme.headingFocused : { ...theme.accent, ...theme.heading })}>
      {label}
    </Text>
  );
}

export default PaneHeading;
