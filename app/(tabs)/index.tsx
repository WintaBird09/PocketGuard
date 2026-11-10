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
import { getIncomeMonth } from '@/src/data/income';
import { listActivity } from '@/src/data/activity';
import type { ActivityItem } from '@/src/data/activity';
import type { IncomeMonth } from '@/src/data/income';
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
import {
  HomeBudgetPreview,
  HomeIncomePreview,
  HomeQuickActions,
  HomeRecentPreview,
} from '@/src/ui/HomeSections';

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
  const [incomeMonth, setIncomeMonth] = useState<IncomeMonth | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [showAllInsights, setShowAllInsights] = useState(false);
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
          const householdId = household.id;
          if (needsOnboarding(database, householdId)) {
            if (active) setOnboarding(true);
            return;
          }
          const month = currentMonthKey();
          const snapshot = getHomeDashboardSnapshot(database, householdId, month);
          const monthlyIncome = getIncomeMonth(database, householdId, month);
          const recentMonths = [month, previousMonth(month), previousMonth(previousMonth(month))];
          const activity = recentMonths
            .flatMap((activityMonth) =>
              listActivity(database, householdId, { month: activityMonth }),
            )
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .slice(0, 5);
          let previous: ReturnType<typeof getHomeDashboardSnapshot>['lines'] = [];
          let savings: SavingsPlanner | null = null;
          let owedToYou = 0;
          let facts: FinanceFacts | null = null;
          try {
            previous = getHomeDashboardSnapshot(database, householdId, previousMonth(month)).lines;
            savings = getSavingsPlanner(database, householdId, Number(month.slice(0, 4)), month);
            owedToYou = totalOwedToYou(database, householdId);
            facts = getFinanceFacts(
              database,
              householdId,
              month,
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
            setIncomeMonth(monthlyIncome);
            setRecentActivity(activity);
            setDashboard(snapshot);
            setBatteryOnboarding(
              shouldShowBatteryOptimizationOnboarding(database, householdId, Platform.OS)
                ? { database, householdId }
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

  const summary = dashboard.summary;

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
      <HomeQuickActions
        actions={[
          {
            label: 'Expense',
            icon: 'arrow-up-outline',
            onPress: () => router.push('/add-transaction'),
          },
          {
            label: 'Income',
            icon: 'arrow-down-outline',
            onPress: () => router.push('/income'),
          },
          {
            label: 'Voice',
            icon: 'mic-outline',
            onPress: () => router.push({ pathname: '/voice', params: { autostart: '1' } }),
          },
          {
            label: 'Insights',
            icon: 'sparkles-outline',
            emphasized: true,
            onPress: () => setShowAllInsights(true),
          },
        ]}
      />
      <HomeRecentPreview activity={recentActivity} onOpen={() => router.push('/transactions')} />

      {insightData ? (
        <InsightCards
          insights={insightData.insights}
          showAll={showAllInsights}
          onShowAllChange={setShowAllInsights}
        />
      ) : null}

      <View className="mb-5 rounded-3xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/can-i-spend')}
          className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 dark:bg-slate-900"
        >
          <Ionicons name="sparkles-outline" size={18} color="#0f766e" />
          <Text className="font-semibold text-slate-900 dark:text-slate-100">
            Ask about a money or business decision
          </Text>
        </Pressable>
        <Text className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Based on your own records. Not financial advice.
        </Text>
      </View>
      <HomeBudgetPreview dashboard={dashboard} onOpen={() => router.push('/budget')} />
      {incomeMonth ? (
        <HomeIncomePreview income={incomeMonth} onOpen={() => router.push('/income')} />
      ) : null}
    </PageLayout>
  );
}
