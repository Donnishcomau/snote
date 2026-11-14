// #30 L5a1: the update offer and the y request. main() allows the offer from its lazy install-kind block, only for an
// install canOfferUpdate accepts and with the update check on; the offer is the banner while both versions are digits.
// A confirmed y calls requestHandOff, and main() reads handOffRequested after the quit save. No process is started here.
import type { InstallKind } from './install-kind';
import { currentBanner, type BannerSignal } from './update-banner';

const VERSION_TEXT = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

let offerKind: InstallKind | null = null;
let requested: InstallKind | null = null;

/** main() only: this install may be offered an update (canOfferUpdate was true and the check is on). */
export function allowUpdateOffer(kind: InstallKind): void {
  offerKind = kind;
}

/** The update to offer now: the banner's versions when an offer is allowed and both are plain digits, else null. */
export function currentOffer(): BannerSignal | null {
  const b = offerKind === null ? null : currentBanner();
  return b !== null && VERSION_TEXT.test(b.running) && VERSION_TEXT.test(b.available) ? b : null;
}

/** The y answer: true when an offer stands now, so the next quit starts the hand-off; false changes nothing. */
export function requestHandOff(): boolean {
  if (currentOffer() === null) return false;
  requested = offerKind;
  return true;
}

/** The install kind whose hand-off was requested, or null. */
export function handOffRequested(): InstallKind | null {
  return requested;
}

/** Tests only. */
export function resetUpdateOffer(): void {
  offerKind = null;
  requested = null;
}
