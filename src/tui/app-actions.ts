import React from 'react';
import { Store } from 'redux';
import { basename, dirname, join } from 'node:path';

import type { State } from '../core/store';
import { editInEditor } from '../core/editor';
import { selectEditor, isTerminalEditor, editorFinishHint } from '../core/editor-select';
import { newNoteFields } from '../core/new-note';
import { publishLink } from '../core/note-keys';
import { copyToClipboard } from '../core/clipboard';
import { checklistItems, insertChecklistItem } from '../core/checklist';
import { mergeEditorReturn } from '../core/editor-conflict-merge';
import { documentsDir, exportFileName, exportNote } from '../core/export-note';
// use the vendored action creator so the raw type string stays in one place (editor-suspend gate)
import { editNote } from '@vendor/state/data/actions';

import type { EntityId, Note } from '@vendor/types';

export interface EditSelectedNoteCtx {
  store: Store<State>;
  selectedEntry: { id: EntityId; note: Note } | null;
  setRawMode: (mode: boolean) => void;
  runEditor?: (initial: string) => Promise<string | null>;
  onEditorError?: (message: string) => void;
  suspend?: (run: () => Promise<void>) => Promise<unknown>;
}

/**
 * Edit the selected note in the external editor.
 */
export function editSelectedNote(ctx: EditSelectedNoteCtx): void {
  const { store, selectedEntry, setRawMode, runEditor, onEditorError, suspend } = ctx;
  // Edit the selected note in the editor
  if (selectedEntry) {
    setRawMode(false);
    const editor = runEditor ?? editInEditor;
    // Keep the result outside the suspend callback: it resolves to undefined.
    // The editor is started exactly once; raw mode is restored off the editor's
    // own completion (never off the handover's settle), so a terminal that is
    // suspended and comes back is never mistaken for the editor failing.
    let result: string | null = null;
    let editorError: unknown;
    let editorFailed = false;
    let settle!: () => void;
    const editorDone = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const run = async () => {
      try {
        announceEditorIfGui();
        result = await editor(selectedEntry.note.content ?? '');
      } catch (err) {
        editorError = err;
        editorFailed = true;
      }
      // the editor is done, whatever the outcome: hand the terminal back
      setRawMode(true);
      settle();
    };
    const done = suspend ? suspend(run) : run();
    // once the terminal is back, dispatch the edit or report the failure
    void editorDone.then(() => {
      if (editorFailed) {
        onEditorError?.(editorError instanceof Error ? editorError.message : String(editorError));
        return;
      }
      if (result !== null) {
        // T299: a remote change may have landed while the editor was open;
        // merge against the store's current content instead of overwriting it.
        const current = store.getState().data.notes.get(selectedEntry.id)?.content ?? '';
        const merged = mergeEditorReturn(selectedEntry.note.content ?? '', result, current);
        store.dispatch({
          type: 'EDIT_NOTE',
          noteId: selectedEntry.id,
          changes: { content: merged.content },
        } as never);
        if (merged.conflict) {
          onEditorError?.('A change from another device could not be merged automatically - both versions were kept.');
        }
      }
    });
    void Promise.resolve(done);
  }
}

export interface CreateNoteCtx {
  store: Store<State>;
  // the note on the first row of the current list, when there is one
  topNote?: Note | null;
  setRawMode: (mode: boolean) => void;
  runEditor?: (initial: string) => Promise<string | null>;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  onEditorError?: (message: string) => void;
  onNoteCreated?: () => void;
  suspend?: (run: () => Promise<void>) => Promise<unknown>;
}

/**
 * Create a new note and edit it.
 */
export function createNote(ctx: CreateNoteCtx): void {
  const { store, setRawMode, runEditor, setSelectedIndex, onEditorError, onNoteCreated, suspend } = ctx;
  setRawMode(false);
  const noteId: EntityId = crypto.randomUUID() as EntityId;
  const editor = runEditor ?? editInEditor;
  // Keep the result outside the suspend callback: it resolves to undefined.
  // The editor is started exactly once; raw mode is restored off the editor's
  // own completion (never off the handover's settle), so a terminal that is
  // suspended and comes back is never mistaken for the editor failing.
  let result: string | null = null;
  let editorError: unknown;
  let editorFailed = false;
  let settle!: () => void;
  const editorDone = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const run = async () => {
    try {
      announceEditorIfGui();
      result = await editor('');
    } catch (err) {
      editorError = err;
      editorFailed = true;
    }
    // the editor is done, whatever the outcome: hand the terminal back
    setRawMode(true);
    settle();
  };
  const done = suspend ? suspend(run) : run();
  // once the terminal is back, dispatch the new note or report the failure
  void editorDone.then(() => {
    if (editorFailed) {
      onEditorError?.(editorError instanceof Error ? editorError.message : String(editorError));
      return;
    }
    if (result !== null) {
      // read the collection when the editor has returned, not before
      const fields = newNoteFields(store.getState().ui.collection, ctx.topNote);
      // OMARCHY: boundary cast — the vendored action type carries meta
      store.dispatch({
        type: 'CREATE_NOTE_WITH_ID',
        noteId,
        note: { content: result, systemTags: fields.systemTags, tags: fields.tags },
        meta: { nextNoteToOpen: noteId },
      } as never);
      // Select the new note: ui.openedNote (set via meta.nextNoteToOpen
      // above) moves the marker in useAppState's render.
      setSelectedIndex((i) => i);
      onNoteCreated?.();
    }
  });
  void Promise.resolve(done);
}

