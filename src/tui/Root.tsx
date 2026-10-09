import { isInlineEditOpen } from './inline-editor-state';
import { Box, Text, useApp, useStdin, useStdout } from 'ink';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Login } from './Login';
import { App } from './App';
import { loadToken, saveToken, logout } from '../core/token';
import type { Store } from 'redux';
import type { State } from '../core/store';
import { theme } from './theme';

export type Auth = { email: string; token: string; server?: string };

interface RootProps {
  dataDir: string;
  server?: string;
  width: number;
  height: number;
  makeStoreFor: (auth: Auth, onLogout: () => void) => Store<State>;
  requestCode: (email: string) => Promise<unknown>;
  completeLogin: (email: string, code: string) => Promise<string>;
  passwordLogin?: (email: string, password: string) => Promise<string>;
  onQuit?: () => void;
  // T304: called when an instance-lock error is detected
  onLockError?: (message: string) => void;
  startNew?: boolean;
}

type Phase = 'loading' | 'login' | 'app';

const MIN_W = 20;
const MIN_H = 7;
const TOO_SMALL = `snote needs at least ${MIN_W}x${MIN_H} — make the window bigger`;

// The message cut into lines that fit the window: at most `rows` lines of at
// most `cols` characters.
function smallLines(cols: number, rows: number): string[] {
  const w = Math.max(1, cols);
  const out: string[] = [];
  for (let i = 0; i < TOO_SMALL.length && out.length < Math.max(1, rows); i += w) {
    out.push(TOO_SMALL.slice(i, i + w));
  }
  return out;
}

export function Root(props: RootProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading');
  const [store, setStore] = useState<Store<State> | null>(null);
  const [error, setError] = useState<string>('');
  const userLogoutRef = useRef(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [size, setSize] = useState({
    width: props.width,
    height: props.height,
  });

  const { stdout } = useStdout();
  const { exit } = useApp();
  const stdin = useStdin() as unknown as {
    internal_eventEmitter?: NodeJS.EventEmitter;
  };
  const tooSmall = size.width < MIN_W || size.height < MIN_H;
  const roomy = useRef(size);
  if (!tooSmall) roomy.current = size;
  const quitRef = useRef<() => void>(() => {});
  quitRef.current = props.onQuit ?? exit;

  // While too small, Ink's one key/paste emitter drops everything but `q`.
  useLayoutEffect(() => {
    const em = stdin.internal_eventEmitter;
    if (!tooSmall || !em) return;
    const real = em.emit;
    em.emit = function (this: NodeJS.EventEmitter, ev: string | symbol, ...a: unknown[]) {
      if (ev === 'input') {
        if (a[0] === 'q' && !isInlineEditOpen()) quitRef.current(); // S6-02: keep unsaved inline text
        return false;
      }
      if (ev === 'paste') return false;
      return real.call(this, ev, ...a);
    } as typeof em.emit;
    return () => {
      em.emit = real;
    };
  }, [tooSmall, stdin]);

  useEffect(() => {
    const onResize = () => {
      setSize({
        width: stdout.columns ?? props.width,
        height: stdout.rows ?? size.height,
      });
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout, props.width, size.height]);

  // On mount: check for saved token
  useEffect(() => {
    let cancelled = false;
    loadToken(props.dataDir)
      .then((auth) => {
        if (cancelled) return;
        if (auth === null || auth.server !== props.server) {
          // No saved token, or it was issued for a different server than the
          // effective one — never send it to the mismatched host.
          setPhase('login');
        } else {
          const onLogout = () => {
            logout(props.dataDir);
            setStore(null);
            // The middleware also calls this after the user's own logout;
            // only a server-forced sign-out (expired or revoked token)
            // deserves an explanation on the login screen.
            if (!userLogoutRef.current) {
              setError('Your session has expired or was revoked. Log in again.');
            }
            setPhase('login');
          };
          setStore(props.makeStoreFor(auth, onLogout));
          setPhase('app');
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('holds the instance lock')) {
          setLockMessage(msg);
          props.onLockError?.(msg);
          return;
        }
        setPhase('login');
      });
    return () => {
      cancelled = true;
    };
  }, [props.dataDir, props.server, props.makeStoreFor]);

  const handleLogout = useCallback(() => {
    logout(props.dataDir);
    setStore(null);
    setPhase('login');
  }, [props.dataDir]);

  const onLoggedIn = useCallback(
    async (auth: Auth) => {
      try {
        await saveToken(props.dataDir, { ...auth, server: props.server });
        userLogoutRef.current = false;
        setError('');
        const onLogout = () => {
          logout(props.dataDir);
          setStore(null);
          // Same rule as the saved-token path above: a forced sign-out
          // explains itself, the user's own logout stays silent.
          if (!userLogoutRef.current) {
            setError('Your session has expired or was revoked. Log in again.');
          }
          setPhase('login');
        };
        setStore(props.makeStoreFor(auth, onLogout));
        setPhase('app');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('holds the instance lock')) {
          setLockMessage(msg);
          props.onLockError?.(msg);
          return;
        }
        setError(msg);
      }
    },
    [props.dataDir, props.makeStoreFor],
  );

  let screen: React.JSX.Element;
  if (phase === 'loading') {
    screen = (
      <Box flexDirection="column">
        <Text>Loading...</Text>
        {lockMessage ? <Text {...theme.error}>{lockMessage}</Text> : null}
      </Box>
    );
  } else if (phase === 'login') {
    screen = (
      <Box flexDirection="column">
        <Login
          width={roomy.current.width}
          height={roomy.current.height}
          requestCode={props.requestCode}
          completeLogin={props.completeLogin}
          passwordLogin={props.passwordLogin}
          onLoggedIn={onLoggedIn}
        />
        {error ? <Text {...theme.error}>Error: {error}</Text> : null}
      </Box>
    );
  } else {
    screen = (
      <App
        store={store!}
        width={roomy.current.width}
        height={roomy.current.height}
        onQuit={props.onQuit}
        startNew={props.startNew}
        onLogout={() => {
          userLogoutRef.current = true;
          store!.dispatch({ type: 'REALLY_LOG_OUT' });
          void handleLogout();
        }}
      />
    );
  }

  // One stable tree in both states, so the hidden screen keeps its state.
  return (
    <Box flexDirection="column">
      {tooSmall ? (
        <Box flexDirection="column">
          {smallLines(size.width, size.height).map((l, i) => (
            <Text key={i}>{l}</Text>
          ))}
        </Box>
      ) : null}
      <Box display={tooSmall ? 'none' : 'flex'} flexDirection="column">
        {screen}
      </Box>
    </Box>
  );
}

export default Root;
