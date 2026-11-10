import NetInfo from '@react-native-community/netinfo';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestInsightsAdvice } from './insightsAdvice';
import type { InsightsSnapshot } from '../domain/insights';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../auth/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock('@react-native-community/netinfo', () => ({
  default: { fetch: vi.fn() },
}));

const snapshot: InsightsSnapshot = {
  period: 'month',
  range: {
    start: '2026-11-01',
    end: '2026-11-30',
    through: '2026-11-10',
    comparisonStart: '2026-10-02',
    comparisonThrough: '2026-10-11',
    elapsedDays: 10,
    totalDays: 30,
  },
  current: {
    income: 500_000,
    expenses: 150_000,
    saved: 25_000,
    planned: 200_000,
    fullPeriodPlanned: 600_000,
    transactionCount: 3,
    uncategorizedCount: 0,
    categories: [
      {
        id: 'private-id',
        name: 'Fuel',
        kind: 'running',
        spent: 150_000,
        planned: 80_000,
        fullPeriodPlanned: 240_000,
      },
    ],
    incomeSources: [{ name: 'Business', received: 500_000 }],
  },
  previous: {
    income: 450_000,
    expenses: 120_000,
    saved: 0,
    planned: 200_000,
    fullPeriodPlanned: 600_000,
    transactionCount: 2,
    uncategorizedCount: 0,
    categories: [],
    incomeSources: [],
  },
  projection: { expenses: 450_000, income: 1_500_000 },
  position: {
    saved: 100_000,
    savingsTarget: 1_000_000,
    debtRemaining: 300_000,
    loansOutstanding: 0,
    goals: 1,
  },
};

const localAdvice = { title: 'Local', message: 'Local guidance.', nextStep: 'Review your plan.' };

describe('requestInsightsAdvice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses on-device guidance when offline without calling the cloud function', async () => {
    vi.mocked(NetInfo.fetch).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    } as Awaited<ReturnType<typeof NetInfo.fetch>>);

    const result = await requestInsightsAdvice('What can improve?', snapshot, () => localAdvice);

    expect(result).toEqual({ advice: localAdvice, source: 'local' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('uses cloud guidance online and sends only a summary without line IDs', async () => {
    vi.mocked(NetInfo.fetch).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    } as Awaited<ReturnType<typeof NetInfo.fetch>>);
    mocks.invoke.mockResolvedValue({ data: localAdvice, error: null });

    const result = await requestInsightsAdvice(
      '  What can improve?  ',
      snapshot,
      () => localAdvice,
    );

    expect(result).toEqual({ advice: localAdvice, source: 'cloud' });
    expect(mocks.invoke).toHaveBeenCalledWith(
      'insights-advice',
      expect.objectContaining({
        body: expect.objectContaining({
          question: 'What can improve?',
          snapshot: expect.objectContaining({
            current: expect.objectContaining({
              categories: [{ name: 'Fuel', spent: 150_000, planned: 80_000 }],
            }),
          }),
        }),
      }),
    );
    expect(JSON.stringify(mocks.invoke.mock.calls[0][1])).not.toContain('private-id');
  });

  it('falls back to local guidance when the cloud function fails', async () => {
    vi.mocked(NetInfo.fetch).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    } as Awaited<ReturnType<typeof NetInfo.fetch>>);
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('Unavailable') });

    const result = await requestInsightsAdvice('What can improve?', snapshot, () => localAdvice);

    expect(result).toMatchObject({
      advice: localAdvice,
      source: 'local',
      fallbackReason: 'Unavailable',
    });
  });
});
