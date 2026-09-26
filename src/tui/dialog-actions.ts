// T298 extraction from BottomArea.tsx to keep it under 300 lines.
// Dialog prompt handlers (tag rename/delete, logout, empty trash) moved
// here, verbatim. Each takes the state setters BottomArea already owns.
import type { Store } from 'redux';
import type { State } from '../core/store';
import type { TagName } from '@vendor/types';
import { emptyTrashActions } from '../core/note-keys';

export interface TagDialogState {
  kind: 'rename' | 'delete';
  tagName: string;
}

type Setter<T> = (v: T) => void;

export const logoutHandlers = (
  setLogoutAsk: Setter<boolean>,
  onLogout: (() => void) | undefined,
) => {
  const yes = () => {
    setLogoutAsk(false);
    if (onLogout) {
      onLogout();
    }
  };
  const no = () => {
    setLogoutAsk(false);
  };
  const submit = (value: string) => {
    if (value === 'logout') {
      yes();
    } else {
      setLogoutAsk(false);
    }
  };
  return { yes, no, submit };
};

export const emptyTrashHandlers = (store: Store<State>, setEmptyAsk: Setter<number>) => {
  const submit = (value: string) => {
    if (value === 'empty') {
      for (const a of emptyTrashActions(store.getState())) {
        store.dispatch(a);
      }
    }
    setEmptyAsk(0);
  };
  const no = () => {
    setEmptyAsk(0);
  };
  return { submit, no };
};

export const renameHandlers = (
  store: Store<State>,
  tagDialog: TagDialogState,
  setTagDialog: Setter<TagDialogState | null>,
) => {
  const submit = (value: string) => {
    const tagName = tagDialog.tagName;
    store.dispatch({ type: 'RENAME_TAG', oldTagName: tagName as TagName, newTagName: value as TagName });
    setTagDialog(null);
  };
  const cancel = () => {
    setTagDialog(null);
  };
  return { submit, cancel };
};

export const deleteTagHandlers = (
  store: Store<State>,
  tagDialog: TagDialogState,
  setTagDialog: Setter<TagDialogState | null>,
) => {
  const yes = () => {
    store.dispatch({ type: 'TRASH_TAG', tagName: tagDialog.tagName as TagName });
    setTagDialog(null);
  };
  const no = () => {
    setTagDialog(null);
  };
  return { yes, no };
};
