import { Box, Text, useStdout } from 'ink';
import React, { useCallback, useEffect, useState } from 'react';

import { Login } from './Login';
import { App } from './App';
import { loadToken, saveToken, logout } from '../core/token';
import type { Store } from 'redux';
import type { State } from '../core/store';

export type Auth = { email: string; token: string; server?: string };

export interface RootProps {
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
}

type Phase = 'loading' | 'login' | 'app';

export function Root(props: RootProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading');
  const [store, setStore] = useState<Store<State> | null>(null);
  const [error, setError] = useState<string>('');
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [size, setSize] = useState({ width: props.width, height: props.height });

  const { stdout } = useStdout();

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
        const onLogout = () => {
          logout(props.dataDir);
          setStore(null);
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

  if (phase === 'loading') {
    return (
      <Box flexDirection="column">
        <Text>Loading...</Text>
        {lockMessage ? <Text color="red">{lockMessage}</Text> : null}
      </Box>
    );
  }

  if (phase === 'login') {
    return (
      <Box flexDirection="column">
        <Login
          width={size.width}
          height={size.height}
          requestCode={props.requestCode}
          completeLogin={props.completeLogin}
          passwordLogin={props.passwordLogin}
          onLoggedIn={onLoggedIn}
        />
        {error ? <Text color="red">Error: {error}</Text> : null}
      </Box>
    );
  }

  // phase === 'app'
  return (
    <App
      store={store!}
      width={size.width}
      height={size.height}
      onQuit={props.onQuit}
      onLogout={() => {
        store!.dispatch({ type: 'REALLY_LOG_OUT' });
        void handleLogout();
      }}
    />
  );
}

export default Root;
