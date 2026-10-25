import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Expected a real calendar date.');

const localId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const parseExpenseInputSchema = z
  .object({
    transcript: z.string().trim().min(1).max(2000),
    lines: z
      .array(
        z.object({
          id: localId,
          name: z.string().trim().min(1).max(100),
        }),
      )
      .max(100),
    today: isoDate,
    timezone: z.string().min(1).max(100),
  })
  .strict();

export const voiceIntentSchema = z.enum([
  'log_expense',
  'check_spend',
  'log_income',
  'confirm_saving',
  'unknown',
]);

export const parseExpenseItemSchema = z
  .object({
    intent: voiceIntentSchema,
    amount_xaf: z.number().int().min(0).max(2_000_000_000),
    line_id: localId.nullable(),
    line_guess_name: z.string().max(100).nullable(),
    note: z.string().max(300),
    date: isoDate,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const parseExpenseResponseSchema = z
  .object({ items: z.array(parseExpenseItemSchema).min(1).max(10) })
  .strict();

export type ParseExpenseInput = z.infer<typeof parseExpenseInputSchema>;
export type ParseExpenseItem = z.infer<typeof parseExpenseItemSchema>;
export type ParseExpenseResponse = z.infer<typeof parseExpenseResponseSchema>;

export function normalizeParsedLineIds(
  response: ParseExpenseResponse,
  lines: ParseExpenseInput['lines'],
): ParseExpenseResponse {
  const validIds = new Set(lines.map((line) => line.id));
  return {
    items: response.items.map((item) => ({
      ...item,
      line_id: item.line_id !== null && validIds.has(item.line_id) ? item.line_id : null,
    })),
  };
}
