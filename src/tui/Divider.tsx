import { Box, Text } from 'ink';
import React from 'react';

interface DividerProps {
  height: number;
}

/**
 * Vertical divider: a single-column "│" line spanning `height` rows.
 */
export function Divider({ height }: DividerProps): React.JSX.Element {
  return (
    <Box width={1} height={height} flexDirection="column">
      <Text color="gray">
        {Array.from({ length: Math.max(0, height) }, () => '│').join('\n')}
      </Text>
    </Box>
  );
}

export default Divider;
