import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/src/auth/AuthProvider';
import { getDisplayLabel } from '@/src/auth/profile';
import { needsOnboarding } from '@/src/data/bootstrap';
import { getHomeDashboardSnapshot } from '@/src/data/dashboard';
import { openAppDatabase, type DatabaseLike } from '@/src/data/db';
import { previousMonth } from '@/src/data/plan';
import { getSavingsPlanner, type SavingsPlanner } from '@/src/data/savings';
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { buildInsights, topSpending } from '@/src/domain/spendingInsights';
import { assignLineIcons } from '@/src/ui/lineIcons';
import {
  dismissBatteryOptimizationOnboarding,
  shouldShowBatteryOptimizationOnboarding,
} from '@/src/notifications/battery-optimization';
import { PageLayout } from '@/src/ui/PageLayout';
import { ProfileAvatarButton } from '@/src/ui/ProfileAvatarButton';
import { formatXAF } from '@/src/ui/theme';

function currentMonthKey(): string {
  return monthKeyForDate(effectiveNow(), 'Africa/Douala');
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const firstName = getDisplayLabel(session?.user).split(/\s+/)[0];
  const [dashboard, setDashboard] = useState<ReturnType<typeof getHomeDashboardSnapshot> | null>(
    null,
  );
  const [extras, setExtras] = useState<{
    previous: ReturnType<typeof getHomeDashboardSnapshot>['lines'];
    savings: SavingsPlanner | null;
  }>({ previous: [], savings: null });
  const [batteryOnboarding, setBatteryOnboarding] = useState<{
    database: DatabaseLike;
    householdId: string;
  } | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadDashboard = async () => {
        const requestRevision = retry;
        try {
          const database = await openAppDatabase();
          const household = database
            .prepare?.(
              'SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;',
            )
            .get();
          if (!household || typeof household.id !== 'string') {
            throw new Error('The local household has not been initialized.');
          }
          if (needsOnboarding(database, household.id)) {
            if (active) setOnboarding(true);
            return;
          }
          const snapshot = getHomeDashboardSnapshot(database, household.id, currentMonthKey());
          let previous: ReturnType<typeof getHomeDashboardSnapshot>['lines'] = [];
          let savings: SavingsPlanner | null = null;
          try {
            previous = getHomeDashboardSnapshot(
              database,
              household.id,
              previousMonth(currentMonthKey()),
            ).lines;
            savings = getSavingsPlanner(
              database,
              household.id,
              Number(currentMonthKey().slice(0, 4)),
              currentMonthKey(),
            );
          } catch {
            // The extra dashboards are optional; the core dashboard still loads.
          }
          if (active && requestRevision === retry) {
            setExtras({ previous, savings });
            setDashboard(snapshot);
            setBatteryOnboarding(
              shouldShowBatteryOptimizationOnboarding(database, household.id, Platform.OS)
                ? { database, householdId: household.id }
                : null,
            );
            setOnboarding(false);
            setError(null);
          }
        } catch (cause) {
          if (active && requestRevision === retry) {
            setError(cause instanceof Error ? cause.message : 'Unable to load your dashboard.');
          }
        }
      };

      void loadDashboard();
      return () => {
        active = false;
      };
    }, [retry]),
  );

  const insightData = useMemo(() => {
    if (!dashboard) return null;
    const lines = dashboard.lines;
    const spendable = lines.filter((line) => line.kind !== 'savings');
    const goals = extras.savings?.goals ?? [];
    const planned = goals.reduce((n, goal) => n + goal.planned, 0);
    const shortfall = Math.max(0, (extras.savings?.totalTarget ?? 0) - planned);
    return {
      top: topSpending(
        spendable,
        extras.previous.filter((line) => line.kind !== 'savings'),
      ),
      insights: buildInsights(lines, extras.previous, {
        behind: dashboard.summary.savingsStatus === 'Behind',
        shortfall,
      }),
      icons: assignLineIcons(lines),
      totalSpent: spendable.reduce((n, line) => n + line.spent, 0),
    };
  }, [dashboard, extras]);

  if (onboarding) return <Redirect href="/onboarding" />;

  if (error) {
    return (
      <PageLayout title="Home" subtitle="Your household dashboard">
        <View className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <Text className="font-semibold text-red-800">{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetry((current) => current + 1)}
            className="mt-4 min-h-12 self-start rounded-xl bg-red-700 px-4 py-3"
          >
            <Text className="font-bold text-white">Retry</Text>
          </Pressable>
        </View>
      </PageLayout>
    );
  }

  if (!dashboard) {
    return (
      <PageLayout title="Home" subtitle="Your household dashboard">
        <Text className="text-sm text-slate-600">Loading your budget…</Text>
      </PageLayout>
    );
  }

  const budgetLines = dashboard.lines;
  const summary = dashboard.summary;
  const spentRatio = dashboard.totalPlanned > 0 ? summary.spent / dashboard.totalPlanned : 0;
  const dayRatio = summary.monthLength > 0 ? summary.daysElapsed / summary.monthLength : 0;
  const attention = budgetLines
    .filter((line) => line.kind !== 'savings' && (line.remaining < 0 || line.percentUsed >= 80))
    .sort((a, b) => a.remaining - b.remaining);

  const dismissBatteryOnboarding = () => {
    if (!batteryOnboarding) return;
    try {
      dismissBatteryOptimizationOnboarding(
        batteryOnboarding.database,
        batteryOnboarding.householdId,
      );
      setBatteryOnboarding(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save the notification battery guidance preference.',
      );
    }
  };

  return (
    <PageLayout
      title={`${greetingFor(new Date().getHours())}, ${firstName}`}
      subtitle={summary.label}
      action={
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add transaction"
            onPress={() => router.push('/add-transaction')}
            className="h-12 w-12 items-center justify-center rounded-full bg-slate-900"
          >
            <Ionicons name="add" size={26} color="#ffffff" />
          </Pressable>
          <ProfileAvatarButton size={48} />
        </View>
      }
    >
      {batteryOnboarding ? (
        <View className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <Text className="text-lg font-bold text-amber-900">Keep reminders reliable</Text>
          <Text className="mt-2 text-sm text-amber-800">
            Android may pause reminders to save battery. Allow background activity or set Pocket
            Guard&apos;s battery use to Unrestricted in app settings.
          </Text>
          <View className="mt-4 flex-row gap-3">
            <Link href="/settings" className="flex-1 rounded-xl border border-amber-300 px-4 py-3">
              <Text className="text-center font-bold text-amber-900">Notification settings</Text>
            </Link>
            <Pressable
              accessibilityRole="button"
              onPress={dismissBatteryOnboarding}
              className="rounded-xl bg-amber-200 px-4 py-3"
            >
              <Text className="font-bold text-amber-900">Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Budget hero: spending is indigo */}
      <View className="mb-4 rounded-3xl bg-indigo-600 p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold uppercase tracking-widest text-indigo-200">
            Spent this month
          </Text>
          <Text className="text-xs font-semibold text-indigo-200">
            {summary.daysLeft} days left
          </Text>
        </View>
        <Text className="mt-1 text-3xl font-extrabold text-white">{formatXAF(summary.spent)}</Text>
        <Text className="text-sm text-indigo-200">
          of {formatXAF(dashboard.totalPlanned)} planned
        </Text>
        <View className="mt-3 h-2.5 overflow-hidden rounded-full bg-indigo-900/40">
          <View
            className={`h-full rounded-full ${spentRatio > 1 ? 'bg-red-300' : 'bg-white'}`}
            style={{ width: `${Math.min(100, Math.round(spentRatio * 100))}%` }}
          />
          <View
            className="absolute top-0 h-full w-0.5 bg-indigo-200"
            style={{ left: `${Math.min(100, Math.round(dayRatio * 100))}%` }}
          />
        </View>
        <Text className="mt-2 text-xs text-indigo-200">
          {spentRatio > dayRatio + 0.05
            ? 'Spending faster than the month is passing.'
            : 'Spending is within the pace of the month.'}
        </Text>
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1 rounded-2xl bg-white/15 p-3">
            <Text className="text-[11px] font-semibold text-indigo-100">INCOME</Text>
            <Text className="mt-1 text-sm font-bold text-white">{formatXAF(summary.income)}</Text>
          </View>
          <View className="flex-1 rounded-2xl bg-white/15 p-3">
            <Text className="text-[11px] font-semibold text-indigo-100">CASH FLOW</Text>
            <Text
              className={`mt-1 text-sm font-bold ${summary.remaining < 0 ? 'text-red-200' : 'text-white'}`}
            >
              {formatXAF(summary.remaining)}
            </Text>
          </View>
        </View>
      </View>

      {/* Voice: one compact strip */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start voice entry"
        onPress={() => router.push({ pathname: '/voice', params: { autostart: '1' } })}
        className="mb-4 flex-row items-center gap-3 rounded-2xl bg-slate-900 p-3 pl-4"
      >
        <View className="flex-1">
          <Text className="text-base font-bold text-white">Just say it</Text>
          <Text className="text-xs text-slate-300">
            “Spent 20,000 on fuel” — review before saving
          </Text>
        </View>
        <View className="h-12 w-12 items-center justify-center rounded-full bg-emerald-500">
          <Ionicons name="mic" size={24} color="#fff" />
        </View>
      </Pressable>

      {/* Savings is green */}
      {extras.savings ? (
        <View className="mb-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-emerald-600">
                <Ionicons name="wallet" size={16} color="#fff" />
              </View>
              <Text className="text-base font-bold text-emerald-900">Savings & goals</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open the savings screen"
              onPress={() => router.push('/savings')}
              className="flex-row items-center"
              hitSlop={8}
            >
              <Text className="text-sm font-bold text-emerald-700">Open</Text>
              <Ionicons name="chevron-forward" size={16} color="#047857" />
            </Pressable>
          </View>
          {extras.savings.goals.length === 0 ? (
            <View className="mt-3">
              <Text className="text-sm text-emerald-800">
                No goals yet. Set a target and a monthly amount to start.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/savings-form')}
                className="mt-3 min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5"
              >
                <Text className="font-bold text-white">Add a savings goal</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="mt-3 flex-row items-end justify-between">
                <Text className="text-2xl font-extrabold text-emerald-900">
                  {formatXAF(extras.savings.totalSaved)}
                </Text>
                <Text className="text-xs font-semibold text-emerald-700">
                  of {formatXAF(extras.savings.totalTarget)} ·{' '}
                  {extras.savings.totalTarget > 0
                    ? Math.min(
                        100,
                        Math.round((extras.savings.totalSaved / extras.savings.totalTarget) * 100),
                      )
                    : 0}
                  %
                </Text>
              </View>
              {extras.savings.goals.slice(0, 2).map((goal) => {
                const progress =
                  goal.target > 0 ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0;
                const behind = goal.overdueMonths.length > 0;
                return (
                  <Pressable
                    key={goal.id}
                    accessibilityRole="button"
                    onPress={() => router.push('/savings')}
                    className="mt-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text
                        numberOfLines={1}
                        className="flex-1 text-sm font-semibold text-emerald-900"
                      >
                        {goal.name}
                      </Text>
                      <Text
                        className={`text-xs font-bold ${behind ? 'text-red-700' : 'text-emerald-700'}`}
                      >
                        {behind ? 'Behind · ' : ''}
                        {progress}%
                      </Text>
                    </View>
                    <View className="mt-1 h-2 overflow-hidden rounded-full bg-emerald-200">
                      <View
                        className={`h-full rounded-full ${behind ? 'bg-red-500' : 'bg-emerald-600'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </View>
                  </Pressable>
                );
              })}
              {extras.savings.goals.length > 2 ? (
                <Text className="mt-3 text-xs text-emerald-700">
                  +{extras.savings.goals.length - 2} more goals
                </Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {/* Debt is amber */}
      {summary.debtRemaining > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/debts')}
          className="mb-4 flex-row items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-amber-500">
            <Ionicons name="card" size={18} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-semibold uppercase text-amber-700">You owe</Text>
            <Text className="text-lg font-extrabold text-amber-900">
              {formatXAF(summary.debtRemaining)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#b45309" />
        </Pressable>
      ) : null}

      {insightData && insightData.top.length > 0 ? (
        <View className="mb-4 rounded-3xl border border-indigo-100 bg-white p-5">
          <Text className="text-base font-bold text-slate-900">Where your money goes</Text>
          {insightData.top.slice(0, 3).map((item) => {
            const icon = insightData.icons.get(item.id);
            const rising = item.change !== null && item.change > 0.05;
            const falling = item.change !== null && item.change < -0.05;
            return (
              <View key={item.id} className="mt-4">
                <View className="flex-row items-center gap-3">
                  <View
                    className="h-9 w-9 items-center justify-center rounded-xl"
                    style={{ backgroundColor: icon?.bg ?? '#eef2ff' }}
                  >
                    <Ionicons
                      name={icon?.icon ?? 'ellipse'}
                      size={18}
                      color={icon?.tint ?? '#4f46e5'}
                    />
                  </View>
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-sm font-bold text-slate-900">
                      {item.name}
                    </Text>
                    <Text className="text-xs text-slate-500">
                      {Math.round(item.share * 100)}% of spending
                      {item.change !== null && (rising || falling)
                        ? ` · ${rising ? '▲' : '▼'} ${Math.abs(Math.round(item.change * 100))}%`
                        : ''}
                    </Text>
                  </View>
                  <Text className="text-sm font-extrabold text-slate-900">
                    {formatXAF(item.spent)}
                  </Text>
                </View>
                <View className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-50">
                  <View
                    className={`h-full rounded-full ${
                      item.usedRatio > 0.8
                        ? 'bg-red-500'
                        : item.usedRatio >= 0.4
                          ? 'bg-orange-400'
                          : 'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.round(item.share * 100))}%` }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {insightData ? (
        <View className="mb-4 rounded-3xl border border-slate-200 bg-white p-5">
          <View className="flex-row items-center gap-2">
            <Ionicons name="bulb" size={18} color="#d97706" />
            <Text className="text-base font-bold text-slate-900">Where to focus</Text>
          </View>
          {insightData.insights.slice(0, 2).map((insight) => {
            const color =
              insight.tone === 'danger'
                ? 'bg-red-500'
                : insight.tone === 'warning'
                  ? 'bg-amber-500'
                  : insight.tone === 'success'
                    ? 'bg-emerald-500'
                    : 'bg-indigo-500';
            return (
              <View key={insight.title} className="mt-3 flex-row gap-3">
                <View className={`mt-1.5 h-2.5 w-2.5 rounded-full ${color}`} />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-slate-900">{insight.title}</Text>
                  <Text className="mt-0.5 text-xs text-slate-500">{insight.detail}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {attention.length > 0 ? (
        <View className="mb-4 rounded-3xl border border-red-100 bg-red-50 p-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-red-900">Needs attention</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/budget')}
              hitSlop={8}
            >
              <Text className="text-sm font-bold text-red-700">Budget plan</Text>
            </Pressable>
          </View>
          {attention.slice(0, 3).map((line) => (
            <View key={line.id} className="mt-3 flex-row items-center justify-between">
              <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-slate-900">
                {line.name}
              </Text>
              <Text className="text-sm font-bold text-red-700">
                {line.remaining < 0
                  ? `${formatXAF(-line.remaining)} over`
                  : `${Math.round(line.percentUsed)}% used`}
              </Text>
            </View>
          ))}
          {attention.length > 3 ? (
            <Text className="mt-3 text-xs text-red-700">+{attention.length - 3} more lines</Text>
          ) : null}
        </View>
      ) : (
        <View className="mb-4 flex-row items-center gap-3 rounded-2xl bg-emerald-50 p-4">
          <Ionicons name="checkmark-circle" size={22} color="#059669" />
          <Text className="flex-1 text-sm font-semibold text-emerald-800">
            Every budget line is on plan.
          </Text>
        </View>
      )}

      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/can-i-spend')}
          className="min-h-12 flex-1 items-center justify-center rounded-2xl bg-slate-900 px-4 py-3"
        >
          <Text className="text-base font-bold text-white">Can I spend?</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/add-transaction')}
          className="min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3"
        >
          <Text className="text-base font-bold text-slate-900">Add manually</Text>
        </Pressable>
      </View>
    </PageLayout>
  );
}
