// #30 L5a2: the U key's question. y records the hand-off (update-offer) and quits through the same quit as q; n or Escape
// changes nothing; any other key is ignored while it is open. With no offer the row is the plain banner. An offer that
// goes while it is open (a non-digit version, the banner cleared) closes it, so no key stays held (#905 review).
import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { sanitizeForTerminal } from '../core/sanitize';
import { onBanner } from '../core/update-banner';
import { currentOffer, handOffRequested, requestHandOff } from '../core/update-offer';
import { BannerRow } from './banner';
import { useReadGate } from './read-gate';
import { theme } from './theme';

let open = false;
let seen = false;
let redraw: (() => void) | null = null; // the one mounted UpdateAsk (App renders one)
const set = (v: boolean): void => {
  if (v) seen = true;
  open = v;
  redraw?.();
};

/** True after the update question has opened in this process. */
export function updateAskSeen(): boolean { return seen; }
/** Tests only: clear the seen flag and the open question. */
export function resetUpdateAskSeen(): void { seen = false; open = false; guardUntil = 0; }

type Snap = { message?: string; pending: number; word: string; busy: boolean; setNotice: (line: string) => void };
let starNote: () => void = () => {};
let starKey: (input: string, escape: boolean) => boolean = () => false;
let starBlock: () => boolean = () => false;
let starTake: () => string = () => '';
let starDraw: (() => void) | null = null;
export function bindStarRuntime(note: () => void, key: (input: string, escape: boolean) => boolean, block: () => boolean, take: () => string, _consent: () => boolean): void { starNote = note; starKey = key; starBlock = block; starTake = take; }
export function starKeyHeld(input: string, escape: boolean): boolean { return starKey(input, escape); }
export function pokeStar(): void { starDraw?.(); }
type StarBits = { useReadGate: typeof useReadGate; useInput: typeof useInput; renderLine: (line: string) => React.JSX.Element };
export function useStarHost(load: () => Promise<{ StarPrompt: React.ComponentType<StarBits> }>, snap: () => Snap): React.JSX.Element | null {
  const [Pane, setPane] = useState<React.ComponentType<StarBits> | null>(null);
  const [, setTick] = useState(0);
  const ref = useRef(snap);
  ref.current = snap;
  useEffect(() => {
    const mine = (): void => setTick((n) => n + 1);
    starDraw = mine;
    let live = true;
    void import('../core/star-prompt').then((m) => { if (live) m.attachStarUi({ poke: pokeStar, askOpen: updateAskOpen, askSeen: updateAskSeen, bind: bindStarRuntime, read: () => ref.current(), handed: () => handOffRequested() !== null }); });
    return () => { live = false; if (starDraw === mine) { starDraw = null; starNote = () => {}; } };
  }, []);
  useEffect(() => { starNote(); const line = starTake(); if (line) ref.current().setNotice(line); if (starBlock() && !Pane) void load().then((m) => setPane(() => m.StarPrompt)); });
  if (!Pane) return null;
  return <Pane useReadGate={useReadGate} useInput={useInput} renderLine={(line) => <Text color={theme.warning.color} wrap="truncate-end">{sanitizeForTerminal(line)}</Text>} />;
}

const offerGone = (): boolean => open && currentOffer() === null;

/** True while the question holds the keys. A key that finds the offer gone closes the question and does nothing else. */
export function updateAskOpen(): boolean {
  if (!offerGone()) return open;
  set(false);
  return true; // the screen still showed the question, so this key only closed it
}

// #30 L5b: the bar's click (update-ask.request) opens the same question, only while App shows no text entry or prompt
// (busy() null) and an offer stands; for 300 ms after that open every key is ignored, so a key typed before it is no answer.
let busy: () => unknown = () => true;
let guardUntil = 0;
export function openUpdateAskFromBar(): void {
  if (busy() !== null || open || currentOffer() === null || starBlock()) return;
  guardUntil = Date.now() + 300;
  set(true);
}

export function openUpdateAskOnU(input: string): boolean {
  if (input !== 'U' || currentOffer() === null || starBlock()) return false;
  set(true);
  return true;
}

export function UpdateAsk({ quit, entry }: { quit: () => void; entry: () => unknown }): React.JSX.Element | null {
  const [, tick] = useState(0);
  busy = entry;
  useEffect(() => {
    const draw = (): void => tick((t) => t + 1);
    const l = (): void => {
      if (offerGone()) open = false; // a banner change that ends the offer closes the question before the redraw
      draw();
    };
    redraw = draw;
    const off = onBanner(l);
    return () => {
      off();
      if (redraw === draw) redraw = null;
      open = false;
      busy = () => true;
    };
  }, []);
  const offered = currentOffer();
  const offer = open ? offered : null;
  useReadGate({ confirm: offer !== null });
  useInput((input, key) => {
    if (offer === null || Date.now() < guardUntil) return;
    // close after App's own handler has seen this key
    if (key.escape || input === 'n' || input === 'N') queueMicrotask(() => set(false));
    else if (input === 'y' || input === 'Y') {
      queueMicrotask(() => set(false));
      if (requestHandOff()) quit();
    }
  });
  if (offer === null) {
    return offered === null ? <BannerRow /> : <Text color={theme.warning.color} wrap="truncate-end">{sanitizeForTerminal(`Update available: ${offered.running} -> ${offered.available}, press U to update`)}</Text>;
  }
  return (
    <Box flexShrink={0}>
      <Text color={theme.warning.color}>{sanitizeForTerminal(`Update snote ${offer.running} to ${offer.available}? (y/n)`)}</Text>
    </Box>
  );
}
