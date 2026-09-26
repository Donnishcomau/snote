import { Box, Text } from 'ink';
import React, { useRef, useState } from 'react';
import { Store } from 'redux';
import { join } from 'node:path';

import type { State } from '../core/store';
import type { EntityId, Note, TagName } from '@vendor/types';
import { TagEditor } from './TagEditor';
import { StatusBar } from './StatusBar';
import { Confirm, Prompt } from './Prompt';
import { publishLink, emptyTrashActions, sharedLine } from '../core/note-keys';
import { pendingCount } from '../core/simperium-reducer';
import { insertCheckItem, exportSelectedNote } from './app-actions';
import { logoutHandlers, emptyTrashHandlers, renameHandlers, deleteTagHandlers } from './dialog-actions';
import { documentsDir, exportFileName } from '../core/export-note';
import isEmailTag from '@vendor/utils/is-email-tag';
import type { useAppState } from './useAppState';
import { KeyHints } from './KeyHints';

// T293: checklist-item prompt state. BottomArea owns the useState and
// publishes it to a module cell; App reads it with useItemAsk() (it renders
// ABOVE BottomArea, so a plain context cannot carry it upward). The cell is
// reassigned on every render of the owning instance.
interface ItemAskState {
  itemAsk: boolean;
  setItemAsk: (v: boolean) => void;
  itemIndex: number;
}
const itemAskRef: { current: ItemAskState } = {
  current: { itemAsk: false, setItemAsk: () => {}, itemIndex: 0 },
};

export function useItemAsk(): ItemAskState {
  return itemAskRef.current;
}

// T298: the export prompt state (`w`), owned by BottomArea and published to
// a module cell exactly like itemAskRef above, so App.tsx can pass
// setExportAsk into handleNoteKey without growing its own state (245/250).
interface ExportAskState {
  exportAsk: boolean;
  setExportAsk: (v: boolean) => void;
}
const exportAskRef: { current: ExportAskState } = {
  current: { exportAsk: false, setExportAsk: () => {} },
};

export function useExportAsk(): ExportAskState {
  return exportAskRef.current;
}

interface BottomAreaProps {
  store: Store<State>;
  view: ReturnType<typeof useAppState>;
  selectedEntry: { id: EntityId; note: Note } | null;
  width: number;
  onLogout?: () => void;
  tagEditorOpen: boolean;
  setTagEditorOpen: (v: boolean) => void;
  tagDialog: null | { kind: 'rename' | 'delete'; tagName: string };
  setTagDialog: (v: null | { kind: 'rename' | 'delete'; tagName: string }) => void;
  logoutAsk: boolean;
  setLogoutAsk: (v: boolean) => void;
  emptyAsk: number;
  setEmptyAsk: (v: number) => void;
  copyResult: null | { noteId: EntityId; ok: boolean };
  tagsFocused: boolean;
  searchOpen: boolean;
  itemIndex?: number;
  setNotice?: (v: string | null) => void;
}

