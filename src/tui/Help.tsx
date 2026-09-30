import { Box, Text } from 'ink';
import React from 'react';
import { keymap, KeymapEntry } from '../core/keymap';
import { SECTIONS } from '../core/help-sections';
import { editorFinishHint } from '../core/editor-select';
import { layoutHelp } from '../core/help-layout';

interface HelpProps {
  width: number;
  height: number;
  entries?: KeymapEntry[];
  editor?: string;
}

/**
 * Split entries into consecutive chunks of `rows` each,
 * returning an array of arrays (new arrays, never mutates `entries`).
 */
export function helpColumns(entries: KeymapEntry[], rows: number): KeymapEntry[][] {
  const n = Math.max(1, rows);
  if (entries.length === 0) return [];
  const result: KeymapEntry[][] = [];
  for (let i = 0; i < entries.length; i += n) {
    result.push(entries.slice(i, i + n));
  }
  return result;
}

/**
 * Render a single section: header + keymap rows chunked into columns.
 * `rowWidth` is the max character width available per line (used for truncation).
 * `maxRows` limits how many entry rows to render.
 */
function Section({
  name,
  entries,
  rowWidth,
  maxRows,
}: {
  name: string;
  entries: KeymapEntry[];
  rowWidth: number;
  maxRows: number;
}): React.JSX.Element {
  // Chunk entries into sub-columns that fit within maxRows
  const subCols = helpColumns(entries, Math.max(1, maxRows));
  const subColWidth = Math.floor(rowWidth / Math.max(1, subCols.length));

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text bold>{name}</Text>
      </Box>
      <Box flexDirection="row">
        {subCols.map((colEntries, ci) => (
          <Box key={ci} flexDirection="column" width={subColWidth}>
            {colEntries.map((entry) => (
              <Box key={entry.action} flexDirection="row">
                {(() => {
                  const full = entry.key.padEnd(8) + '  ' + entry.description;
                  const sliced = full.slice(0, subColWidth - 1);
                  const keyLen = Math.min(8, sliced.length);
                  const keyPart = sliced.slice(0, keyLen);
                  const restPart = sliced.slice(keyLen);
                  return (
                    <>
                      <Text color="cyan">{keyPart}</Text>
                      <Text>{restPart}</Text>
                    </>
                  );
                })()}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Help overlay - displays all keymap entries in one or more columns
 * so that every key fits on the screen.
 */
export function Help({ width, height, entries, editor }: HelpProps): React.JSX.Element {
  const contentRows = Math.max(1, height - 4);
  const displayEntries = entries ?? keymap;
  const columns = helpColumns(displayEntries, contentRows);
  const colWidth = Math.floor((width - 6) / Math.max(1, columns.length));

  // Default path: group by SECTIONS, lay out in columns
  const sectionEntries: KeymapEntry[][] = SECTIONS.map((section) =>
    keymap.filter((e) => section.actions.includes(e.action)),
  );

  const totalEntryRows = sectionEntries.reduce((sum, s) => sum + s.length, 0);
  const twoCols = width >= 100;
  const leftSections = twoCols ? sectionEntries.slice(0, 3) : sectionEntries;
  const rightSections = twoCols ? sectionEntries.slice(3) : [];
  const sectionCount = twoCols ? 3 : SECTIONS.length;

  // Distribute entry rows proportionally to each section's entry count
  const availableContent = Math.max(1, height - 4 - sectionCount);
  const sectionRowBudget = sectionEntries.map(s =>
    Math.max(1, Math.round(availableContent * s.length / totalEntryRows)),
  );

  const editorHint = editorFinishHint(editor ?? 'nvim');

  // Wide path (cols>=100): pure two-column text output. The box hugs its
  // content so the title is never scrolled off a short terminal.
  const wide = entries === undefined && width >= 100;
  const wideLines = wide ? layoutHelp(width, height, editor ?? 'nvim') : [];

  // Legacy flat-path content (preserved from original Help implementation)
  const flatContent = (
    <Box flexDirection="column" width={width} height={height}>
      <Box paddingX={2}>
        <Text bold>Help - Keyboard Shortcuts</Text>
      </Box>
      <Box flexDirection="row" paddingX={2}>
        {columns.map((colEntries, ci) => (
          <Box key={ci} flexDirection="column" width={colWidth}>
            {colEntries.map((entry) => (
              <Box key={entry.action} flexDirection="row">
                {(() => {
                  const full = entry.key.padEnd(8) + '  ' + entry.description;
                  const sliced = full.slice(0, colWidth - 1);
                  const keyLen = Math.min(8, sliced.length);
                  const keyPart = sliced.slice(0, keyLen);
                  const restPart = sliced.slice(keyLen);
                  return (
                    <>
                      <Text color="cyan">{keyPart}</Text>
                      <Text>{restPart}</Text>
                    </>
                  );
                })()}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
      <Box paddingX={2}>
        <Text>Found a bug? Run snote --report to save a report bundle.</Text>
      </Box>
    </Box>
  );

  // Narrow path (T298): when the screen is too short for the sectioned
  // layout (80x24), switch to a two-column flat list that fits every
  // entry without truncating descriptions below what fits in a column.
  const narrow = entries === undefined && width < 100 && height < 30;
  const narrowCols = narrow ? helpColumns(displayEntries, Math.ceil(displayEntries.length / 2)) : [];
  const narrowColWidth = narrow ? Math.floor((width - 6) / 2) : 0;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={wide ? wideLines.length + 2 : height}
      borderStyle="single"
    >
      {wide
        ? wideLines.map((line, i) => <Text key={i}>{line}</Text>)
        : narrow
        ? (
          <>
            <Box paddingX={2}>
              <Text bold>Help - Keyboard Shortcuts</Text>
            </Box>
            <Box flexDirection="row" paddingX={2}>
              {narrowCols.map((colEntries, ci) => (
                <Box key={ci} flexDirection="column" width={narrowColWidth}>
                  {colEntries.map((entry) => (
                    <Box key={entry.action} flexDirection="row">
                      <Text color="cyan">{entry.key.padEnd(8)}</Text>
                      <Text>{entry.description.slice(0, narrowColWidth - 9)}</Text>
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
            <Box paddingX={2}>
              <Text>Found a bug? Run snote --report to save a report bundle.</Text>
            </Box>
            <Box paddingX={2}>
              <Text>Editing: {editorHint}</Text>
            </Box>
          </>
        )
        : entries !== undefined
        ? flatContent
        : (
          <>
            <Box paddingX={2}>
              <Text bold>Help - Keyboard Shortcuts</Text>
            </Box>
            <Box flexDirection={twoCols ? 'row' : 'column'} paddingX={2}>
              <Box flexDirection="column">
                {leftSections.map((sec, i) => (
                  <Section
                    key={SECTIONS[i].name}
                    name={SECTIONS[i].name}
                    entries={sec}
                    rowWidth={width - 4}
                    maxRows={sectionRowBudget[i] ?? 1}
                  />
                ))}
              </Box>
              {rightSections.length > 0 && (
                <Box flexDirection="column">
                  {rightSections.map((sec, i) => (
                    <Section
                      key={SECTIONS[i + 3].name}
                      name={SECTIONS[i + 3].name}
                      entries={sec}
                      rowWidth={width - 4}
                      maxRows={sectionRowBudget[i + 3] ?? 1}
                    />
                  ))}
                </Box>
              )}
            </Box>
            <Box paddingX={2}>
              <Text>Found a bug? Run snote --report to save a report bundle.</Text>
            </Box>
            <Box paddingX={2}>
              <Text>Editing: {editorHint}</Text>
            </Box>
          </>
        )}
    </Box>
  );
}

export default Help;
