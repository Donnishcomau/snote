import { Box, Text } from 'ink';
import React from 'react';

interface HistoryProps {
  rows: string[];
  selectedIndex: number;
  loading: boolean;
  width: number;
  height: number;
}

/**
 * History list component - shows a note's version history with one row selected.
 */
export function History({
  rows,
  selectedIndex,
  loading,
  width,
  height,
}: HistoryProps): React.JSX.Element {
  const listHeight = height - 3;
  const colWidth = Math.floor(width * 0.4);

  const visibleStart = Math.max(0, selectedIndex - Math.floor(listHeight / 2));
  const visibleEnd = Math.min(rows.length, visibleStart + listHeight);

  const truncate = (text: string): string => {
    if (text.length > colWidth - 2) {
      return text.slice(0, colWidth - 4) + '..';
    }
    return text;
  };

  return (
    <Box flexDirection="column" height={listHeight} width={colWidth}>
      <Text bold>History</Text>
      <Box flexDirection="column">
        {rows.length === 0 ? (
          <Box>
            <Text>{loading ? 'loading...' : 'no earlier versions'}</Text>
          </Box>
        ) : (
          rows.slice(visibleStart, visibleEnd).map((row, idx) => {
            const actualIndex = visibleStart + idx;
            const isSelected = actualIndex === selectedIndex;
            const truncated = truncate(row);
            return (
              <Box key={idx}>
                {isSelected && <Text bold>{'>'}</Text>}
                {!isSelected && <Text> </Text>}
                <Text>{truncated}</Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

export default History;
