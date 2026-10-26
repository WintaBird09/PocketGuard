import { Link, Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { needsOnboarding } from '@/src/data/bootstrap';
import { getHomeDashboardSnapshot } from '@/src/data/dashboard';
import { openAppDatabase, type DatabaseLike } from '@/src/data/db';
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import {
  dismissBatteryOptimizationOnboarding,
  shouldShowBatteryOptimizationOnboarding,
} from '@/src/notifications/battery-optimization';
import { BudgetRow, MetricCard, SectionCard } from '@/src/ui/epic3';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

function currentMonthKey(): string {
  return monthKeyForDate(effectiveNow(), 'Africa/Douala');
}

export default function HomeScreen() {
  const [dashboard, setDashboard] = useState<ReturnType<typeof getHomeDashboardSnapshot> | null>(
    null,
  );
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
          if (active && requestRevision === retry) {
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
  const linesOverPlan = budgetLines.filter((line) => line.remaining < 0).length;
  const statusTone = linesOverPlan > 0 || summary.savingsStatus === 'Behind' ? 'amber' : 'emerald';

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
      title="Home"
      subtitle={summary.label}
      action={
        <View className="flex-row items-center gap-3">
          <Link
            href="/add-transaction"
            className="h-14 min-w-[110px] items-center justify-center rounded-2xl bg-emerald-600 px-4 shadow-sm"
          >
            <Text className="text-base font-bold text-white">+ Add</Text>
          </Link>
          <Link
            href="/voice"
            className="h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <Text className="text-2xl">🎤</Text>
          </Link>
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

      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <View className="flex-row justify-between">
          <Text className="text-sm font-semibold text-slate-900">
            Day {summary.daysElapsed} of {summary.monthLength}
          </Text>
          <Text className="text-sm text-slate-600">{summary.daysLeft} days left</Text>
        </View>
        <View className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <View
            className="h-full rounded-full bg-slate-900"
            style={{
              width: `${Math.min(100, (summary.daysElapsed / summary.monthLength) * 100)}%`,
            }}
          />
        </View>
      </View>

      <View className="mb-5 flex-row gap-3">
        <MetricCard label="Income" value={formatXAF(summary.income)} helper="recorded this month" />
        <MetricCard
          label="Spent"
          value={formatXAF(summary.spent)}
          helper={`of ${formatXAF(dashboard.totalPlanned)} planned`}
          tone="warning"
        />
      </View>

      <View className="mb-5 flex-row gap-3">
        <MetricCard
          label="Cash flow"
          value={formatXAF(summary.remaining)}
          helper="income − expenses"
          tone={summary.remaining < 0 ? 'danger' : 'success'}
        />
        <MetricCard
          label="Debt"
          value={formatXAF(summary.debtRemaining)}
          helper="remaining"
          tone="danger"
        />
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-slate-900">Savings goal</Text>
          <Text
            className={`text-xs font-bold ${
              summary.savingsStatus === 'Behind' ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {summary.savingsStatus === 'Behind' ? 'BEHIND' : 'ON TRACK'}
          </Text>
        </View>
        <View className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
          <View
            className={`h-full rounded-full ${
              summary.savingsStatus === 'Behind' ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{
              width: `${Math.min(100, summary.savingsTarget > 0 ? (summary.savingsSaved / summary.savingsTarget) * 100 : 0)}%`,
            }}
          />
        </View>
        <Text className="mt-2 text-xs text-slate-600">
          {formatXAF(summary.savingsSaved)} of {formatXAF(summary.savingsTarget)} saved
        </Text>
      </View>

      <SectionCard title="Budget status">
        <View
          className={`mb-4 rounded-2xl p-3 ${
            statusTone === 'amber' ? 'bg-amber-50' : 'bg-emerald-50'
          }`}
        >
          <Text
            className={`text-sm font-semibold ${statusTone === 'amber' ? 'text-amber-800' : 'text-emerald-800'}`}
          >
            {statusTone === 'amber' ? 'BEHIND' : 'ON TRACK'}
          </Text>
          <Text
            className={`mt-1 text-sm ${statusTone === 'amber' ? 'text-amber-700' : 'text-emerald-700'}`}
          >
            {linesOverPlan > 0
              ? `${linesOverPlan} budget line${linesOverPlan === 1 ? '' : 's'} over plan.`
              : summary.savingsStatus === 'Behind'
                ? 'Savings are behind the plan.'
                : 'No lines over plan and savings are on plan.'}
          </Text>
        </View>

        {budgetLines.length === 0 ? (
          <Text className="text-sm text-slate-600">
            No budget lines yet. Set up your plan in the Budget tab.
          </Text>
        ) : null}
        {budgetLines.map((item) => (
          <BudgetRow
            key={item.id}
            name={item.name}
            planned={item.planned}
            spent={item.spent}
            remaining={item.remaining}
            status={item.status}
            percentUsed={item.percentUsed}
            daysLeft={summary.daysLeft}
            projected={item.projected}
          />
        ))}
      </SectionCard>

      <View className="mt-5 flex-row gap-3">
        <Link href="/can-i-spend" className="flex-1 rounded-2xl bg-slate-900 px-4 py-3">
          <Text className="text-center text-base font-bold text-white">Can I spend?</Text>
        </Link>
        <Link
          href="/voice"
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
        >
          <Text className="text-center text-base font-bold text-slate-900">Voice entry</Text>
        </Link>
      </View>
    </PageLayout>
  );
}
