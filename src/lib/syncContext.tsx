/**
 * React glue for the sync engine. The provider owns one SyncStore per
 * server URL (cache keys are namespaced by URL, so pointing the app at a
 * different server can never mix two users' data). Screens consume state
 * through useSync() and never touch the store directly.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient } from './api';
import { SyncState, SyncStore } from './store';

const SERVER_URL_KEY = 'track:serverUrl';

export const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4010';

interface SyncContextValue {
  state: SyncState;
  serverUrl: string;
  /** Point the app at another server (e.g. a computer's LAN IP). */
  setServerUrl: (url: string) => void;
  /** Pull-to-refresh / retry. Safe to call any time; runs are serialized. */
  sync: () => Promise<void>;
  /** Wipe local data (fresh start; used if a server's fixtures are swapped). */
  resetLocalData: () => Promise<void>;
}

const Ctx = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync must be used inside SyncProvider');
  return v;
}

function keyPrefixFor(url: string): string {
  // base64url without padding, implemented by hand: Hermes (React Native)
  // has no Node Buffer. URLs are ASCII, so byte-wise encoding is exact.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < url.length; i += 3) {
    const b0 = url.charCodeAt(i);
    const b1 = i + 1 < url.length ? url.charCodeAt(i + 1) : 0;
    const b2 = i + 2 < url.length ? url.charCodeAt(i + 2) : 0;
    out += chars[b0 >> 2];
    out += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (i + 1 < url.length) out += chars[((b1 & 0x0f) << 2) | (b2 >> 6)];
    if (i + 2 < url.length) out += chars[b2 & 0x3f];
  }
  return `track:${out}:`;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [serverUrl, setServerUrlState] = useState<string>(DEFAULT_SERVER_URL);
  const [state, setState] = useState<SyncState>(() => ({
    txns: [],
    accounts: [],
    syncToken: null,
    fullCursor: null,
    syncing: false,
    lastSyncedAt: null,
    lastError: null,
    showingCached: false,
    stats: { total: 0, added: 0, updated: 0, deleted: 0, skipped: 0 },
  }));
  const storeRef = useRef<SyncStore | null>(null);

  const buildStore = useCallback((url: string) => {
    const api = new ApiClient(url);
    const store = new SyncStore(AsyncStorage, api, setState, keyPrefixFor(url));
    storeRef.current = store;
    return store;
  }, []);

  // First launch: restore a saved server URL, then load cache + sync.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await AsyncStorage.getItem(SERVER_URL_KEY).catch(() => null);
      const url = saved || DEFAULT_SERVER_URL;
      if (cancelled) return;
      setServerUrlState(url);
      const store = buildStore(url);
      await store.loadCache();
      if (!cancelled) await store.syncInBackground();
    })();
    return () => {
      cancelled = true;
    };
  }, [buildStore]);

  const setServerUrl = useCallback(
    (url: string) => {
      const clean = url.trim().replace(/\/+$/, '');
      if (!clean) return;
      setServerUrlState(clean);
      AsyncStorage.setItem(SERVER_URL_KEY, clean).catch(() => {});
      const store = buildStore(clean);
      store.loadCache().then(() => store.syncInBackground());
    },
    [buildStore],
  );

  const sync = useCallback(async () => {
    const store = storeRef.current;
    if (store) await store.syncInBackground();
  }, []);

  const resetLocalData = useCallback(async () => {
    const prefix = keyPrefixFor(serverUrl);
    await AsyncStorage.removeItem(`${prefix}txns`).catch(() => {});
    await AsyncStorage.removeItem(`${prefix}meta`).catch(() => {});
    const store = buildStore(serverUrl);
    await store.loadCache();
    await store.syncInBackground();
  }, [serverUrl, buildStore]);

  const value = useMemo(
    () => ({ state, serverUrl, setServerUrl, sync, resetLocalData }),
    [state, serverUrl, setServerUrl, sync, resetLocalData],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
