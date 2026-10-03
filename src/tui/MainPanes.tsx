import { Box, Text } from 'ink';
import React from 'react';
import { Store } from 'redux';

import type { State } from '../core/store';
import type { Note } from '@vendor/types';
import type { useAppState } from './useAppState';
import { paneLayout } from '../core/layout';
import { revisionsOf, revisionLabel } from '../core/history';
import { TagPane } from './TagPane';
import { NoteList } from './NoteList';
import { History } from './History';
import { Preview } from './Preview';
import { InlineEditor } from './InlineEditor';

export interface MainPanesProps {
  store: Store<State>;
  view: ReturnType<typeof useAppState>;
  width: number;
  height: number;
  tagsOpen: boolean;
  tagsFocused: boolean;
  tagIndex: number;
  rendered: boolean;
  searchOpen: boolean;
  selectedNote: Note | null;
  historyOpen: boolean;
  historyIndex: number;
  reading?: boolean;
  noteFocused?: boolean;
  cursorLine?: number | null;
  inlineEditOpen?: boolean;
  onCloseEdit?: () => void;
  inlineEditBase?: string;
  onSaveEdit?: (value: string) => void;
}

/**
 * Main panes: tag pane + note list (or history list) + preview, plus the filter line.
 * Picks the list and the previewed note by historyOpen; the frames match the
 * two copies this replaces in App.
 */
export function MainPanes({
  store,
  view,
  width,
  height,
  tagsOpen,
  tagsFocused,
  tagIndex,
  rendered,
  searchOpen,
  selectedNote,
  historyOpen,
  historyIndex,
  reading = false,
  noteFocused = false,
  cursorLine = null,
  inlineEditOpen = false,
  onCloseEdit = () => {},
  inlineEditBase = '',
  onSaveEdit = () => {},
}: MainPanesProps): React.JSX.Element {
  const { noteEntries, selectedIndex, tagNames, query, collection } = view;
  const selectedId = noteEntries[selectedIndex]?.id ?? null;
  const revisions = historyOpen && selectedId ? revisionsOf(store.getState(), selectedId) : [];
  const previewNote = historyOpen ? (revisions[historyIndex]?.note ?? selectedNote) : selectedNote;
  const layout = paneLayout(width, tagsOpen, tagsFocused, reading);

  return (
    <>
      {/* Main content area */}
      <Box flexDirection="row">
        {layout.tagsWidth > 0 ? (
          <TagPane
            tags={tagNames}
            selectedIndex={tagIndex}
            focused={tagsFocused}
            width={layout.tagsWidth}
            height={height - 4}
            trashRow
            divider
          />
        ) : null}
        {layout.listWidthProp > 0 ? (
          historyOpen ? (
            <History
              rows={revisions.map(revisionLabel)}
              selectedIndex={historyIndex}
              loading={revisions.length === 0}
              width={layout.listWidthProp}
              height={layout.tagsWidth > 0 ? height - 2 : height - 1}
            />
          ) : (
            <NoteList
              notes={noteEntries.map((e) => e.note)}
              selectedIndex={selectedIndex}
              width={layout.listWidthProp}
              height={layout.tagsWidth > 0 ? height - 2 : height - 1}
              query={query}
            />
          )
        ) : null}
        {layout.previewWidthProp > 0 ? (
          inlineEditOpen ? (
            <InlineEditor note={previewNote} width={layout.previewWidthProp} height={layout.tagsWidth > 0 ? height - 2 : height - 1} base={inlineEditBase} onClose={onCloseEdit} onSave={onSaveEdit} />
          ) : (
            <Preview note={previewNote} width={layout.previewWidthProp} height={layout.tagsWidth > 0 ? height - 2 : height - 1} rendered={rendered} cursorLine={cursorLine} focused={noteFocused} inTrash={collection.type === 'trash'} />
          )
        ) : null}
      </Box>

      {tagsFocused ? (
        <Text>focus: tags</Text>
      ) : noteFocused ? (
        <Text>focus: notes</Text>
      ) : searchOpen || query !== '' ? (
        (() => {
          const full = 'search: ' + query;
          const shown = full.length > width - 2 ? full.slice(0, width - 4) + '..' : full;
          return <Text bold inverse={searchOpen}>{shown}</Text>;
        })()
      ) : collection.type === 'tag' ? (
        <Text>
          {'tag: ' + collection.tagName}
        </Text>
      ) : collection.type === 'untagged' ? (
        <Text>filter: untagged</Text>
      ) : null}
    </>
  );
}

export default MainPanes;
