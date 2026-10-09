import { Box, Text, useInput, useApp, useStdin } from 'ink';
import React, { useRef, useState } from 'react';
import { Store } from 'redux';

import type { State } from '../core/store';
import { keyNameFromEvent } from '../core/keymap';
import { Help } from './Help';
import { selectEditor } from '../core/editor-select';
import { BottomArea, useItemAsk, useExportAsk } from './BottomArea'; import { useBlogSendAsk } from './blog-send-ask';
import { MainPanes } from './MainPanes';
import { shouldAutoOpenTags } from '../core/layout';
import { noteKeyAction, emptyTrashActions } from '../core/note-keys';
import { checklistItems } from '../core/checklist';
import { useAppState } from './useAppState'; import { useNotice, noticeColor } from './notice';
import { handleSearchKey, handleSearchClearKey, handleTagsKey, handleHistoryKey, handleIdleKey, useAppEffects, recordKeyEvent, openHistory, EXTERNAL_KEY } from './app-keys';
import { handleNoteKey } from './note-focus'; import { handlePaneArrow } from './pane-arrows';
import { useReselect } from './use-reselect';
import { splitPastedInput } from './split-input'; import { sanitizeForTerminal } from '../core/sanitize';
import { editSelectedNote, createNote, copyLink, forceSyncNow, saveInlineEdit } from './app-actions'; import { useInlineEditorState, inlineEditRefusal } from './inline-editor-state';
import type { EntityId } from '@vendor/types';

interface AppProps {
  store: Store<State>;
  width: number;
  height: number;
  onQuit?: () => void;
  onLogout?: () => void;
  runEditor?: (initial: string) => Promise<string | null>;
  onForceSync?: () => void;
  copyText?: (text: string) => boolean; startNew?: boolean;
}

/**
 * Main App component - note list + preview panes.
 */
