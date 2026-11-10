import NetInfo from '@react-native-community/netinfo';

import { supabase } from '../auth/client';
import type { InsightsSnapshot, InsightsAdvice } from '../domain/insights';
import { insightsAdviceResponseSchema, type InsightsAdviceRequest } from '../domain/insightsAdvice';

export type AdviceSource = 'cloud' | 'local';
export type AdviceResult = {
  advice: InsightsAdvice;
  source: AdviceSource;
  fallbackReason?: string;
};

function createRequest(question: string, snapshot: InsightsSnapshot): InsightsAdviceRequest {
  return {
    question: question.trim(),
    snapshot: {
      period: snapshot.period,
      start: snapshot.range.start,
      through: snapshot.range.through,
      current: {
        income: snapshot.current.income,
        expenses: snapshot.current.expenses,
        saved: snapshot.current.saved,
        planned: snapshot.current.planned,
        fullPeriodPlanned: snapshot.current.fullPeriodPlanned,
        transactionCount: snapshot.current.transactionCount,
        categories: snapshot.current.categories.slice(0, 20).map(({ name, spent, planned }) => ({
          name,
          spent,
          planned,
        })),
        incomeSources: snapshot.current.incomeSources
          .slice(0, 20)
          .map(({ name, received }) => ({ name, received })),
      },
      previous: {
        income: snapshot.previous.income,
        expenses: snapshot.previous.expenses,
      },
      projection: snapshot.projection,
      position: snapshot.position,
    },
  };
}

export async function requestInsightsAdvice(
  question: string,
  snapshot: InsightsSnapshot,
  localAnswer: () => InsightsAdvice,
): Promise<AdviceResult> {
  try {
    const network = await NetInfo.fetch();
    const online = network.isConnected !== false && network.isInternetReachable !== false;
    if (!online) return { advice: localAnswer(), source: 'local' };
    if (!supabase) throw new Error('Cloud guidance is not configured.');

    const { data, error } = await supabase.functions.invoke('insights-advice', {
      body: createRequest(question, snapshot),
    });
    if (error) throw error;

    const parsed = insightsAdviceResponseSchema.safeParse(data);
    if (!parsed.success) throw new Error('Cloud guidance returned an invalid response.');
    return { advice: parsed.data, source: 'cloud' };
  } catch (cause) {
    return {
      advice: localAnswer(),
      source: 'local',
      fallbackReason:
        cause instanceof Error ? cause.message : 'Cloud guidance is temporarily unavailable.',
    };
  }
}
