import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';

import {
  buildAllocationsCsv,
  buildBudgetLinesCsv,
  buildLoansCsv,
  buildTransactionsCsv,
} from '@/src/data/activity';
import { loadSeedPlan } from '@/src/data/bootstrap';
import { openAppDatabase } from '@/src/data/db';
import { shareCsv } from '@/src/data/exportCsv';
import { getActiveHouseholdId } from '@/src/data/household';
import { settings } from '@/src/data/repos';
import {
  getPersistedPaceAlertMargin,
  getPersistedSavingsReminderDays,
  parseSavingsReminderDays,
  paceAlertMarginKey,
  savingsReminderDaysKey,
} from '@/src/notifications/persisted-alerts';
import {
  dailySummarySettingKey,
  defaultDailySummaryTime,
  getPersistedDailySummaryTime,
} from '@/src/notifications/daily-summary';
import {
  getExactAlarmPermission,
  getNotificationPermission,
  requestExactAlarmPermission,
  requestNotificationPermission,
  scheduleTestNotification,
  type NotificationPermissionState,
} from '@/src/notifications/permissions';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { parseDailySummaryTime } from '@/src/notifications/scheduler';
import { useAppLock } from '@/src/security/AppLockProvider';
import { useSyncStatus } from '@/src/sync/SyncProvider';
import { getLocalDateOverride, localDateString } from '@/src/domain/dates';
import { loadTimeTravelDate, saveTimeTravelDate } from '@/src/dev/timeTravel';
import { Button } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';

