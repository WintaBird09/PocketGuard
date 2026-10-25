import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '../auth/AuthProvider';
import { openAppDatabase } from '../data/db';
import { getActiveHouseholdId } from '../data/household';
import { onOutboxAppended } from '../data/outboxEvents';
import { localDateString } from '../domain/dates';
import { useSyncStatus } from '../sync/SyncProvider';

import { listUnparsedVoiceDrafts, saveVoiceDraftParse } from './drafts';
import { parseVoiceTranscript } from './parser';

type VoiceDraftStatus = {
  processing: boolean;
  error: string | null;
  revision: number;
  retry: () => void;
};

const VoiceDraftContext = createContext<VoiceDraftStatus>({
  processing: false,
  error: null,
  revision: 0,
  retry: () => {},
});

function isOnline(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function VoiceDraftProvider({ children }: { children: ReactNode }) {
  const { session, householdBootstrapStatus } = useAuth();
  const { snapshot: syncSnapshot } = useSyncStatus();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const activeRun = useRef(false);
  const attempted = useRef(new Set<string>());

  const processPending = useCallback(
    async (online: boolean) => {
      if (!online) {
        attempted.current.clear();
        return;
      }
      if (!session || householdBootstrapStatus !== 'ready' || activeRun.current) return;

      activeRun.current = true;
      setProcessing(true);
      try {
        const db = await openAppDatabase();
        const householdId = getActiveHouseholdId(db);
        const pending = listUnparsedVoiceDrafts(db, householdId).filter(
          (draft) => !attempted.current.has(draft.id),
        );
        for (const draft of pending) {
          attempted.current.add(draft.id);
          const parsed = await parseVoiceTranscript(db, householdId, draft.raw_text);
          saveVoiceDraftParse(
            db,
            householdId,
            draft.id,
            parsed.items.length > 0
              ? parsed.items
              : [
                  {
                    intent: 'unknown',
                    amount_xaf: 0,
                    line_id: null,
                    line_guess_name: null,
                    note: '',
                    date: localDateString(),
                    confidence: 0,
                  },
                ],
          );
          setError(null);
          setRevision((current) => current + 1);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to parse queued voice drafts.');
      } finally {
        activeRun.current = false;
        setProcessing(false);
      }
    },
    [householdBootstrapStatus, session],
  );

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      void processPending(isOnline(state));
    });
    const unsubscribeWrites = onOutboxAppended(() => {
      void NetInfo.fetch().then((state) => processPending(isOnline(state)));
    });
    void NetInfo.fetch().then((state) => processPending(isOnline(state)));
    return () => {
      unsubscribe();
      unsubscribeWrites();
    };
  }, [processPending, syncSnapshot.lastSyncedAt]);

  const value: VoiceDraftStatus = {
    processing,
    error,
    revision,
    retry: () => {
      attempted.current.clear();
      setRevision((current) => current + 1);
      void NetInfo.fetch().then((state) => processPending(isOnline(state)));
    },
  };

  return <VoiceDraftContext.Provider value={value}>{children}</VoiceDraftContext.Provider>;
}

export function useVoiceDraftStatus(): VoiceDraftStatus {
  return useContext(VoiceDraftContext);
}
