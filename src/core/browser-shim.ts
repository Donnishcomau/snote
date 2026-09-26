/**
 * Browser globals shim for headless / Node environments.
 *
 * The vendored sync code expects `window`, `navigator.onLine` and
 * `localStorage` to exist.  This module polyfills only what is missing
 * so the CLI can start without crashing or silently dropping edits.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal `localStorage`-like object backed by a Map. */
interface LSStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Define a property on `target` only when the property does not exist.
 *
 * `globalThis.navigator` is a getter in Node so we must use
 * `Object.defineProperty` instead of assignment.
 */
function ensure(target: Record<string, unknown>, name: string, value: unknown): void {
  if (!(name in target)) {
    // We know the property is not present so we can safely pass a full
    // PropertyDescriptor.
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Install browser globals onto *target* (defaults to `globalThis`).
 *
 * Every step is a no-op when the value is already present, so repeated
 * calls are safe and do not lose state.
 */
export function installBrowserShim(target: Record<string, unknown> = globalThis): void {
  // --- window ----------------------------------------------------------
  if (typeof (target as Record<string, unknown>).window === 'undefined') {
    const win = {
      addEventListener(): void { /* no-op */ },
      removeEventListener(): void { /* no-op */ },
      dispatchEvent(): boolean { return true; },
    };
    ensure(target, 'window', win);
  }

  // --- navigator.onLine -----------------------------------------------
  if (typeof (target as Record<string, unknown>).navigator === 'undefined') {
    ensure(target, 'navigator', { onLine: true });
  } else {
    const nav = target.navigator as Record<string, unknown>;
    if (typeof nav.onLine !== 'boolean') {
      // Must use defineProperty because `navigator` is read-only getter
      // on Node's globalThis.
      Object.defineProperty(nav, 'onLine', { value: true, configurable: true });
    }
  }

  // --- localStorage ---------------------------------------------------
  // Node 24+ exposes a `localStorage` *getter* on globalThis but its
  // value is undefined when --localstorage-file is not provided.
  // We need a real object with setItem; use defineProperty to override
  // the getter.  Only when setItem is missing.
  const desc = Object.getOwnPropertyDescriptor(target, 'localStorage');
  const ls =
    desc && 'value' in desc
      ? (desc.value as { setItem?: (key: string, value: string) => void } | undefined)
      : undefined;
  if (typeof ls?.setItem !== 'function') {
    const map = new Map<string, string>();
    const lsStore: LSStore = {
      getItem(key: string): string | null {
        return map.has(key) ? map.get(key)! : null;
      },
      setItem(key: string, value: string): void {
        map.set(key, value);
      },
      removeItem(key: string): void {
        map.delete(key);
      },
    };
    Object.defineProperty(target, 'localStorage', {
      value: lsStore,
      configurable: true,
      writable: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Auto-install on import
// ---------------------------------------------------------------------------

installBrowserShim();
