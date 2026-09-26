import { Box, Text } from 'ink';
import React from 'react';

interface StatusBarProps {
  connected: boolean;
  count: number;
  width: number;
  label?: string;
  pending?: number;
}

/**
 * Status bar - shows connection status and note count.
 */
export function StatusBar({ connected, count, width, label, pending }: StatusBarProps): React.JSX.Element {
  const statusText = connected ? 'connected' : 'offline';
  const statusColor = connected ? 'green' : 'red';
  
  return (
    <Box>
      <Text color="gray">[</Text>
      <Text color={statusColor}>{statusText}</Text>
      <Text color="gray">]</Text>
      <Text> </Text>
      <Text>{count} notes</Text>
      {pending && pending > 0 ? <Text color="yellow"> {pending} pending</Text> : null}
      {label ? <Text color="yellow"> {label}</Text> : null}
    </Box>
  );
}

export default StatusBar;
