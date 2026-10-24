import type { DatabaseLike } from '../data/db';
import { settings } from '../data/repos';

export const batteryOptimizationOnboardingKey = 'battery_optimization_onboarding_dismissed';

export function shouldShowBatteryOptimizationOnboarding(
  database: DatabaseLike,
  householdId: string,
  platform: string,
): boolean {
  return (
    platform === 'android' &&
    settings.get(database, householdId, batteryOptimizationOnboardingKey) !== 'true'
  );
}

export function dismissBatteryOptimizationOnboarding(
  database: DatabaseLike,
  householdId: string,
): void {
  settings.set(database, householdId, batteryOptimizationOnboardingKey, true);
}
