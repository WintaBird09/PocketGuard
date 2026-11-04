import type { DatabaseLike } from './db';
import {
  assertMonthKey,
  assertWholeAmount,
  inTransaction,
  newId,
  requirePrepared,
} from './household';
import { appendOutboxEntry, transactions } from './repos';

export const incomeKinds = ['salary', 'business', 'rental', 'other'] as const;
export type IncomeKind = (typeof incomeKinds)[number];

export type IncomeStream = {
  id: string;
  name: string;
  kind: IncomeKind;
  recurringAmount: number | null;
  recurringDay: number | null;
  recurringStartMonth: string | null;
};

export type IncomeEntry = {
  id: string;
  amount: number;
  streamId: string | null;
  streamName: string;
  occurredAt: string;
  note: string;
  kind: IncomeKind | null;
};

export type PlannedIncome = {
  stream: IncomeStream;
  amount: number;
  day: number;
  confirmed: boolean;
};

export type IncomeMonth = {
  streams: IncomeStream[];
  monthStreams: IncomeStream[];
  entries: IncomeEntry[];
  monthTotal: number;
  entryCount: number;
  streamTotals: Map<string, number>;
  plannedIncome: PlannedIncome[];
};

export function paydayForMonth(month: string, configuredDay: number): number {
  assertMonthKey(month);
  if (!Number.isSafeInteger(configuredDay) || configuredDay < 1 || configuredDay > 31) {
    throw new Error('Choose a monthly income day from 1 to 31.');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  const finalDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Math.min(configuredDay, finalDay);
}

const defaultNames: Record<IncomeKind, string> = {
  salary: 'Income from Salary',
  business: 'Income from Business',
  rental: 'Income from Rental',
  other: 'Other income',
};

export function listIncomeStreams(db: DatabaseLike, householdId: string): IncomeStream[] {
  const rows = requirePrepared(db)(
    `SELECT id, name, kind, recurring_amount, recurring_day, recurring_start_month
       FROM income_streams
      WHERE household_id = ? AND deleted_at IS NULL
      ORDER BY CASE kind
        WHEN 'salary' THEN 0 WHEN 'business' THEN 1 WHEN 'rental' THEN 2 ELSE 3
      END, name COLLATE NOCASE;`,
  ).all(householdId);

  return rows.map((row) => {
    const kind = incomeKinds.find((candidate) => candidate === row.kind);
    if (!kind) throw new Error('An income source has an invalid type.');
    const recurringAmount = typeof row.recurring_amount === 'number' ? row.recurring_amount : null;
    const recurringDay = typeof row.recurring_day === 'number' ? row.recurring_day : null;
    const recurringStartMonth =
      typeof row.recurring_start_month === 'string' ? row.recurring_start_month : null;
    const recurringFields = [recurringAmount, recurringDay, recurringStartMonth];
    if (
      recurringFields.some((value) => value !== null) &&
      (recurringAmount === null ||
        recurringAmount <= 0 ||
        recurringDay === null ||
        recurringDay < 1 ||
        recurringDay > 31 ||
        recurringStartMonth === null)
    ) {
      throw new Error('An income source has an invalid monthly income plan.');
    }
    if (recurringStartMonth !== null) assertMonthKey(recurringStartMonth);
    return {
      id: String(row.id),
      name: String(row.name),
      kind,
      recurringAmount,
      recurringDay,
      recurringStartMonth,
    };
  });
}

export function addIncomeStream(
  db: DatabaseLike,
  householdId: string,
  draft: {
    kind: IncomeKind;
    name?: string;
    recurring?: { amount: number; day: number; startMonth: string };
  },
): IncomeStream {
  if (!incomeKinds.includes(draft.kind)) throw new Error('Choose a valid income type.');
  const name = (draft.name ?? '').trim() || defaultNames[draft.kind];
  if (name.length > 80) throw new Error('Income source names must be 80 characters or fewer.');
  if (draft.recurring) {
    assertWholeAmount(draft.recurring.amount);
    if (
      !Number.isSafeInteger(draft.recurring.day) ||
      draft.recurring.day < 1 ||
      draft.recurring.day > 31
    ) {
      throw new Error('Choose a monthly income day from 1 to 31.');
    }
    assertMonthKey(draft.recurring.startMonth);
  }

  return inTransaction(db, () => {
    const prepare = requirePrepared(db);
    const duplicate = prepare(
      `SELECT 1 FROM income_streams
        WHERE household_id = ? AND deleted_at IS NULL AND lower(name) = lower(?);`,
    ).get(householdId, name);
    if (duplicate) throw new Error('An income source with this name already exists.');

    const id = newId();
    const now = new Date().toISOString();
    prepare(
      `INSERT INTO income_streams
        (id, household_id, name, kind, recurring_amount, recurring_day, recurring_start_month,
         created_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL);`,
    ).run(
      id,
      householdId,
      name,
      draft.kind,
      draft.recurring?.amount ?? null,
      draft.recurring?.day ?? null,
      draft.recurring?.startMonth ?? null,
      now,
      now,
    );
    appendOutboxEntry(db, householdId, 'income_streams', id, 'create');
    return {
      id,
      name,
      kind: draft.kind,
      recurringAmount: draft.recurring?.amount ?? null,
      recurringDay: draft.recurring?.day ?? null,
      recurringStartMonth: draft.recurring?.startMonth ?? null,
    };
  });
}

export function updateRecurringIncomePlan(
  db: DatabaseLike,
  householdId: string,
  streamId: string,
  changes: { amount: number; day: number },
): void {
  assertWholeAmount(changes.amount);
  if (!Number.isSafeInteger(changes.day) || changes.day < 1 || changes.day > 31) {
    throw new Error('Choose a monthly income day from 1 to 31.');
  }

  inTransaction(db, () => {
    const prepare = requirePrepared(db);
    const existing = prepare(
      `SELECT recurring_amount, recurring_day, recurring_start_month
         FROM income_streams
        WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
    ).get(streamId, householdId);
    if (!existing) throw new Error('Income source was not found.');
    if (
      typeof existing.recurring_amount !== 'number' ||
      typeof existing.recurring_day !== 'number' ||
      typeof existing.recurring_start_month !== 'string'
    ) {
      throw new Error('This income source has no fixed monthly plan to edit.');
    }

    const now = new Date().toISOString();
    prepare(
      `UPDATE income_streams
          SET recurring_amount = ?, recurring_day = ?, updated_at = ?
        WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
    ).run(changes.amount, changes.day, now, streamId, householdId);
    appendOutboxEntry(db, householdId, 'income_streams', streamId, 'upsert');
  });
}

export function getIncomeMonth(db: DatabaseLike, householdId: string, month: string): IncomeMonth {
  assertMonthKey(month);
  const prepare = requirePrepared(db);
  const streams = listIncomeStreams(db, householdId);
  const summary = prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
       FROM transactions
      WHERE household_id = ? AND direction = 'income' AND status = 'confirmed'
        AND deleted_at IS NULL AND substr(occurred_at, 1, 7) = ?;`,
  ).get(householdId, month);
  if (!summary) throw new Error('Unable to load the monthly income summary.');

  const totals = prepare(
    `SELECT income_stream_id, SUM(amount) AS total
       FROM transactions
      WHERE household_id = ? AND direction = 'income' AND status = 'confirmed'
        AND deleted_at IS NULL AND substr(occurred_at, 1, 7) = ?
        AND income_stream_id IS NOT NULL
      GROUP BY income_stream_id;`,
  ).all(householdId, month);
  const rows = prepare(
    `SELECT t.id, t.amount, t.income_stream_id, t.occurred_at, t.note,
            s.name AS stream_name, s.kind AS stream_kind
       FROM transactions t
       LEFT JOIN income_streams s ON s.id = t.income_stream_id
      WHERE t.household_id = ? AND t.direction = 'income' AND t.status = 'confirmed'
        AND t.deleted_at IS NULL AND substr(t.occurred_at, 1, 7) = ?
      ORDER BY t.occurred_at DESC LIMIT 50;`,
  ).all(householdId, month);
  const confirmedPlans = new Set(
    prepare(
      `SELECT income_stream_id FROM transactions
        WHERE household_id = ? AND direction = 'income' AND status = 'confirmed'
          AND recurring_income_month = ? AND deleted_at IS NULL;`,
    )
      .all(householdId, month)
      .flatMap((row) => (typeof row.income_stream_id === 'string' ? [row.income_stream_id] : [])),
  );
  const streamTotals = new Map(
    totals.flatMap((row) =>
      typeof row.income_stream_id === 'string'
        ? [[row.income_stream_id, Number(row.total)] as const]
        : [],
    ),
  );
  const plannedIncome = streams.flatMap((stream) =>
    stream.recurringAmount !== null &&
    stream.recurringDay !== null &&
    stream.recurringStartMonth !== null &&
    month >= stream.recurringStartMonth
      ? [
          {
            stream,
            amount: stream.recurringAmount,
            day: paydayForMonth(month, stream.recurringDay),
            confirmed: confirmedPlans.has(stream.id),
          },
        ]
      : [],
  );
  const entries = rows.map((row) => ({
    id: String(row.id),
    amount: Number(row.amount),
    streamId: typeof row.income_stream_id === 'string' ? row.income_stream_id : null,
    streamName: String(row.stream_name ?? 'Unassigned income'),
    occurredAt: String(row.occurred_at),
    note: String(row.note ?? ''),
    kind: incomeKinds.find((candidate) => candidate === row.stream_kind) ?? null,
  }));
  const monthStreamIds = new Set([
    ...streamTotals.keys(),
    ...plannedIncome.map((plan) => plan.stream.id),
  ]);
  const monthStreams = streams.filter((stream) => monthStreamIds.has(stream.id));

  return {
    streams,
    monthStreams,
    entries,
    monthTotal: Number(summary.total),
    entryCount: Number(summary.count),
    streamTotals,
    plannedIncome,
  };
}

export function confirmRecurringIncome(
  db: DatabaseLike,
  householdId: string,
  streamId: string,
  month: string,
) {
  assertMonthKey(month);
  const stream = listIncomeStreams(db, householdId).find((candidate) => candidate.id === streamId);
  if (
    !stream ||
    stream.recurringAmount === null ||
    stream.recurringDay === null ||
    stream.recurringStartMonth === null ||
    month < stream.recurringStartMonth
  ) {
    throw new Error('This source has no recurring income scheduled for that month.');
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const day = paydayForMonth(month, stream.recurringDay);
  const occurredAt = new Date(Date.UTC(year, monthNumber - 1, day, 11)).toISOString();
  return transactions.add(db, householdId, {
    occurred_at: occurredAt,
    amount: stream.recurringAmount,
    direction: 'income',
    income_stream_id: stream.id,
    recurring_income_month: month,
    source: 'recurring',
  });
}
