export type SyncStatus = 'signed-out' | 'offline' | 'syncing' | 'pending' | 'synced' | 'error';

export type SyncSnapshot = {
  status: SyncStatus;
  pending: number;
  error: string | null;
  lastSyncedAt: string | null;
};

export type SyncDependencies = {
  push: () => Promise<{ error: string | null; retryAt: string | null }>;
  pull: () => Promise<{ error: string | null }>;
  pendingCount: () => number;
  now?: () => Date;
  debounceMs?: number;
  // Used when a push fails without telling us when to retry.
  fallbackRetryMs?: number;
};

type Listener = (snapshot: SyncSnapshot) => void;

const defaultDebounceMs = 2_000;
const defaultFallbackRetryMs = 30_000;

// Decides when to sync and what to show. Network, auth and storage come in through dependencies,
// so every trigger and state is testable without a device.
export function createSyncEngine(deps: SyncDependencies) {
  const now = deps.now ?? (() => new Date());
  const debounceMs = deps.debounceMs ?? defaultDebounceMs;
  const fallbackRetryMs = deps.fallbackRetryMs ?? defaultFallbackRetryMs;

  let enabled = false;
  let online = true;
  let running: Promise<void> | null = null;
  let rerun = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let snapshot: SyncSnapshot = {
    status: 'signed-out',
    pending: 0,
    error: null,
    lastSyncedAt: null,
  };
  const listeners = new Set<Listener>();

  const readPending = () => {
    try {
      return deps.pendingCount();
    } catch {
      return snapshot.pending;
    }
  };

  const publish = (next: Partial<SyncSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener(snapshot);
  };

  const idleStatus = (): SyncStatus => {
    if (!enabled) return 'signed-out';
    if (!online) return 'offline';
    return snapshot.pending > 0 ? 'pending' : 'synced';
  };

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
  };

  const scheduleRetry = (retryAt: string | null) => {
    clearRetry();
    const target = retryAt ? new Date(retryAt).getTime() : NaN;
    const delay = Number.isFinite(target)
      ? Math.max(1_000, target - now().getTime())
      : fallbackRetryMs;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void syncNow();
    }, delay);
  };

  const runOnce = async () => {
    publish({ status: 'syncing', pending: readPending() });
    let pushed;
    try {
      pushed = await deps.push();
    } catch (cause) {
      publish({
        status: 'error',
        pending: readPending(),
        error: cause instanceof Error ? cause.message : 'Unable to upload changes.',
      });
      scheduleRetry(null);
      return false;
    }
    if (pushed.error) {
      publish({ status: 'error', pending: readPending(), error: pushed.error });
      scheduleRetry(pushed.retryAt);
      return false;
    }
    try {
      const pulled = await deps.pull();
      if (pulled.error) {
        publish({ status: 'error', pending: readPending(), error: pulled.error });
        scheduleRetry(null);
        return false;
      }
    } catch (cause) {
      publish({
        status: 'error',
        pending: readPending(),
        error: cause instanceof Error ? cause.message : 'Unable to download changes.',
      });
      scheduleRetry(null);
      return false;
    }
    clearRetry();
    // Rows still queued here are waiting out a retry delay, so come back when it ends.
    const pending = readPending();
    publish({ pending, error: null, lastSyncedAt: now().toISOString() });
    if (pending > 0 && pushed.retryAt) scheduleRetry(pushed.retryAt);
    publish({ status: idleStatus() });
    return true;
  };

  async function syncNow(): Promise<void> {
    if (disposed) return;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    publish({ pending: readPending() });
    if (!enabled || !online) {
      publish({ status: idleStatus() });
      return;
    }
    if (running) {
      rerun = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          rerun = false;
          const ok = await runOnce();
          if (!ok) rerun = false;
        } while (rerun && enabled && online && !disposed);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: Listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },
    // After a local write: show the new pending count now, sync once writes settle.
    requestSync() {
      if (disposed) return;
      publish({ pending: readPending() });
      if (!running && snapshot.status !== 'error') publish({ status: idleStatus() });
      if (!enabled || !online) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        void syncNow();
      }, debounceMs);
    },
    // App start / sign-in: sync immediately, or fall back to signed-out.
    setEnabled(next: boolean) {
      if (enabled === next) return;
      enabled = next;
      if (!next) clearRetry();
      void syncNow();
    },
    // Connectivity regain syncs at once; losing it only updates the indicator.
    setOnline(next: boolean) {
      if (online === next) return;
      online = next;
      if (!next) {
        clearRetry();
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      void syncNow();
    },
    syncNow,
    dispose() {
      disposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearRetry();
      listeners.clear();
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;

export function syncStatusLabel(snapshot: SyncSnapshot): string {
  switch (snapshot.status) {
    case 'signed-out':
      return 'Local only';
    case 'offline':
      return snapshot.pending > 0 ? `Offline · ${snapshot.pending} pending` : 'Offline';
    case 'syncing':
      return 'Syncing…';
    case 'pending':
      return `${snapshot.pending} pending`;
    case 'error':
      return 'Sync error';
    default:
      return 'Synced';
  }
}
