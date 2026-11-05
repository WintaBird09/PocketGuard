import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  filterLoans,
  loanDueText,
  loanFilters,
  sortLoans,
  type LoanFilter,
} from '@/src/data/loanView';
import { loanStatusLabel, type LoanStatus } from '@/src/domain/loans';
import { getLendingCap, lentInMonth } from '@/src/data/lendingCap';
import { localDateString } from '@/src/domain/dates';
import { toneForUsedRatio } from '@/src/domain/lineBalance';
import { listLoans, listPersonSummaries, totalOwedToYou } from '@/src/data/loans';
import { Banner } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

export default function LoansScreen() {
  const { db, householdId, loading, error: dbError, tick } = useDatabase();
  const router = useRouter();
  const [filter, setFilter] = useState<LoanFilter>('ACTIVE');

  const loaded = useMemo(() => {
    if (!db || !householdId)
      return { loans: null, people: [], owed: 0, cap: null, lentThisMonth: 0, failure: null };
    try {
      return {
        cap: getLendingCap(db, householdId),
        lentThisMonth: lentInMonth(db, householdId, localDateString().slice(0, 7)),
        loans: listLoans(db, householdId),
        people: listPersonSummaries(db, householdId),
        owed: totalOwedToYou(db, householdId),
        failure: null,
      };
    } catch (cause) {
      return {
        loans: null,
        people: [],
        owed: 0,
        cap: null,
        lentThisMonth: 0,
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
  const people = loaded.people;
  const failure = dbError ?? loaded.failure;

  const stats = useMemo(() => {
    const counted = (loaded.loans ?? []).filter((loan) => loan.status !== 'WRITTEN_OFF');
    const lent = counted.reduce((sum, loan) => sum + loan.amount, 0);
    const repaid = counted.reduce((sum, loan) => sum + loan.paid, 0);
    return {
      lent,
      repaid,
      percent: lent > 0 ? Math.min(100, Math.round((repaid / lent) * 100)) : 0,
      overdue: counted.filter((loan) => loan.status === 'OVERDUE').length,
    };
  }, [loaded.loans]);

  const capRatio = loaded.cap ? loaded.lentThisMonth / loaded.cap : 0;
  const capPercent = Math.round(capRatio * 100);
  const capTint = { green: '#059669', orange: '#f97316', red: '#dc2626' }[
    toneForUsedRatio(capRatio)
  ];

  const counts = useMemo(() => {
    const all = loaded.loans ?? [];
    return Object.fromEntries(
      loanFilters.map((item) => [item.key, filterLoans(all, item.key).length]),
    ) as Record<LoanFilter, number>;
  }, [loaded.loans]);

  return (
    <PageLayout title="Loans" subtitle="Money you lent to friends and family" loading={loading}>
      {failure ? <Banner tone="error">{failure}</Banner> : null}

      <View className="rounded-3xl bg-emerald-700 p-5">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
          Owed to you
        </Text>
        <Text className="mt-1 text-4xl font-extrabold text-white">{formatXAF(loaded.owed)}</Text>
        <View className="mt-4 h-2.5 overflow-hidden rounded-full bg-emerald-900/40">
          <View className="h-full rounded-full bg-white" style={{ width: `${stats.percent}%` }} />
        </View>
        <Text className="mt-1 text-xs text-emerald-100">{stats.percent}% of lent money repaid</Text>
        <View className="mt-4 flex-row gap-3">
          <HeroStat icon="arrow-up-circle" label="Lent" value={formatXAF(stats.lent)} />
          <HeroStat icon="arrow-down-circle" label="Repaid" value={formatXAF(stats.repaid)} />
          <HeroStat
            icon="alert-circle"
            label="Overdue"
            value={String(stats.overdue)}
            warn={stats.overdue > 0}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Monthly lending cap"
        onPress={() => router.push('/lending-cap')}
        className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Ionicons name="speedometer" size={18} className="text-slate-900 dark:text-slate-100" />
            <Text className="ml-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              Monthly lending cap
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
        </View>
        {loaded.cap === null ? (
          <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            No cap set. Tap to limit how much you lend each month.
          </Text>
        ) : (
          <>
            <View className="mt-3 flex-row items-end justify-between">
              <Text className="text-2xl font-extrabold" style={{ color: capTint }}>
                {capPercent}%
              </Text>
              <Text className="text-sm text-slate-600 dark:text-slate-300">
                {formatXAF(loaded.lentThisMonth)} of {formatXAF(loaded.cap)}
              </Text>
            </View>
            <View className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <View
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, capPercent)}%`, backgroundColor: capTint }}
              />
            </View>
            <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {loaded.lentThisMonth > loaded.cap
                ? `${formatXAF(loaded.lentThisMonth - loaded.cap)} over this month's cap`
                : `${formatXAF(loaded.cap - loaded.lentThisMonth)} left to lend this month`}
            </Text>
          </>
        )}
      </Pressable>

      <View className="mt-4 flex-row gap-3">
        <ActionTile
          icon="add-circle"
          label="Add loan"
          primary
          onPress={() => router.push('/loan-form')}
        />
      </View>

      {people.length > 0 ? (
        <View className="mt-6">
          <Text className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">
            People
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-3 pr-2">
              {people.map((person) => (
                <View
                  key={person.key}
                  className="w-40 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
                >
                  <View className="flex-row items-center">
                    <Avatar name={person.personName} size={36} />
                    <Text
                      numberOfLines={1}
                      className="ml-2 flex-1 text-sm font-bold text-slate-900 dark:text-slate-100"
                    >
                      {person.personName}
                    </Text>
                  </View>
                  <Text className="mt-3 text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    {formatXAF(person.outstanding)}
                  </Text>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {person.loanCount} {person.loanCount === 1 ? 'loan' : 'loans'}
                    {person.overdueCount > 0 ? ` · ${person.overdueCount} overdue` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <Text className="mb-3 mt-6 text-base font-bold text-slate-900 dark:text-slate-100">
        Loans
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {loanFilters.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(item.key)}
                className={`min-h-10 flex-row items-center rounded-full px-4 ${
                  active
                    ? 'bg-slate-900 dark:bg-slate-800'
                    : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}
                >
                  {item.label} {counts[item.key]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="mt-4 gap-3">
        {loaded.loans && visible.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-8">
            <Ionicons name="people-circle" size={44} color="#94a3b8" />
            <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {loaded.loans.length === 0 ? 'No loans recorded yet.' : 'No loans match this filter.'}
            </Text>
          </View>
        ) : null}
        {visible.map((loan) => {
          const look = statusLook[loan.status];
          return (
            <Pressable
              key={loan.id}
              accessibilityRole="button"
              accessibilityLabel={`Open loan to ${loan.personName}`}
              onPress={() => router.push({ pathname: '/loan', params: { id: loan.id } })}
              className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <View className={`h-1.5 ${look.bar}`} />
              <View className="p-4">
                <View className="flex-row items-center">
                  <Avatar name={loan.personName} size={44} />
                  <View className="ml-3 flex-1">
                    <Text
                      numberOfLines={1}
                      className="text-base font-bold text-slate-900 dark:text-slate-100"
                    >
                      {loan.personName}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      Lent {loan.lentOn}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                      {formatXAF(loan.balance)}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      of {formatXAF(loan.amount)}
                    </Text>
                  </View>
                </View>
                <View className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <View
                    className={`h-full rounded-full ${look.bar}`}
                    style={{ width: `${loan.percentPaid}%` }}
                  />
                </View>
                <View className="mt-3 flex-row items-center justify-between">
                  <View className={`flex-row items-center rounded-full px-2.5 py-1 ${look.pill}`}>
                    <Ionicons name={look.icon} size={13} color={look.tint} />
                    <Text className="ml-1 text-xs font-bold" style={{ color: look.tint }}>
                      {loanStatusLabel[loan.status]}
                    </Text>
                  </View>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {loan.percentPaid}% repaid
                  </Text>
                </View>
                <Text
                  className={`mt-2 text-sm font-semibold ${
                    loan.status === 'OVERDUE'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {loanDueText(loan)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </PageLayout>
  );
}

const statusLook: Record<
  LoanStatus,
  { bar: string; pill: string; tint: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  PENDING: {
    bar: 'bg-slate-400',
    pill: 'bg-slate-100 dark:bg-slate-800',
    tint: '#475569',
    icon: 'time',
  },
  PARTIAL: {
    bar: 'bg-amber-500',
    pill: 'bg-amber-100 dark:bg-amber-900/40',
    tint: '#b45309',
    icon: 'hourglass',
  },
  OVERDUE: {
    bar: 'bg-red-500',
    pill: 'bg-red-100 dark:bg-red-900/40',
    tint: '#b91c1c',
    icon: 'alert-circle',
  },
  COMPLETE: {
    bar: 'bg-emerald-500',
    pill: 'bg-emerald-100 dark:bg-emerald-900/40',
    tint: '#047857',
    icon: 'checkmark-circle',
  },
  WRITTEN_OFF: {
    bar: 'bg-slate-300',
    pill: 'bg-slate-100 dark:bg-slate-800',
    tint: '#64748b',
    icon: 'close-circle',
  },
};

const avatarColors = ['#059669', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#ca8a04'];

function Avatar({ name, size }: { name: string; size: number }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: avatarColors[hash % avatarColors.length],
      }}
    >
      <Text className="font-bold text-white" style={{ fontSize: size * 0.38 }}>
        {letters || '?'}
      </Text>
    </View>
  );
}

function HeroStat({
  icon,
  label,
  value,
  warn = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <View className="flex-1 rounded-2xl bg-white/15 p-3">
      <Ionicons name={icon} size={18} color={warn ? '#fecaca' : '#d1fae5'} />
      <Text className="mt-1 text-[11px] text-emerald-100">{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit className="text-sm font-bold text-white">
        {value}
      </Text>
    </View>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
  primary = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-14 flex-1 flex-row items-center justify-center rounded-2xl px-3 ${
        primary
          ? 'bg-slate-900 dark:bg-slate-800'
          : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
      }`}
    >
      <Ionicons name={icon} size={22} color={primary ? '#ffffff' : '#0f172a'} />
      <Text
        className={`ml-2 text-base font-bold ${primary ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
