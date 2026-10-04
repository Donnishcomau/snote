import { useState } from 'react';
import { theme } from './theme';

/**
 * The bottom-area notice line (T349): error notices stay red; success and
 * informational notices render green, so "draft sent to your blog" and
 * "New note saved" no longer look like failures.
 */
export interface NoticeState {
  message: string;
  isError: boolean;
}

export function useNotice(): {
  notice: NoticeState | null;
  setNotice: (message: string) => void;
  setNoticeError: (message: string) => void;
  clearNotice: () => void;
} {
  const [notice, setNoticeState] = useState<NoticeState | null>(null);
  const setNotice = (message: string) => setNoticeState({ message, isError: false });
  const setNoticeError = (message: string) => setNoticeState({ message, isError: true });
  const clearNotice = () => setNoticeState(null);
  return { notice, setNotice, setNoticeError, clearNotice };
}

/** The theme roles' colours: error notices keep red, everything else green. */
export function noticeColor(notice: NoticeState): string {
  return notice.isError ? theme.error.color : theme.success.color;
}
