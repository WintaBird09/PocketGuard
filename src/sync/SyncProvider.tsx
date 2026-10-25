import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/src/auth/AuthProvider';
import { openAppDatabase } from '@/src/data/db';
import { getActiveHouseholdId } from '@/src/data/household';
import { onOutboxAppended } from '@/src/data/outboxEvents';

import { pullPendingChanges, pushPendingChanges } from './client';
import { createSyncEngine, type SyncEngine, type SyncSnapshot } from './engine';
import { countPendingChanges } from './push';

const signedOut: SyncSnapshot = {
  status: 'signed-out',
  pending: 0,
  error: null,
  lastSyncedAt: null,
};

type SyncContextValue = { snapshot: SyncSnapshot; syncNow: () => void };

const SyncContext = createContext<SyncContextValue>({ snapshot: signedOut, syncNow: () => {} });

function isReachable(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session, householdBootstrapStatus } = useAuth();
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(signedOut);
  const canSync = Boolean(session) && householdBootstrapStatus === 'ready';

  useEffect(() => {
    let active = true;
    let cleanup = () => {};

    void openAppDatabase().then((db) => {
      if (!active) return;
      const created = createSyncEngine({
        push: async () => {
          const result = await pushPendingChanges(db);
          return { error: result.error, retryAt: result.retryAt };
        },
        pull: async () => {
          const result = await pullPendingChanges(db, getActiveHouseholdId(db));
          return { error: result.error };
        },
        pendingCount: () => countPendingChanges(db),
      });
      const unsubscribeSnapshot = created.subscribe(setSnapshot);
      const unsubscribeWrites = onOutboxAppended(() => created.requestSync());
      const unsubscribeNet = NetInfo.addEventListener((state) =>
        created.setOnline(isReachable(state)),
      );
      setEngine(created);
      cleanup = () => {
        unsubscribeSnapshot();
        unsubscribeWrites();
        unsubscribeNet();
        created.dispose();
      };
    });

    return () => {
      active = false;
      cleanup();
      setEngine(null);
    };
  }, []);

  useEffect(() => {
    engine?.setEnabled(canSync);
  }, [engine, canSync]);

  const value = useMemo<SyncContextValue>(
    () => ({ snapshot, syncNow: () => void engine?.syncNow() }),
    [engine, snapshot],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncContextValue {
  return useContext(SyncContext);
}
