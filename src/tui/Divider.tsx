import { Box, Text } from 'ink';
import React from 'react';
import { theme } from './theme';

interface DividerProps {
  height: number;
}

/**
 * Vertical divider: a single-column "│" line spanning `height` rows.
 */
export function Divider({ height }: DividerProps): React.JSX.Element {
  return (
    <Box width={1} height={height} flexDirection="column">
      <Text {...theme.muted}>
        {Array.from({ length: Math.max(0, height) }, () => '│').join('\n')}
      </Text>
    </Box>
  );
}

export default Divider;