export default function SettingsScreen() {
  const router = useRouter();
  const appLock = useAppLock();
  const { snapshot: syncSnapshot } = useSyncStatus();
  const [permission, setPermission] = useState<NotificationPermissionState | 'checking'>(
    'checking',
  );
  const [exactAlarmPermission, setExactAlarmPermission] = useState<
    'granted' | 'denied' | 'checking'
  >('checking');
  const [confirmReload, setConfirmReload] = useState(false);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [exactAlarmMessage, setExactAlarmMessage] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [openingSettings, setOpeningSettings] = useState(false);
  const [dailySummaryTime, setDailySummaryTime] = useState(defaultDailySummaryTime);
  const [loadingDailySummaryTime, setLoadingDailySummaryTime] = useState(true);
  const [savingDailySummaryTime, setSavingDailySummaryTime] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [paceMargin, setPaceMargin] = useState('20');
  const [savingsReminderDays, setSavingsReminderDays] = useState('7, 2, 0');
  const [alertSettingsMessage, setAlertSettingsMessage] = useState<string | null>(null);
  const [alertSettingsError, setAlertSettingsError] = useState<string | null>(null);
  const [appLockError, setAppLockError] = useState<string | null>(null);
  const [simulatedDate, setSimulatedDate] = useState('');
  const [timeTravelMessage, setTimeTravelMessage] = useState<string | null>(null);
  const [timeTravelError, setTimeTravelError] = useState<string | null>(null);

  const toggleAppLock = async () => {
    setAppLockError(null);
    try {
      if (appLock.enabled) await appLock.disable();
      else await appLock.enable();
    } catch (cause) {
      setAppLockError(cause instanceof Error ? cause.message : 'Unable to change app lock.');
    }
  };

  useEffect(() => {
    let active = true;

    const loadDailySummaryTime = async () => {
      try {
        const db = await openAppDatabase();
        const savedTime = getPersistedDailySummaryTime(db);
        const household = db
          .prepare?.(
            'SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;',
          )
          .get();
        if (!household || typeof household.id !== 'string') {
          throw new Error('The local household has not been initialized.');
        }
        if (active) {
          setDailySummaryTime(savedTime);
          setPaceMargin(String(getPersistedPaceAlertMargin(db, household.id)));
          setSavingsReminderDays(getPersistedSavingsReminderDays(db, household.id).join(', '));
        }
      } catch (cause) {
        if (active) {
          setSummaryError(
            cause instanceof Error ? cause.message : 'Unable to load the daily summary time.',
          );
        }
      } finally {
        if (active) setLoadingDailySummaryTime(false);
      }
    };

    const loadPermission = async () => {
      try {
        const [current, exactAlarmGranted] = await Promise.all([
          getNotificationPermission(),
          getExactAlarmPermission(),
        ]);
        if (active) {
          setPermission(current);
          setExactAlarmPermission(exactAlarmGranted ? 'granted' : 'denied');
        }
      } catch (cause) {
        if (active) {
          setNotificationError(
            cause instanceof Error ? cause.message : 'Unable to check notification permissions.',
          );
        }
      }
    };

    void loadDailySummaryTime();
    void loadPermission();
    if (__DEV__) {
      void loadTimeTravelDate()
        .then((value) => {
          if (active) setSimulatedDate(value ?? '');
        })
        .catch((cause: unknown) => {
          if (active) {
            setTimeTravelError(
              cause instanceof Error ? cause.message : 'Unable to load the simulated date.',
            );
          }
        });
    }
    return () => {
      active = false;
    };
  }, []);

  const updateSimulatedDate = async (value: string | null) => {
    setTimeTravelError(null);
    setTimeTravelMessage(null);
    try {
      await saveTimeTravelDate(value);
      setSimulatedDate(value ?? '');
      setTimeTravelMessage(
        value ? `Date simulation is active for ${value}.` : 'Date simulation is cleared.',
      );
    } catch (cause) {
      setTimeTravelError(
        cause instanceof Error ? cause.message : 'Unable to change the simulated date.',
      );
    }
  };

  const saveDailySummaryTime = async () => {
    setSummaryError(null);
    setSummaryMessage(null);
    try {
      parseDailySummaryTime(dailySummaryTime);
      setSavingDailySummaryTime(true);
      const db = await openAppDatabase();
      const household = db
        .prepare?.(
          'SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;',
        )
        .get();
      if (!household || typeof household.id !== 'string') {
        throw new Error('The local household has not been initialized.');
      }
      settings.set(db, household.id, dailySummarySettingKey, dailySummaryTime);
      scheduleNotificationRefresh();
      setSummaryMessage('Daily summary time saved.');
    } catch (cause) {
      setSummaryError(
        cause instanceof Error ? cause.message : 'Unable to save the daily summary time.',
      );
    } finally {
      setSavingDailySummaryTime(false);
    }
  };

  const saveAlertSettings = async () => {
    setAlertSettingsError(null);
    setAlertSettingsMessage(null);
    try {
      const margin = Number(paceMargin);
      if (!Number.isInteger(margin) || margin < 0 || margin > 100) {
        throw new Error('Pace alert margin must be a whole number from 0 to 100.');
      }
      const reminderDays = parseSavingsReminderDays(savingsReminderDays);
      const db = await openAppDatabase();
      const household = db
        .prepare?.(
          'SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;',
        )
        .get();
      if (!household || typeof household.id !== 'string') {
        throw new Error('The local household has not been initialized.');
      }
      settings.set(db, household.id, paceAlertMarginKey, margin);
      settings.set(db, household.id, savingsReminderDaysKey, JSON.stringify(reminderDays));
      scheduleNotificationRefresh();
      setAlertSettingsMessage('Alert preferences saved.');
    } catch (cause) {
      setAlertSettingsError(
        cause instanceof Error ? cause.message : 'Unable to save alert preferences.',
      );
    }
  };

  const enableNotifications = async () => {
    setNotificationError(null);
    try {
      const status = await requestNotificationPermission();
      setPermission(status);
      setNotificationMessage(
        status === 'granted'
          ? 'Notifications are enabled.'
          : 'Permission was not granted. Enable notifications in app settings to continue.',
      );
      if (status === 'granted') scheduleNotificationRefresh();
    } catch (cause) {
      setNotificationError(
        cause instanceof Error ? cause.message : 'Unable to request notification permission.',
      );
    }
  };

  const enableExactAlarmDelivery = async () => {
    setNotificationError(null);
    setExactAlarmMessage(null);
    setExactAlarmPermission('checking');
    try {
      const granted = await requestExactAlarmPermission();
      setExactAlarmPermission(granted ? 'granted' : 'denied');
      setExactAlarmMessage(
        granted
          ? 'Exact-time delivery is enabled.'
          : 'Exact-time access was not granted. Reminders will use best-effort delivery.',
      );
      if (granted) scheduleNotificationRefresh();
    } catch (cause) {
      setExactAlarmPermission('denied');
      setNotificationError(
        cause instanceof Error ? cause.message : 'Unable to request exact alarm access.',
      );
    }
  };

  const sendTestNotification = async () => {
    setNotificationError(null);
    setNotificationMessage(null);
    try {
      await scheduleTestNotification();
      setPermission('granted');
      setNotificationMessage('Test notification scheduled. Check your notification tray.');
    } catch (cause) {
      setNotificationError(
        cause instanceof Error ? cause.message : 'Unable to schedule a test notification.',
      );
    }
  };

  const openDeviceSettings = async () => {
    setOpeningSettings(true);
    setNotificationError(null);
    try {
      await Linking.openSettings();
    } catch (cause) {
      setNotificationError(
        cause instanceof Error ? cause.message : 'Unable to open device settings.',
      );
    } finally {
      setOpeningSettings(false);
    }
  };

  const exportData = async (dataset: 'transactions' | 'budget-lines' | 'allocations' | 'loans') => {
    setDataMessage(null);
    try {
      const db = await openAppDatabase();
      const householdId = getActiveHouseholdId(db);
      const csvBuilders = {
        transactions: buildTransactionsCsv,
        'budget-lines': buildBudgetLinesCsv,
        allocations: buildAllocationsCsv,
        loans: buildLoansCsv,
      };
      const csv = csvBuilders[dataset](db, householdId);
      await shareCsv(csv, `pocket-guard-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`);
      setDataMessage(`${dataset.replace('-', ' ')} CSV shared.`);
    } catch (cause) {
      setDataMessage(cause instanceof Error ? cause.message : 'Unable to export.');
    }
  };

  const reloadPlan = async () => {
    if (!confirmReload) {
      setConfirmReload(true);
      return;
    }
    setConfirmReload(false);
    try {
      const db = await openAppDatabase();
      loadSeedPlan(db as Parameters<typeof loadSeedPlan>[0], getActiveHouseholdId(db));
      scheduleNotificationRefresh();
      setDataMessage('Plan loaded. Missing lines, amounts and debts were added.');
    } catch (cause) {
      setDataMessage(cause instanceof Error ? cause.message : 'Unable to load the plan.');
    }
  };

  return (
    <PageLayout title="Settings" subtitle="Preferences and app controls">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/auth')}
        className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <Text className="text-lg font-bold text-slate-900">Account and sign-in</Text>
        <Text className="mt-2 text-sm text-slate-600">
          Optional cloud account. Your local household stays available when signed out.
        </Text>
        {syncSnapshot.error ? (
          <Text className="mt-2 text-xs text-red-700">Sync: {syncSnapshot.error}</Text>
        ) : null}
      </Pressable>

      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="text-lg font-bold text-slate-900">Notifications</Text>
        <Text className="mt-2 text-sm text-slate-600">
          Permission: {permission === 'checking' ? 'Checking…' : permission}
        </Text>
        {permission !== 'granted' ? (
          <Pressable
            accessibilityRole="button"
            onPress={enableNotifications}
            className="mt-4 min-h-12 rounded-xl bg-emerald-600 px-4 py-3"
          >
            <Text className="text-center font-bold text-white">Enable notifications</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={sendTestNotification}
          className="mt-3 min-h-12 rounded-xl border border-slate-200 px-4 py-3"
        >
          <Text className="text-center font-bold text-slate-900">Send test notification</Text>
        </Pressable>
        {notificationMessage ? (
          <Text className="mt-3 text-sm font-medium text-emerald-700">{notificationMessage}</Text>
        ) : null}
        {notificationError ? (
          <Text className="mt-3 text-sm font-medium text-red-700">{notificationError}</Text>
        ) : null}
        {Platform.OS === 'android' ? (
          <>
            <Text className="mt-4 text-sm text-slate-600">
              Exact-time delivery: {exactAlarmPermission}
            </Text>
            {exactAlarmPermission !== 'granted' ? (
              <Pressable
                accessibilityRole="button"
                disabled={exactAlarmPermission === 'checking'}
                onPress={enableExactAlarmDelivery}
                className="mt-3 min-h-12 rounded-xl border border-slate-200 px-4 py-3"
              >
                <Text className="text-center font-bold text-slate-900">
                  Allow exact-time reminders
                </Text>
              </Pressable>
            ) : null}
            {exactAlarmMessage ? (
              <Text className="mt-3 text-sm font-medium text-emerald-700">{exactAlarmMessage}</Text>
            ) : null}
          </>
        ) : null}
      </View>

      <View className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <Text className="text-lg font-bold text-amber-900">Keep reminders reliable</Text>
        <Text className="mt-2 text-sm text-amber-800">
          {Platform.OS === 'android'
            ? 'Some Android devices pause reminders to save battery. In app settings, allow background activity or set battery usage to Unrestricted if those options are available.'
            : 'Keep notifications enabled so scheduled reminders can reach you.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={openingSettings}
          onPress={openDeviceSettings}
          className="mt-4 min-h-12 rounded-xl border border-amber-300 px-4 py-3"
        >
          <Text className="text-center font-bold text-amber-900">
            {openingSettings ? 'Opening settings…' : 'Open app settings'}
          </Text>
        </Pressable>
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="text-lg font-bold text-slate-900">Daily summary</Text>
        <Text className="mt-2 text-sm text-slate-600">
          Choose when your daily spending and budget update arrives (local time).
        </Text>
        <View className="mt-4 flex-row items-center gap-3">
          <TextInput
            accessibilityLabel="Daily summary time"
            className="min-h-12 min-w-28 rounded-xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-900"
            editable={!loadingDailySummaryTime && !savingDailySummaryTime}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            onChangeText={(value) => {
              setDailySummaryTime(value);
              setSummaryMessage(null);
              setSummaryError(null);
            }}
            placeholder="20:00"
            value={dailySummaryTime}
          />
          <Pressable
            accessibilityRole="button"
            disabled={loadingDailySummaryTime || savingDailySummaryTime}
            onPress={saveDailySummaryTime}
            className="min-h-12 flex-1 rounded-xl bg-emerald-600 px-4 py-3"
          >
            <Text className="text-center font-bold text-white">
              {savingDailySummaryTime ? 'Saving…' : 'Save time'}
            </Text>
          </Pressable>
        </View>
        {summaryMessage ? (
          <Text className="mt-3 text-sm font-medium text-emerald-700">{summaryMessage}</Text>
        ) : null}
        {summaryError ? (
          <Text className="mt-3 text-sm font-medium text-red-700">{summaryError}</Text>
        ) : null}
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="text-lg font-bold text-slate-900">Alert preferences</Text>
        <Text className="mt-2 text-sm text-slate-600">
          Pace alerts compare line usage to elapsed month progress. Savings reminders use days
          before each monthly commitment is due; overdue commitments remind daily.
        </Text>
        <Text className="mt-4 text-sm font-semibold text-slate-700">
          Pace margin (percentage points)
        </Text>
        <TextInput
          accessibilityLabel="Pace alert margin"
          className="mt-2 min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-900"
          keyboardType="number-pad"
          maxLength={3}
          onChangeText={setPaceMargin}
          value={paceMargin}
        />
        <Text className="mt-4 text-sm font-semibold text-slate-700">
          Savings reminder days before due
        </Text>
        <TextInput
          accessibilityLabel="Savings reminder days"
          className="mt-2 min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-900"
          keyboardType="numbers-and-punctuation"
          onChangeText={setSavingsReminderDays}
          placeholder="7, 2, 0"
          value={savingsReminderDays}
        />
        <Pressable
          accessibilityRole="button"
          onPress={saveAlertSettings}
          className="mt-4 min-h-12 rounded-xl bg-emerald-600 px-4 py-3"
        >
          <Text className="text-center font-bold text-white">Save alert preferences</Text>
        </Pressable>
        {alertSettingsMessage ? (
          <Text className="mt-3 text-sm font-medium text-emerald-700">{alertSettingsMessage}</Text>
        ) : null}
        {alertSettingsError ? (
          <Text className="mt-3 text-sm font-medium text-red-700">{alertSettingsError}</Text>
        ) : null}
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="text-lg font-bold text-slate-900">Security and data</Text>
        {Platform.OS !== 'web' ? (
          <>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: appLock.enabled, disabled: appLock.loading }}
              disabled={appLock.loading}
              onPress={() => void toggleAppLock()}
              className="mt-3 min-h-12 flex-row items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
            >
              <View className="flex-1 pr-3">
                <Text className="text-base font-bold text-slate-900">App lock</Text>
                <Text className="mt-1 text-sm text-slate-600">
                  Require device biometrics or passcode when opening or returning to the app.
                </Text>
              </View>
              <Text className="font-bold text-slate-900">
                {appLock.loading ? 'Checking…' : appLock.enabled ? 'On' : 'Off'}
              </Text>
            </Pressable>
            {appLockError ? (
              <Text className="mt-2 text-sm font-medium text-red-700">{appLockError}</Text>
            ) : null}
            {__DEV__ ? (
              <View className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-5">
                <Text className="text-lg font-bold text-violet-950">Developer date simulation</Text>
                <Text className="mt-2 text-sm text-violet-900">
                  Simulates today for budgets, spend checks, debt and loan status, and reminder
                  previews. Writes still use the real device clock. Current effective date:{' '}
                  {localDateString()}.
                  {getLocalDateOverride() ? ` Active override: ${getLocalDateOverride()}.` : ''}
                </Text>
                <TextInput
                  accessibilityLabel="Simulated date"
                  className="mt-3 min-h-12 rounded-xl border border-violet-200 bg-white px-4 py-3 text-base"
                  value={simulatedDate}
                  onChangeText={(value) => {
                    setSimulatedDate(value);
                    setTimeTravelError(null);
                    setTimeTravelMessage(null);
                  }}
                  placeholder="YYYY-MM-DD"
                  maxLength={10}
                />
                <View className="mt-3 flex-row gap-3">
                  <View className="flex-1">
                    <Button
                      label="Apply simulated date"
                      disabled={!simulatedDate.trim()}
                      onPress={() => void updateSimulatedDate(simulatedDate.trim())}
                    />
                  </View>
                  <View className="flex-1">
                    <Button
                      label="Clear"
                      variant="outline"
                      onPress={() => void updateSimulatedDate(null)}
                    />
                  </View>
                </View>
                {timeTravelMessage ? (
                  <Text className="mt-3 text-sm font-medium text-violet-900">
                    {timeTravelMessage}
                  </Text>
                ) : null}
                {timeTravelError ? (
                  <Text className="mt-3 text-sm font-medium text-red-700">{timeTravelError}</Text>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <Text className="mt-2 text-sm text-slate-600">
            App lock requires biometrics or a device passcode and is available in the mobile app.
          </Text>
        )}
        <Link
          href="/overrides"
          className="mt-3 min-h-12 justify-center rounded-xl border border-slate-200 px-4 py-3"
        >
          <Text className="text-center font-bold text-slate-900">Overrides report</Text>
        </Link>
        {(
          [
            ['transactions', 'Transactions'],
            ['budget-lines', 'Budget lines'],
            ['allocations', 'Allocations'],
            ['loans', 'Loans and repayments'],
          ] as const
        ).map(([dataset, label]) => (
          <Pressable
            key={dataset}
            accessibilityRole="button"
            onPress={() => void exportData(dataset)}
            className="mt-3 min-h-12 rounded-xl border border-slate-200 px-4 py-3"
          >
            <Text className="text-center font-bold text-slate-900">Export {label} (CSV)</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={reloadPlan}
          className="mt-3 min-h-12 rounded-xl border border-slate-200 px-4 py-3"
        >
          <Text className="text-center font-bold text-slate-900">
            {confirmReload ? 'Tap again to confirm' : 'Reload Sep–Dec 2026 plan'}
          </Text>
        </Pressable>
        {confirmReload ? (
          <Text className="mt-2 text-xs text-slate-600">
            This only adds missing lines, amounts and debts. Anything you edited or already recorded
            is kept.
          </Text>
        ) : null}
        {dataMessage ? (
          <Text className="mt-3 text-sm font-medium text-slate-700">{dataMessage}</Text>
        ) : null}
      </View>
    </PageLayout>
  );
}
