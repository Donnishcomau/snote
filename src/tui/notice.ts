import { useEffect, useState } from 'react';
import { theme } from './theme';
import { currentUpdate, onUpdate } from '../core/update-signal';
import type { UpdateSignal } from '../core/update-signal';
import { currentProblem, onProblem } from '../core/problem-signal';

/**
 * The bottom-area notice line (T349): error notices stay red; success and
 * informational notices render green, so "draft sent to your blog" and
 * "New note saved" no longer look like failures. T427: a notice made from
 * an update signal asks the user to act, so it renders warning yellow.
 */
interface NoticeState {
  message: string;
  isError: boolean;
  // T427: set only by notices built from an update signal (both kinds).
  isUpdate?: boolean;
}

export function useNotice(): {
  notice: NoticeState | null;
  setNotice: (message: string) => void;
  setNoticeError: (message: string) => void;
  clearNotice: () => void;
} {
  // T391: start from the current update signal when there is one, so a
  // check that finished before the first render still shows up.
  // T441: a problem published before the first render comes first.
  const [notice, setNoticeState] = useState<NoticeState | null>(() => {
    const problem = currentProblem();
    if (problem !== null) {
      return { message: problem, isError: true };
    }
    const update = currentUpdate();
    return update ? { message: updateMessage(update), isError: false, isUpdate: true } : null;
  });
  const setNotice = (message: string) => setNoticeState({ message, isError: false });
  const setNoticeError = (message: string) => setNoticeState({ message, isError: true });
  const clearNotice = () => setNoticeState(null);
  // T391: a signal published later shows on screen too.
  // T441: so does a problem, as an error notice.
  useEffect(() => {
    const offUpdate = onUpdate((u) =>
      setNoticeState({ message: updateMessage(u), isError: false, isUpdate: true })
    );
    const offProblem = onProblem((message) => setNoticeState({ message, isError: true }));
    return () => {
      offUpdate();
      offProblem();
    };
  }, []);
  return { notice, setNotice, setNoticeError, clearNotice };
}

/** T391: the notice text for an update signal, one line per step. */
function updateMessage(u: UpdateSignal): string {
  if (u.kind === 'restart') {
    return `snote ${u.available} is downloaded: restart snote / the bar to use the update`;
  }
  return (
    'update available: omarchy plugin update io.github.donnishcomau.snote-simplenote\n' +
    'then click the bar button, then run omarchy-restart-shell'
  );
}

/**
 * The theme roles' colours (T427): error notices keep red, update notices
 * take the warning role, everything else the success role.
 */
export function noticeColor(notice: NoticeState): string {
  if (notice.isError) {
    return theme.error.color;
  }
  return notice.isUpdate ? theme.warning.color : theme.success.color;
}