export interface CopyLinkCtx {
  selectedEntry: { id: EntityId; note: Note } | null;
  copyText?: (text: string) => boolean;
  setCopyResult: (v: null | { noteId: EntityId; ok: boolean }) => void;
}

/**
 * Copy the public link of the selected note to the clipboard.
 */
export function copyLink(ctx: CopyLinkCtx): void {
  const { selectedEntry, copyText, setCopyResult } = ctx;
  if (selectedEntry) {
    const link = publishLink(selectedEntry.note);
    if (link !== null) {
      const ok = (copyText ?? copyToClipboard)(link);
      setCopyResult({ noteId: selectedEntry.id, ok });
    }
  }
}

export interface ForceSyncNowCtx {
  store: Store<State>;
  onForceSync?: () => void;
  timerRef: { current: ReturnType<typeof setTimeout> | null };
  setSyncedAt: (v: string | null) => void;
}

/**
 * Fire a manual sync and flash "synced hh:mm" for 3 seconds (r key).
 */
export function forceSyncNow(ctx: ForceSyncNowCtx): void {
  const { store, onForceSync, timerRef, setSyncedAt } = ctx;
  const fn = onForceSync ?? (store as { forceSync?: () => void }).forceSync;
  if (fn) fn.call(store);
  if (timerRef.current) clearTimeout(timerRef.current);
  const hhmm = new Date().toTimeString().slice(0, 5);
  setSyncedAt(hhmm);
  timerRef.current = setTimeout(() => {
    setSyncedAt(null);
    timerRef.current = null;
  }, 3000);
}

export interface InsertCheckItemCtx {
  store: Store<State>;
  selectedEntry: { id: EntityId; note: Note } | null;
  itemIndex: number;
  value: string;
}

/**
 * T293: insert a checklist item after the item at the cursor (same `at`
 * note-focus.ts computes for `c`), else at the end — insertChecklistItem
 * decides placement itself.
 */
export function insertCheckItem(ctx: InsertCheckItemCtx): void {
  const { store, selectedEntry, itemIndex, value } = ctx;
  if (!selectedEntry) return;
  const content = selectedEntry.note.content ?? '';
  const at = Math.min(itemIndex, checklistItems(content).length - 1);
  store.dispatch(editNote(selectedEntry.id, { content: insertChecklistItem(content, at, value) }));
}

/**
 * Prints the one line a suspended terminal shows while a GUI editor is
 * open (terminal editors redraw the screen themselves, so they get nothing).
 */
function announceEditorIfGui(): void {
  const cmd = selectEditor(process.env);
  if (isTerminalEditor(cmd)) return;
  const first = cmd.trim().split(/\s+/)[0] ?? '';
  const name = basename(first);
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  process.stdout.write(`Editing in ${displayName} — ${editorFinishHint(cmd)}\n`);
}

export interface ExportSelectedNoteCtx {
  selectedEntry: { id: EntityId; note: Note } | null;
  // the path typed into the prompt; only its directory part is used, the
  // file name is always regenerated so a collision picks a free one
  value: string;
  setNotice: (v: string) => void;
  setNoticeError: (v: string) => void;
}

/**
 * T298: write the selected note to a .md file (the `w` prompt). The path
 * shown in the prompt is only a suggestion: the file name is rebuilt from
 * the note (upstream's naming) and a free path is picked next to it — an
 * existing file is never overwritten. Success and failure both answer with
 * a notice line.
 */
export function exportSelectedNote(ctx: ExportSelectedNoteCtx): void {
  const { selectedEntry, value, setNotice, setNoticeError } = ctx;
  if (!selectedEntry) return;
  const base = exportFileName(selectedEntry.note.content ?? '');
  const target = value.trim() !== '' ? value : join(documentsDir(), `${base}.md`);
  const dir = dirname(target);
  exportNote(selectedEntry.note, dir)
    .then((path) => setNotice(`exported: ${path}`))
    .catch((err: unknown) =>
      setNoticeError(`export failed: ${err instanceof Error ? err.message : String(err)}`),
    );
}
