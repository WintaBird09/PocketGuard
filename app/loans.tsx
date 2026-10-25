import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import {
  filterLoans,
  loanBadgeStyle,
  loanDueText,
  loanFilters,
  sortLoans,
  loanStatusLabel,
  type LoanFilter,
} from '@/src/data/loanView';
import { listLoans, totalOwedToYou } from '@/src/data/loans';
import { Banner, Button, Chip } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

export default function LoansScreen() {
  const { db, householdId, error: dbError, tick } = useDatabase();
  const router = useRouter();
  const [filter, setFilter] = useState<LoanFilter>('ACTIVE');

  const loaded = useMemo(() => {
    if (!db || !householdId) return { loans: null, owed: 0, failure: null };
    try {
      return {
        loans: listLoans(db, householdId),
        owed: totalOwedToYou(db, householdId),
        failure: null,
      };
    } catch (cause) {
      return {
        loans: null,
        owed: 0,
        failure: cause instanceof Error ? cause.message : 'Unable to load loans.',
      };
    }
    // tick re-reads when the screen regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, tick]);

  const visible = useMemo(
    () => (loaded.loans ? sortLoans(filterLoans(loaded.loans, filter)) : []),
    [loaded.loans, filter],
  );
  const failure = dbError ?? loaded.failure;

  return (
    <PageLayout title="Loans" subtitle="Money you lent to friends and family">
      {failure ? <Banner tone="error">{failure}</Banner> : null}

      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Owed to you
        </Text>
        <Text className="mt-2 text-3xl font-bold text-slate-900">{formatXAF(loaded.owed)}</Text>
        <Text className="mt-1 text-sm text-slate-600">
          Not part of your budget or savings goal.
        </Text>
      </View>

      <View className="mt-4">
        <Button label="Add loan" onPress={() => router.push('/loan-form')} />
      </View>

      <View className="mt-4 flex-row flex-wrap gap-2">
        {loanFilters.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            active={filter === item.key}
            onPress={() => setFilter(item.key)}
          />
        ))}
      </View>

      <View className="mt-4 gap-3">
        {loaded.loans && visible.length === 0 ? (
          <Text className="text-sm text-slate-600">
            {loaded.loans.length === 0 ? 'No loans recorded yet.' : 'No loans match this filter.'}
          </Text>
        ) : null}
        {visible.map((loan) => (
          <View
            key={loan.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 text-base font-bold text-slate-900">{loan.personName}</Text>
              <Text
                className={`rounded-full border px-2 py-0.5 text-xs font-bold ${loanBadgeStyle[loan.status]}`}
              >
                {loanStatusLabel[loan.status]}
              </Text>
            </View>
            <Text className="mt-1 text-sm text-slate-600">
              Lent {loan.lentOn} · {formatXAF(loan.amount)}
            </Text>
            <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <View
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${loan.percentPaid}%` }}
              />
            </View>
            <View className="mt-2 flex-row justify-between">
              <Text className="text-sm text-slate-600">
                {formatXAF(loan.paid)} repaid · {formatXAF(loan.balance)} left
              </Text>
              <Text
                className={`text-sm font-semibold ${loan.status === 'OVERDUE' ? 'text-red-700' : 'text-slate-700'}`}
              >
                {loanDueText(loan)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </PageLayout>
  );
}
