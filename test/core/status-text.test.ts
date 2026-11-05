/**
 * #79, #619, #632: the fixed texts of the status bar. syncedText (last-sync time, injected clock),
 * offlineReason (the fixed reason after `[offline]`) and connectionWord with a failed first attempt.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';

import { DAY_MS, TICK_MS, syncClock, syncedText } from '../../src/core/last-sync';
import { connectionWord, offlineReason } from '../../src/core/connection-word';
import type { SimperiumState } from '../../src/core/simperium-reducer';

const at = new Date(2026, 9, 31, 20, 4).getTime(); // 31 Oct 2026 20:04, local time
const sim = (s: Partial<SimperiumState>): SimperiumState => ({ connected: false, connectionStatus: 'red', everConnected: false, ...s }) as SimperiumState;

describe('#619 #79 #632 status bar texts', () => {
  it('1: WHEN the last sync was 3 hours ago THEN the text is `synced 20:04`; WHEN it was exactly 24 hours ago THEN still `synced 20:04`', () => {
    expect(syncedText(at, at + 3 * 3_600_000)).toBe('synced 20:04');
    expect(syncedText(at, at + DAY_MS)).toBe('synced 20:04');
  });

  it('2: WHEN the last sync was more than a day ago THEN the text is `synced 31 Oct 20:04`, and a 2 Jan 09:05 sync three days old is `synced 2 Jan 09:05`', () => {
    expect(syncedText(at, at + DAY_MS + 1)).toBe('synced 31 Oct 20:04');
    const jan = new Date(2027, 0, 2, 9, 5).getTime();
    expect(syncedText(jan, jan + 3 * DAY_MS)).toBe('synced 2 Jan 09:05');
  });

  it('3: WHEN snote has not synced since start THEN there is no synced text (undefined)', () => {
    expect(syncedText(null, at)).toBeUndefined();
  });

  it("4: WHEN the word is offline THEN the reason is `can't reach the sync server, retrying` (unreachable), `sync server not answering, retrying` (unanswered) or `connection lost, retrying` (no failure); WHEN the word is stale, connecting or connected THEN there is none", () => {
    expect(offlineReason('offline', 'unreachable')).toBe("can't reach the sync server, retrying");
    expect(offlineReason('offline', 'unanswered')).toBe('sync server not answering, retrying');
    expect(offlineReason('offline', null)).toBe('connection lost, retrying');
    expect([offlineReason('stale', 'unreachable'), offlineReason('connecting', 'unreachable'), offlineReason('connected', null)]).toEqual([undefined, undefined, undefined]);
  });

  it('5: (#632) WHEN no frame has arrived and an attempt failed with no socket open THEN the word is `offline`; with a socket open or no failure it is `connecting`', () => {
    expect(connectionWord(sim({}), false, true)).toBe('offline');
    expect(connectionWord(sim({}), true, true)).toBe('connecting');
    expect(connectionWord(sim({}), false, false)).toBe('connecting');
    expect(connectionWord(sim({}), false)).toBe('connecting');
  });

  afterEach(() => vi.useRealTimers());

  it('6: (#649) WHEN the store stays connected with 0 pending from 20:04 and the clock moves 3 minutes with no store change THEN after one minute tick the text is `synced 20:07`', () => {
    vi.useFakeTimers();
    let t = at;
    const shown: (string | undefined)[] = [];
    const clock = syncClock(() => true, (s) => shown.push(s), () => t);
    clock.update();
    t += 3 * 60_000;
    vi.advanceTimersByTime(TICK_MS);
    clock.stop();
    expect([shown[0], shown.at(-1)]).toEqual(['synced 20:04', 'synced 20:07']);
  });

  it('7: (#649) WHEN the last sync was 20:04 and the store then goes offline THEN with no store change, one tick a day and a minute later the text is `synced 31 Oct 20:04`', () => {
    vi.useFakeTimers();
    let t = at;
    let current = true;
    const shown: (string | undefined)[] = [];
    const clock = syncClock(() => current, (s) => shown.push(s), () => t);
    clock.update();
    current = false;
    t += DAY_MS + 60_000;
    vi.advanceTimersByTime(TICK_MS);
    clock.stop();
    expect([shown[0], shown.at(-1)]).toEqual(['synced 20:04', 'synced 31 Oct 20:04']);
  });
});