export function BottomArea({
  store,
  view,
  selectedEntry,
  width,
  onLogout,
  tagEditorOpen,
  setTagEditorOpen,
  tagDialog,
  setTagDialog,
  logoutAsk,
  setLogoutAsk,
  emptyAsk,
  setEmptyAsk,
  copyResult,
  tagsFocused,
  searchOpen,
  itemIndex = 0,
  setNotice,
}: BottomAreaProps): React.JSX.Element {
  const { allTagNames, connected, noteEntries, inTrash, sortLabelStr, pending } = view;
  // T293: the checklist-item prompt state is owned here and published to the
  // module cell App.tsx reads via useItemAsk() (see itemAskRef above).
  const [itemAsk, setItemAsk] = useState(false);
  itemAskRef.current = { itemAsk, setItemAsk, itemIndex };
  // T298: the export prompt's open flag and the path it shows. initialFor
  // reads it only at mount time, so the path follows the note selected when
  // `w` opened the prompt, even if the list moves under it.
  const [exportAsk, setExportAsk] = useState(false);
  exportAskRef.current = { exportAsk, setExportAsk };
  const exportPathRef = useRef<string | null>(null);

  // Dialog prompt handlers extracted to dialog-actions.ts (T298) to keep
  // this file under the 300-line structural cap.
  const logout = logoutHandlers(setLogoutAsk, onLogout);
  const emptyTrash = emptyTrashHandlers(store, setEmptyAsk);
  const rename = tagDialog?.kind === 'rename' ? renameHandlers(store, tagDialog, setTagDialog) : null;
  const deleteTag = tagDialog?.kind === 'delete' ? deleteTagHandlers(store, tagDialog, setTagDialog) : null;

  // T293: `a` in the note pane — insert a checklist item via app-actions.
  const handleItemAskSubmit = (value: string) => {
    insertCheckItem({ store, selectedEntry, itemIndex, value });
    setItemAsk(false);
  };

  const handleItemAskCancel = () => {
    setItemAsk(false);
  };

  // T298: `w` — the path the prompt opens with, upstream's naming in the
  // documents dir. Recomputed when the prompt closes, captured when it opens.
  const initialFor = (kind: 'rename' | 'export'): string => {
    if (kind === 'rename') return tagDialog!.tagName;
    if (exportPathRef.current === null) {
      const base = exportFileName(selectedEntry?.note.content ?? '');
      exportPathRef.current = join(documentsDir(), `${base}.md`);
    }
    return exportPathRef.current;
  };

  const handleExportSubmit = (value: string) => {
    exportSelectedNote({ selectedEntry, value, setNotice: (v) => setNotice?.(v) });
    exportPathRef.current = null;
    setExportAsk(false);
  };

  const handleExportCancel = () => {
    // T298: Prompt's unchanged-text Enter arrives here (Prompt treats it as a
    // cancel), so export the suggested path; Escape clears the ref and drops.
    if (exportPathRef.current !== null) {
      handleExportSubmit(exportPathRef.current);
    } else {
      setExportAsk(false);
    }
  };

  return (
    <>
      {tagEditorOpen ? (
        <>
          <TagEditor
            tags={selectedEntry!.note.tags}
            allTags={allTagNames}
            onAdd={(name) => {
              if (isEmailTag(name as TagName)) return;
              store.dispatch({
                type: 'ADD_NOTE_TAG',
                noteId: selectedEntry!.id,
                tagName: name as TagName,
              });
            }}
            onRemove={(name) =>
              store.dispatch({
                type: 'REMOVE_NOTE_TAG',
                noteId: selectedEntry!.id,
                tagName: name as TagName,
              })
            }
            onClose={() => setTagEditorOpen(false)}
          />
          <KeyHints context="editing" width={width} />
        </>
      ) : tagDialog?.kind === 'rename' ? (
        <>
          <Prompt
            label="rename tag"
            initial={initialFor("rename")}
            onSubmit={rename!.submit}
            onCancel={rename!.cancel}
          />
          <KeyHints context="editing" width={width} />
        </>
      ) : tagDialog?.kind === 'delete' ? (
        <Confirm
          question={'delete tag ' + tagDialog.tagName + '?'}
          onYes={deleteTag!.yes}
          onNo={deleteTag!.no}
          destructive
        />
      ) : itemAsk ? (
        <>
          <Prompt
            label="new check item"
            initial=""
            onSubmit={handleItemAskSubmit}
            onCancel={handleItemAskCancel}
          />
          <KeyHints context="editing" width={width} />
        </>
      ) : exportAsk ? (
        <>
          <Prompt
            label="export"
            initial={initialFor('export')}
            onSubmit={handleExportSubmit}
            onCancel={handleExportCancel}
          />
          <KeyHints context="editing" width={width} />
        </>
      ) : logoutAsk ? (
        pendingCount(store.getState().simperium) > 0
          ? (() => {
              const unsynced = pendingCount(store.getState().simperium);
              return (
                <Prompt
                  label={'log out: ' + unsynced + ' unsynced notes will be lost - type \'logout\' to confirm'}
                  initial=""
                  onSubmit={logout.submit}
                  onCancel={logout.no}
                />
              );
            })()
          : (
              <Confirm
                question="log out and delete local data?"
                onYes={logout.yes}
                onNo={logout.no}
                destructive
              />
            )
      ) : emptyAsk ? (
        <Prompt
          label={'empty trash (' + emptyAsk + " notes) - type 'empty' to confirm"}
          initial=""
          onSubmit={emptyTrash.submit}
          onCancel={emptyTrash.no}
        />
      ) : (
        <>
          {selectedEntry && (() => {
            const sl = sharedLine(selectedEntry.note);
            return sl ? <Text>{sl}</Text> : null;
          })()}
          {selectedEntry && selectedEntry.note.systemTags?.includes('published') ? (
            <Text>
              {'published: ' + (publishLink(selectedEntry.note) ?? 'waiting for link')}
              {copyResult?.noteId === selectedEntry.id ? (copyResult.ok ? ' (copied)' : ' (copy failed)') : ''}
            </Text>
          ) : null}
          <KeyHints context={tagsFocused ? 'tags' : inTrash ? 'trash' : 'list'} width={width} />
          <StatusBar connected={connected} count={noteEntries.length} width={width} label={inTrash ? (sortLabelStr && sortLabelStr !== 'sort: modified' ? 'trash  ' + sortLabelStr : 'trash') : (sortLabelStr && sortLabelStr !== 'sort: modified' ? sortLabelStr : undefined)} pending={pending} />
        </>
      )}
    </>
  );
}

export default BottomArea;
