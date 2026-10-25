import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { confirmSavingsCommitment } from '../data/savings';
import { submitExpense, getExpenseReview, type ExpenseLineOption } from '../data/transaction-entry';
import type { DatabaseLike } from '../data/db';
import { transactions } from '../data/repos';
import { scheduleNotificationRefresh } from '../notifications/schedule';
import { Banner, Button, Chip } from '../ui/controls';
import { formatXAF } from '../ui/theme';

import { completeVoiceDraft } from './drafts';
import type { ParseExpenseItem } from './contract';

export type SavingsCommitmentOption = {
  id: string;
  lineId: string;
  lineName: string;
  month: string;
  plannedAmount: number;
};

function timestampForDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Enter a valid date in YYYY-MM-DD format.');
  }
  return date.toISOString();
}

export function VoiceConfirmCard({
  item,
  lines,
  commitments,
  db,
  householdId,
  rawText,
  draftId,
  onDone,
}: {
  item: ParseExpenseItem;
  lines: ExpenseLineOption[];
  commitments: SavingsCommitmentOption[];
  db: DatabaseLike;
  householdId: string;
  rawText: string;
  draftId?: string;
  onDone: () => void;
}) {
  const [amountInput, setAmountInput] = useState(item.amount_xaf ? String(item.amount_xaf) : '');
  const [lineId, setLineId] = useState(item.line_id ?? '');
  const [note, setNote] = useState(item.note);
  const [date, setDate] = useState(item.date);
  const [commitmentId, setCommitmentId] = useState(
    commitments.find((entry) => entry.lineId === item.line_id)?.id ?? commitments[0]?.id ?? '',
  );
  const [warningConfirmed, setWarningConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(amountInput.replace(/[\s,]/g, ''));
  const selectedLine = lines.find((line) => line.id === lineId);
  const review = useMemo(() => {
    if (!lineId || !Number.isSafeInteger(amount) || amount <= 0) return null;
    try {
      return getExpenseReview(db, householdId, { lineId, amount, occurredOn: date });
    } catch {
      return null;
    }
  }, [amount, date, db, householdId, lineId]);

  const finishAfterSave = () => {
    setSaved(true);
    if (draftId) {
      try {
        completeVoiceDraft(db, householdId, draftId);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'The entry was saved, but the voice draft could not be removed.',
        );
        setMessage('Your entry is saved. Retry removing this voice note; do not save it again.');
        return;
      }
    }
    onDone();
  };

  const discard = () => {
    if (draftId) {
      try {
        completeVoiceDraft(db, householdId, draftId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to remove this voice draft.');
        return;
      }
    }
    onDone();
  };

  const saveExpense = () => {
    setError(null);
    if (!lineId) {
      setError('Choose a budget line before confirming this expense.');
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError('Enter a positive whole amount in XAF.');
      return;
    }
    let submission: ReturnType<typeof submitExpense>;
    try {
      submission = submitExpense(
        db,
        householdId,
        {
          lineId,
          amount,
          note,
          occurredOn: date,
          source: 'voice',
          rawText,
        },
        warningConfirmed,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this voice expense.');
      return;
    }
    if (!submission.saved) {
      if (submission.reason === 'confirmation-required') {
        setWarningConfirmed(true);
        setMessage(`${submission.review.result.reason} Review the warning and confirm again.`);
      } else {
        setMessage('This hard cap blocks the expense. Use Add transaction to request an override.');
      }
      return;
    }
    scheduleNotificationRefresh();
    finishAfterSave();
  };

  const saveIncome = () => {
    setError(null);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError('Enter a positive whole amount in XAF.');
      return;
    }
    let occurredAt: string;
    try {
      occurredAt = timestampForDate(date);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid date.');
      return;
    }
    try {
      transactions.add(db, householdId, {
        occurred_at: occurredAt,
        amount,
        direction: 'income',
        note: note.trim() || null,
        source: 'voice',
        raw_text: rawText,
        status: 'confirmed',
      });
      finishAfterSave();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this voice income.');
    }
  };

  const checkSpend = () => {
    setError(null);
    if (!lineId) {
      setError('Choose a budget line to check.');
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError('Enter a positive whole amount in XAF.');
      return;
    }
    try {
      const result = getExpenseReview(db, householdId, { lineId, amount, occurredOn: date });
      setMessage(`${result.result.status}: ${result.result.reason}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to check this voice request.');
    }
  };

  const confirmSaving = () => {
    setError(null);
    if (!commitmentId) {
      setError('There is no pending savings commitment to confirm.');
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError('Enter a positive whole amount in XAF.');
      return;
    }
    try {
      const confirmed = confirmSavingsCommitment(
        db,
        householdId,
        commitmentId,
        amount,
        timestampForDate(date),
      );
      if (!confirmed) {
        setError('This savings commitment has already been confirmed.');
        return;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to confirm this savings entry.');
      return;
    }
    scheduleNotificationRefresh();
    finishAfterSave();
  };

  const intentLabel = {
    log_expense: 'Expense',
    check_spend: 'Spend check (will not save a transaction)',
    log_income: 'Income',
    confirm_saving: 'Savings contribution',
    unknown: 'Needs manual review',
  }[item.intent];

  return (
    <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <Text className="text-base font-bold text-slate-900">{intentLabel}</Text>
      <Text className="mt-1 text-sm text-slate-500" numberOfLines={3}>
        “{rawText}”
      </Text>
      {item.confidence < 0.65 ? (
        <Banner tone="info">
          Low-confidence interpretation. Review every field before confirming.
        </Banner>
      ) : null}
      {item.line_guess_name && !item.line_id ? (
        <Banner tone="info">
          Suggested line: {item.line_guess_name}. Select the correct line below.
        </Banner>
      ) : null}
      {message ? <Banner tone="info">{message}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {saved ? (
        <Banner tone="success">
          Saved. The confirmation controls are disabled to prevent a duplicate entry.
        </Banner>
      ) : null}

      <Text className="mb-1 mt-3 text-sm font-medium text-slate-700">Amount (XAF)</Text>
      <TextInput
        accessibilityLabel="Voice amount in XAF"
        keyboardType="number-pad"
        value={amountInput}
        editable={!saved}
        onChangeText={(value) => {
          setAmountInput(value);
          setWarningConfirmed(false);
          setError(null);
        }}
        className="rounded-xl border border-slate-200 px-3 py-3 text-base"
      />

      <Text className="mb-1 mt-3 text-sm font-medium text-slate-700">Date</Text>
      <TextInput
        accessibilityLabel="Voice transaction date"
        value={date}
        editable={!saved}
        onChangeText={(value) => {
          setDate(value);
          setWarningConfirmed(false);
          setError(null);
        }}
        placeholder="YYYY-MM-DD"
        className="rounded-xl border border-slate-200 px-3 py-3 text-base"
      />

      {item.intent === 'log_expense' || item.intent === 'check_spend' ? (
        <>
          <Text className="mb-2 mt-3 text-sm font-medium text-slate-700">Budget line</Text>
          <View className="flex-row flex-wrap gap-2">
            {lines.map((line) => (
              <Chip
                key={line.id}
                label={line.name}
                active={line.id === lineId}
                disabled={saved}
                onPress={() => {
                  setLineId(line.id);
                  setWarningConfirmed(false);
                }}
              />
            ))}
          </View>
          {selectedLine ? (
            <Text className="mt-2 text-xs text-slate-500">
              {selectedLine.hardCap ? 'Hard cap' : 'Flexible'} · planned{' '}
              {formatXAF(selectedLine.planned)}
            </Text>
          ) : null}
        </>
      ) : null}

      {item.intent === 'confirm_saving' ? (
        <>
          <Text className="mb-2 mt-3 text-sm font-medium text-slate-700">Savings commitment</Text>
          <View className="flex-row flex-wrap gap-2">
            {commitments.map((commitment) => (
              <Chip
                key={commitment.id}
                label={`${commitment.lineName} · ${commitment.month}`}
                active={commitment.id === commitmentId}
                disabled={saved}
                onPress={() => setCommitmentId(commitment.id)}
              />
            ))}
          </View>
          {commitments.length === 0 ? (
            <Text className="mt-1 text-sm text-amber-700">
              No unconfirmed savings commitment is available.
            </Text>
          ) : null}
        </>
      ) : null}

      {item.intent !== 'confirm_saving' ? (
        <>
          <Text className="mb-1 mt-3 text-sm font-medium text-slate-700">Note</Text>
          <TextInput
            accessibilityLabel="Voice entry note"
            value={note}
            onChangeText={setNote}
            editable={!saved}
            className="rounded-xl border border-slate-200 px-3 py-3 text-base"
          />
        </>
      ) : null}

      {item.intent === 'log_expense' ? (
        <View className="mt-4">
          <Button
            label={
              warningConfirmed ? 'Confirm warning and save expense' : 'Confirm and save expense'
            }
            disabled={!lineId || saved}
            onPress={saveExpense}
          />
          {review?.result.status === 'BLOCKED' ? (
            <Link href="/add-transaction" className="mt-3 rounded-xl border border-red-200 p-3">
              <Text className="text-center font-semibold text-red-700">
                Review override options
              </Text>
            </Link>
          ) : null}
        </View>
      ) : null}
      {item.intent === 'log_income' ? (
        <View className="mt-4">
          <Button label="Confirm and save income" disabled={saved} onPress={saveIncome} />
        </View>
      ) : null}
      {item.intent === 'check_spend' ? (
        <View className="mt-4">
          <Button label="Check budget" disabled={!lineId || saved} onPress={checkSpend} />
        </View>
      ) : null}
      {item.intent === 'confirm_saving' ? (
        <View className="mt-4">
          <Button
            label="Confirm savings"
            disabled={!commitmentId || saved}
            onPress={confirmSaving}
          />
        </View>
      ) : null}
      <View className="mt-3">
        <Button
          label={
            saved ? 'Retry removing saved voice note' : draftId ? 'Discard voice draft' : 'Dismiss'
          }
          variant="outline"
          onPress={saved ? finishAfterSave : discard}
        />
      </View>
    </View>
  );
}
