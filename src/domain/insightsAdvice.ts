import { z } from 'zod';

const xafAmount = z.number().int().min(0).max(2_000_000_000);
const financialTotalsSchema = z.object({
  income: xafAmount,
  expenses: xafAmount,
});

export const insightsAdviceRequestSchema = z.object({
  question: z.string().trim().min(1).max(240),
  snapshot: z.object({
    period: z.enum(['week', 'month', 'quarter', 'halfYear', 'year', 'custom']),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    current: financialTotalsSchema.extend({
      saved: xafAmount,
      planned: xafAmount,
      fullPeriodPlanned: xafAmount,
      transactionCount: z.number().int().min(0).max(100_000),
      categories: z
        .array(
          z.object({
            name: z.string().min(1).max(80),
            spent: xafAmount,
            planned: xafAmount,
          }),
        )
        .max(20),
      incomeSources: z
        .array(z.object({ name: z.string().min(1).max(80), received: xafAmount }))
        .max(20),
    }),
    previous: financialTotalsSchema,
    projection: z.object({
      expenses: xafAmount.nullable(),
      income: xafAmount.nullable(),
    }),
    position: z.object({
      saved: xafAmount,
      savingsTarget: xafAmount,
      debtRemaining: xafAmount,
      loansOutstanding: xafAmount,
      goals: z.number().int().min(0).max(1000),
    }),
  }),
});

export const insightsAdviceResponseSchema = z.object({
  title: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(1200),
  nextStep: z.string().trim().min(1).max(400),
});

export type InsightsAdviceRequest = z.infer<typeof insightsAdviceRequestSchema>;
export type InsightsAdviceResponse = z.infer<typeof insightsAdviceResponseSchema>;
