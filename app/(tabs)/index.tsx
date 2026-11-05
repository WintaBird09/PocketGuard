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
import { getFinanceFacts } from '@/src/data/homeFacts';
import { totalOwedToYou } from '@/src/data/loans';
import { getSavingsPlanner, type SavingsPlanner } from '@/src/data/savings';
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { buildFinanceInsights } from '@/src/domain/financeInsights';
import type { FinanceFacts } from '@/src/domain/financeInsights';
import { useCurrency } from '@/src/ui/CurrencyProvider';
import { HomeCarousel } from '@/src/ui/HomeCarousel';
import { InsightCards } from '@/src/ui/InsightCards';
import {
  dismissBatteryOptimizationOnboarding,
  shouldShowBatteryOptimizationOnboarding,
} from '@/src/notifications/battery-optimization';
import { AddMenu } from '@/src/ui/AddMenu';
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
  useCurrency();
  const router = useRouter();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const { session } = useAuth();
  const firstName = getDisplayLabel(session?.user).split(/\s+/)[0];
  const [dashboard, setDashboard] = useState<ReturnType<typeof getHomeDashboardSnapshot> | null>(
    null,
  );
  const [extras, setExtras] = useState<{
    previous: ReturnType<typeof getHomeDashboardSnapshot>['lines'];
    savings: SavingsPlanner | null;
    owedToYou: number;
    facts: FinanceFacts | null;
  }>({ previous: [], savings: null, owedToYou: 0, facts: null });
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
          let owedToYou = 0;
          let facts: FinanceFacts | null = null;
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
            owedToYou = totalOwedToYou(database, household.id);
            facts = getFinanceFacts(
              database,
              household.id,
              currentMonthKey(),
              snapshot,
              previous,
              savings,
              effectiveNow(),
            );
          } catch {
            // The extra dashboards are optional; the core dashboard still loads.
          }
          if (active && requestRevision === retry) {
            setExtras({ previous, savings, owedToYou, facts });
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

  const insightData = useMemo(
    () => (extras.facts ? { insights: buildFinanceInsights(extras.facts) } : null),
    [extras.facts],
  );

  if (onboarding) return <Redirect href="/onboarding" />;

  if (error) {
    return (
      <PageLayout title="Home" subtitle="Your household dashboard">
        <View className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 p-5">
          <Text className="font-semibold text-red-800 dark:text-red-300">{error}</Text>
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
        <Text className="text-sm text-slate-600 dark:text-slate-300">Loading your budget…</Text>
      </PageLayout>
    );
  }

  const budgetLines = dashboard.lines;
  const summary = dashboard.summary;
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
      compact
      smallTitle
      subtitle={summary.label}
      action={
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start voice entry"
            onPress={() => router.push({ pathname: '/voice', params: { autostart: '1' } })}
            className="h-11 w-11 items-center justify-center rounded-full bg-emerald-500"
          >
            <Ionicons name="mic" size={22} color="#ffffff" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add"
            accessibilityHint="Choose to add a transaction, income, budget or savings"
            onPress={() => setAddMenuOpen(true)}
            className="h-11 w-11 items-center justify-center rounded-full bg-slate-900 dark:bg-slate-800"
          >
            <Ionicons name="add" size={26} color="#ffffff" />
          </Pressable>
          <ProfileAvatarButton size={44} />
        </View>
      }
    >
      <AddMenu visible={addMenuOpen} onClose={() => setAddMenuOpen(false)} />
      {batteryOnboarding ? (
        <View className="mb-5 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-5">
          <Text className="text-lg font-bold text-amber-900 dark:text-amber-200">
            Keep reminders reliable
          </Text>
          <Text className="mt-2 text-sm text-amber-800 dark:text-amber-300">
            Android may pause reminders to save battery. Allow background activity or set Pocket
            Guard&apos;s battery use to Unrestricted in app settings.
          </Text>
          <View className="mt-4 flex-row gap-3">
            <Link
              href="/settings"
              className="flex-1 rounded-xl border border-amber-300 dark:border-amber-700 px-4 py-3"
            >
              <Text className="text-center font-bold text-amber-900 dark:text-amber-200">
                Notification settings
              </Text>
            </Link>
            <Pressable
              accessibilityRole="button"
              onPress={dismissBatteryOnboarding}
              className="rounded-xl bg-amber-200 px-4 py-3"
            >
              <Text className="font-bold text-amber-900 dark:text-amber-200">Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <HomeCarousel
        dashboard={dashboard}
        savings={extras.savings}
        month={currentMonthKey()}
        owedToYou={extras.owedToYou}
        expectedIncome={extras.facts?.expectedIncome ?? 0}
      />

      {insightData ? <InsightCards insights={insightData.insights} /> : null}

      {attention.length > 0 ? (
        <View className="mb-4 rounded-3xl border border-red-100 bg-red-50 dark:bg-red-900/30 p-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-red-900 dark:text-red-200">
              Needs attention
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/budget')}
              hitSlop={8}
            >
              <Text className="text-sm font-bold text-red-700 dark:text-red-400">Budget plan</Text>
            </Pressable>
          </View>
          {attention.slice(0, 3).map((line) => (
            <View key={line.id} className="mt-3 flex-row items-center justify-between">
              <Text
                numberOfLines={1}
                className="flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                {line.name}
              </Text>
              <Text className="text-sm font-bold text-red-700 dark:text-red-400">
                {line.remaining < 0
                  ? `${formatXAF(-line.remaining)} over`
                  : `${Math.round(line.percentUsed)}% used`}
              </Text>
            </View>
          ))}
          {attention.length > 3 ? (
            <Text className="mt-3 text-xs text-red-700 dark:text-red-400">
              +{attention.length - 3} more lines
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="mb-4 flex-row items-center gap-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 p-4">
          <Ionicons name="checkmark-circle" size={22} color="#059669" />
          <Text className="flex-1 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Every budget line is on plan.
          </Text>
        </View>
      )}

      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/can-i-spend')}
          className="min-h-12 flex-1 items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-800 px-4 py-3"
        >
          <Text className="text-base font-bold text-white">Can I spend?</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/add-transaction')}
          className="min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3"
        >
          <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
            Add manually
          </Text>
        </Pressable>
      </View>
    </PageLayout>
  );
}
