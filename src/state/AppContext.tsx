import NetInfo from '@react-native-community/netinfo';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import type { ProfileKey } from '../config/constants';
import { pendingCount } from '../db/database';
import { getCachedUser, login as msLogin, logout as msLogout } from '../services/auth';
import { syncNow } from '../services/sync';
import type { UserProfile } from '../types';

export type Route =
  | { name: 'home' } | { name: 'field' } | { name: 'office' } | { name: 'approvals' }
  | { name: 'detail'; localId: string };

interface Ctx {
  ready: boolean;
  user: UserProfile | null;
  profile: ProfileKey | null;
  online: boolean;
  pending: number;
  syncing: boolean;
  route: Route;
  stack: Route[];
  navigate: (r: Route) => void;
  back: () => void;
  setProfile: (p: ProfileKey | null) => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshPending: () => Promise<void>;
  sync: (silent?: boolean) => Promise<void>;
  version: number; // muda após sincronizar (recarrega listas)
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [profile, setProfile] = useState<ProfileKey | null>(null);
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [version, setVersion] = useState(0);
  const userRef = useRef(user);
  userRef.current = user;

  const refreshPending = useCallback(async () => setPending(await pendingCount()), []);

  const sync = useCallback(async (silent = false) => {
    if (!userRef.current) return;
    setSyncing(true);
    try {
      const r = await syncNow();
      if (!silent) Alert.alert('Sincronizado', `${r.pushed} enviado(s), ${r.pulled} item(ns) na base.${r.master ? '\nPlanilha mestre atualizada.' : ''}`);
      setVersion((v) => v + 1);
    } catch (e: any) {
      if (!silent) Alert.alert('Sincronização', e.message ?? String(e));
    } finally {
      setSyncing(false);
      refreshPending();
    }
  }, [refreshPending]);

  useEffect(() => {
    (async () => {
      setUser(await getCachedUser());
      await refreshPending();
      setReady(true);
    })();
  }, [refreshPending]);

  // Sincroniza automaticamente ao recuperar a rede e a cada 5 min se houver pendências.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      const on = !!s.isConnected && s.isInternetReachable !== false;
      setOnline((prev) => {
        if (on && !prev) sync(true);
        return on;
      });
    });
    const t = setInterval(async () => { if ((await pendingCount()) > 0) sync(true); }, 5 * 60 * 1000);
    return () => { unsub(); clearInterval(t); };
  }, [sync]);

  const value: Ctx = {
    ready, user, profile, online, pending, syncing, version, stack,
    route: stack[stack.length - 1],
    navigate: (r) => setStack((s) => [...s, r]),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    setProfile,
    login: async () => { setUser(await msLogin()); sync(true); },
    logout: async () => { await msLogout(); setUser(null); setProfile(null); setStack([{ name: 'home' }]); },
    refreshPending, sync,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
