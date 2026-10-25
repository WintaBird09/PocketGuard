import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSyncEngine, syncStatusLabel } from './engine';

type PushResult = { error: string | null; retryAt: string | null };

function setup(overrides: { pending?: number } = {}) {
  let pending = overrides.pending ?? 0;
  const push = vi.fn<() => Promise<PushResult>>(async () => {
    pending = 0;
    return { error: null, retryAt: null };
  });
  const pull = vi.fn<() => Promise<{ error: string | null }>>(async () => ({ error: null }));
  const engine = createSyncEngine({
    push,
    pull,
    pendingCount: () => pending,
    debounceMs: 2000,
    fallbackRetryMs: 30_000,
  });
  return {
    engine,
    push,
    pull,
    setPending: (n: number) => {
      pending = n;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('sync engine triggers', () => {
  it('stays local-only until enabled, then syncs on start', async () => {
    const { engine, push, pull } = setup({ pending: 3 });
    await engine.syncNow();
    expect(push).not.toHaveBeenCalled();
    expect(engine.getSnapshot()).toMatchObject({ status: 'signed-out', pending: 3 });

    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(push).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', pending: 0, error: null });
    expect(engine.getSnapshot().lastSyncedAt).not.toBeNull();
  });

  it('debounces a burst of writes into one sync', async () => {
    const { engine, push, setPending } = setup();
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    push.mockClear();

    for (let i = 1; i <= 5; i += 1) {
      setPending(i);
      engine.requestSync();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(engine.getSnapshot()).toMatchObject({ status: 'pending', pending: 5 });
    expect(push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(push).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().status).toBe('synced');
  });

  it('shows offline with the pending count, does not call the network, and syncs when back online', async () => {
    const { engine, push, setPending } = setup();
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    push.mockClear();

    engine.setOnline(false);
    setPending(2);
    engine.requestSync();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(push).not.toHaveBeenCalled();
    expect(engine.getSnapshot()).toMatchObject({ status: 'offline', pending: 2 });
    expect(syncStatusLabel(engine.getSnapshot())).toBe('Offline · 2 pending');

    engine.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(push).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', pending: 0 });
  });

  it('does not run two syncs at once and re-runs once for writes made mid-sync', async () => {
    const { engine, push } = setup();
    let release: () => void = () => {};
    push.mockImplementationOnce(
      () =>
        new Promise<PushResult>((resolve) => {
          release = () => resolve({ error: null, retryAt: null });
        }),
    );
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.getSnapshot().status).toBe('syncing');

    void engine.syncNow();
    void engine.syncNow();
    expect(push).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(push).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot().status).toBe('synced');
  });
});

describe('sync engine failures and retry', () => {
  it('reports a push error, keeps the pending count, and retries at the backoff time', async () => {
    const { engine, push, setPending } = setup({ pending: 2 });
    const retryAt = new Date(Date.now() + 8000).toISOString();
    push.mockImplementationOnce(async () => ({ error: 'boom', retryAt }));
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.getSnapshot()).toMatchObject({ status: 'error', error: 'boom', pending: 2 });
    expect(syncStatusLabel(engine.getSnapshot())).toBe('Sync error');

    setPending(2);
    await vi.advanceTimersByTimeAsync(7000);
    expect(push).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(push).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', error: null });
  });

  it('keeps the error visible when more writes arrive, then clears it on success', async () => {
    const { engine, push } = setup({ pending: 1 });
    push.mockImplementationOnce(async () => ({ error: 'down', retryAt: null }));
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    engine.requestSync();
    expect(engine.getSnapshot().status).toBe('error');
    await vi.advanceTimersByTimeAsync(2000);
    expect(engine.getSnapshot().status).toBe('synced');
  });

  it('treats a thrown push (e.g. no session) as an error and retries later', async () => {
    const { engine, push } = setup({ pending: 1 });
    push.mockRejectedValueOnce(new Error('Sign in before syncing local changes.'));
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'Sign in before syncing local changes.',
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('reports a pull failure after a successful push', async () => {
    const { engine, pull } = setup();
    pull.mockResolvedValueOnce({ error: 'Unable to pull debts: 500' });
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'Unable to pull debts: 500',
    });
  });

  it('schedules a follow-up when rows are still waiting out a retry delay', async () => {
    const { engine, push, setPending } = setup();
    const retryAt = new Date(Date.now() + 5000).toISOString();
    push.mockImplementationOnce(async () => {
      setPending(1);
      return { error: null, retryAt };
    });
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.getSnapshot()).toMatchObject({ status: 'pending', pending: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(push).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot().status).toBe('synced');
  });

  it('stops everything on sign-out and after dispose', async () => {
    const { engine, push } = setup();
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    push.mockClear();
    engine.setEnabled(false);
    engine.requestSync();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(push).not.toHaveBeenCalled();
    expect(engine.getSnapshot().status).toBe('signed-out');
    engine.dispose();
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(push).not.toHaveBeenCalled();
  });
});
