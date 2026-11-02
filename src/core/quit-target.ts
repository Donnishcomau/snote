// #428 — which store the quit step (#401) sends for: the store of the account
// signed in now. Each sign-in binds its store; that store's own sign-out
// (user or server) forgets it. A late or repeated sign-out of an older store
// never forgets a newer one. Imports nothing: main.tsx (the start set) uses it.
// proof: test/integration/quit-after-signout.test.ts

export interface QuitTarget<S> {
  /** The store the quit step uses, or undefined with nobody signed in. */
  current(): S | undefined;
  /** Wrap one sign-in's onLogout; call `bind` with the store it builds. */
  track(onLogout: () => void): { onLogout: () => void; bind: (store: S) => void };
}

export function quitTarget<S>(): QuitTarget<S> {
  let current: S | undefined;
  return {
    current: () => current,
    track(onLogout) {
      let mine: S | undefined;
      return {
        onLogout: () => {
          if (mine !== undefined && current === mine) current = undefined;
          onLogout();
        },
        bind: (store) => {
          mine = store;
          current = store;
        },
      };
    },
  };
}
