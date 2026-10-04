import { Box, Text } from 'ink';
import React from 'react';
import { Divider } from './Divider';
import { PaneHeading } from './PaneHeading';

interface TagPaneProps {
  tags: string[];
  selectedIndex: number;
  focused: boolean;
  width: number;
  height: number;
  trashRow?: boolean;
  divider?: boolean;
}

/**
 * Tags pane - displays a list of tags with a header and selection marker.
 */
export function TagPane({
  tags,
  selectedIndex,
  focused,
  width,
  height,
  trashRow = false,
  divider = false,
}: TagPaneProps): React.JSX.Element {
  // with trashRow the Trash row follows Untagged (the vendored SELECT_TRASH collection)
  const rows = trashRow ? ['All notes', ...tags, 'Untagged', 'Trash'] : ['All notes', ...tags, 'Untagged'];

  // Reserve 1 line for header
  const visibleStart = Math.max(0, selectedIndex - Math.floor((height - 1) / 2));
  const visibleEnd = Math.min(rows.length, visibleStart + height - 1);

  // indicate hidden rows without changing the pane's height: `… N more` replaces
  // the text of the first visible row when rows are hidden above, and of the last
  // visible row when rows are hidden below.
  const hiddenAbove = visibleStart;
  const hiddenBelow = rows.length - visibleEnd;
  const moreAboveSlot = hiddenAbove > 0 ? 0 : -1;
  const moreBelowSlot = hiddenBelow > 0 ? Math.max(visibleEnd - visibleStart - 1, 0) : -1;
  const labels = rows.slice(visibleStart, visibleEnd).map((tag, idx) => {
    if (idx === moreAboveSlot) return '… ' + hiddenAbove + ' more';
    if (idx === moreBelowSlot && idx !== moreAboveSlot) return '… ' + hiddenBelow + ' more';
    return String(tag ?? '');
  });

  const content = (
    <Box flexDirection="column" width={width} height={height}>
      <PaneHeading label="Tags" focused={focused} />
      {labels.map((label, idx) => {
        const actualIndex = visibleStart + idx;
        const isSelected = actualIndex === selectedIndex;
        // indicator rows keep the marker column but as a non-breaking space:
        // a frame line whose only content is a bare `<Text> </Text>` gets dropped by ink-testing-library
        const isMore = idx === moreAboveSlot || (idx === moreBelowSlot && idx !== moreAboveSlot);
        return (
          <Box key={actualIndex}>
            {isMore ? <Text>{'\u00a0'}</Text> : isSelected ? <Text bold>{'>'}</Text> : actualIndex === 0 || actualIndex === rows.length - 1 || (trashRow && actualIndex === rows.length - 2) ? <Text>{'·'}</Text> : <Text>{' '}</Text>}
            <Text>{label.slice(0, width - 2)}</Text>
          </Box>
        );
      })}
    </Box>
  );

  if (divider) {
    return (
      <Box flexDirection="row" width={width} height={height}>
        <Box flexDirection="column" width={width - 1} height={height}>{content}</Box>
        <Divider height={height} />
      </Box>
    );
  }

  return content;
}

export default TagPane;