export function App({ store, width, height, onQuit, onLogout, runEditor, onForceSync, copyText, startNew }: AppProps): React.JSX.Element {
  const { exit, suspendTerminal } = useApp();
  const { setRawMode } = useStdin();
  const view = useAppState(store);
  const { noteEntries, selectedIndex, setSelectedIndex, connected, pending, allTagNames, query, setQuery, tagNames, collection, inTrash, sortLabelStr } = view;
  const [rendered, setRendered] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [logoutAsk, setLogoutAsk] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsFocused, setTagsFocused] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [itemIndex, setItemIndex] = useState(0);
  const [tagIndex, setTagIndex] = useState(0);
  const [tagDialog, setTagDialog] = useState<null | { kind: 'rename' | 'delete'; tagName: string }>(null);
  const [emptyAsk, setEmptyAsk] = useState(0);
  const [copyResult, setCopyResult] = useState<null | { noteId: EntityId; ok: boolean }>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [reading, setReading] = useState(false);
  // T293/T298/T338: prompts whose state lives in BottomArea, read via cells
  const { itemAsk, setItemAsk } = useItemAsk(); const { exportAsk, setExportAsk } = useExportAsk(); const { setBlogSendAsk } = useBlogSendAsk(); const { open: inlineEditOpen, base: inlineEditBase, openEdit: openInlineEdit, closeEdit: closeInlineEdit } = useInlineEditorState();
  const { notice, setNotice, setNoticeError, clearNotice } = useNotice();
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const syncedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagsAutoOpenedRef = useRef(false);

  useAppEffects(width, tagNames.length, setTagsOpen, syncedTimerRef, () => handleKey('n', EXTERNAL_KEY), startNew);

  // Handle keyboard input
  const handleKey = (input: string, key: import('ink').Key) => {
    // T291: with a text prompt open the ring stores '<text>', never the typed char
    recordKeyEvent(input, key, Boolean(searchOpen || tagEditorOpen || tagDialog?.kind === 'rename' || emptyAsk || logoutAsk || useItemAsk().itemAsk || useExportAsk().exportAsk || useBlogSendAsk().blogOpen || inlineEditOpen));
    if (notice) clearNotice();
    const keyName = keyNameFromEvent(key);

    // If help is open, only handle Escape and ?
    if (helpOpen) {
      if (keyName === 'Escape' || input === '?') {
        setHelpOpen(false);
      }
      // Ignore all other keys when help is open
      return;
    }

    // If history is open, only handle navigation, Enter, Escape, and h
    if (historyOpen) {
      handleHistoryKey(input, keyName, { store, noteEntries, selectedIndex, historyIndex, setHistoryIndex, setHistoryOpen });
      return;
    }

    // Ignore other keys while a prompt is open
    if (emptyAsk || tagEditorOpen || logoutAsk || tagDialog || useItemAsk().itemAsk || useExportAsk().exportAsk || useBlogSendAsk().blogOpen || inlineEditOpen || (key === EXTERNAL_KEY && searchOpen)) return;

    // Narrow terminal reading mode: Escape or Enter switches back to the list
    if (reading && !tagsFocused && !searchOpen && (keyName === 'Escape' || keyName === 'Enter')) {
      setReading(false);
      return;
    }

    // If search is open, handle search input
    if (searchOpen) {
      handleSearchKey(input, key, { store, setSearchOpen, setQuery, setSelectedIndex,
        rememberSelection: () => remember(noteEntries[selectedIndex]?.id ?? null, query !== '') });
      return;
    }

    if (input === '/') {
      setSearchOpen(true);
      return;
    }

    if (handleSearchClearKey(keyName, { store, query, selectedId: selectedEntry?.id ?? null, remember })) return;

    // Tags pane focused: j/k move index, Enter selects, Tab closes focus, t/Escape closes pane
    if (tagsFocused) {
      handleTagsKey(input, keyName, { store, tagNames, tagIndex, setTagIndex, setSelectedIndex, setTagsFocused, setTagsOpen, setTagDialog });
      return;
    }

    // Not focused: t opens the pane
    if (input === 't') {
      setTagsOpen(true);
      setTagsFocused(true);
      return;
    }

    if (handlePaneArrow(keyName, { tagsOpen, noteFocused, setTagsOpen, setTagsFocused, setNoteFocused })) return;
    if (keyName === 'Tab' && tagsOpen) {
      setTagsFocused(true);
      return;
    }

    // Note pane focused: Escape or Tab returns to the list; every other key
    // goes through handleNoteKey first and falls through when it returns false.
    if (noteFocused) {
      if (keyName === 'Escape' || keyName === 'Tab') {
        setNoteFocused(false);
        return;
      }
      const noteKeyCtx = { store, selectedEntry, itemIndex, setItemIndex, setItemAsk, setNotice, setExportAsk, setBlogSendAsk };
      if (handleNoteKey(input, keyName, noteKeyCtx)) return;
    }

    const action = noteKeyAction(input, selectedEntry?.id ?? null, store.getState());
    if (action) {
      store.dispatch(action);
      // T283: keep the tags-pane marker in sync when `T` toggles the trash
      // from the generic handler; TagPane's `>` follows tagIndex, not ui.collection.
      if (action.type === 'SELECT_TRASH') setTagIndex(tagNames.length + 2);
      else if (action.type === 'SHOW_ALL_NOTES') setTagIndex(0);
      return;
    }

    // T286: trash keeps only upstream's actions; g/p/P/m/h no-op with a notice
    if (inTrash && selectedEntry && 'gpPhmw'.includes(input)) {
      setNotice('In trash: press u to restore first'); return;
    }

    // g/y/r/E are handled by app-keys; h is kept here so openHistory( stays visible.
    handleIdleKey(input, { store, selectedEntry, onForceSync, copyText, syncedTimerRef, setSyncedAt, setCopyResult,
      setTagEditorOpen, setEmptyAsk, setExportAsk, setNotice });

    if (input === 'h') {
      openHistory({ store, selectedEntry, setHistoryOpen, setHistoryIndex });
    } else if (input === 'e') {
      editSelectedNote({ store, selectedEntry, setRawMode, runEditor, onEditorError: setNoticeError, suspend: suspendTerminal });
    } else if (input === 'n') {
      createNote({ store, topNote: noteEntries[0]?.note, setRawMode, runEditor, setSelectedIndex, onEditorError: setNoticeError, onNoteCreated: () => setNotice('New note saved — press g to add tags'), suspend: suspendTerminal });
    } else if (input === 'j' || keyName === 'downArrow') {
      setSelectedIndex((i) => Math.min(i + 1, noteEntries.length - 1));
    } else if (input === 'k' || keyName === 'upArrow') {
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (keyName === 'Enter') {
      // Narrow terminals: Enter switches the single pane to the preview; otherwise toggle rendering
      if (width < 50) setReading(true);
      else setRendered((r) => !r);
    } else if (keyName === 'Tab') {
      // No other pane claimed Tab: focus the note pane
      setNoteFocused(true);
    } else if (input === 'q') {
      if (onQuit) {
        onQuit();
      } else {
        exit();
      }
    } else if (input === 'v') {
      setRendered((r) => !r);
    } else if (input === '?') {
      setHelpOpen(true);
    } else if (input === 'L') {
      if (onLogout) {
        setLogoutAsk(true);
      }
    } else if (input === 'i') { if (selectedEntry) { const c = selectedEntry.note.content ?? ''; const r = inlineEditRefusal(c); if (r) setNotice(r); else openInlineEdit(c); } }
  };

  // T300: after a search clear, keep the same note selected by id
  const remember = useReselect({ store, setExternalSelect: view.setExternalSelect });

  useInput((input, key) => {
    for (const ch of splitPastedInput(input) ?? [input]) handleKey(ch, key);
  }, { isActive: emptyAsk === 0 });

  // View-order count of the list for the status bar (see app-model).
  const listCount = React.useMemo(() => {
    const st = store.getState();
    let count = 0;
    for (const note of st.data.notes.values()) {
      if (Boolean(note.deleted) === false) count++;
    }
    return count;
  }, [store, view.noteEntries]);

  const selectedEntry = noteEntries[selectedIndex] || null;
  const selectedNote = selectedEntry?.note ?? null;
  // Gutter row for the note pane: the checklist item under the cursor (T194)
  const noteItems = noteFocused && selectedEntry ? checklistItems(selectedEntry.note.content ?? '') : [];
  const cursorLine = noteItems.length > 0 ? noteItems[Math.min(itemIndex, noteItems.length - 1)].line : null;

  return (
    <Box flexDirection="column" height={height}>
      {helpOpen ? (
        <Help width={width} height={height} editor={selectEditor(process.env)} />
      ) : (
        <>
          <MainPanes store={store} view={view} width={width} height={height} tagsOpen={tagsOpen} tagsFocused={tagsFocused}
            tagIndex={tagIndex} rendered={rendered} searchOpen={searchOpen} selectedNote={selectedNote}
            historyOpen={historyOpen} historyIndex={historyIndex} reading={reading}
            noteFocused={noteFocused} cursorLine={cursorLine} inlineEditOpen={inlineEditOpen} onCloseEdit={closeInlineEdit} inlineEditBase={inlineEditBase} onSaveEdit={(value: string) => { saveInlineEdit({ store, selectedEntry, base: inlineEditBase, local: value, onEditorError: setNoticeError }); closeInlineEdit(); }} />
          {notice ? <Text color={noticeColor(notice)} wrap="truncate-end">{sanitizeForTerminal(notice.message)}</Text> : null}
          <BottomArea
            store={store}
            view={{
              ...view,
              noteEntries: view.noteEntries.slice(0, listCount),
              sortLabelStr: syncedAt ? 'synced ' + syncedAt : view.sortLabelStr,
            }}
            selectedEntry={selectedEntry}
            width={width}
            onLogout={onLogout}
            tagEditorOpen={tagEditorOpen} setTagEditorOpen={setTagEditorOpen} tagDialog={tagDialog} setTagDialog={setTagDialog}
            logoutAsk={logoutAsk} setLogoutAsk={setLogoutAsk} emptyAsk={emptyAsk} setEmptyAsk={setEmptyAsk} copyResult={copyResult}
            tagsFocused={tagsFocused} searchOpen={searchOpen} itemIndex={itemIndex} setNotice={setNotice} setNoticeError={setNoticeError} inlineEditOpen={inlineEditOpen} />
        </>
      )}
    </Box>
  );
}

export default App;
