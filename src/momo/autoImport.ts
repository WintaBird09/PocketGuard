import { getActiveHouseholdId } from '../data/household';
import { openAppDatabase } from '../data/db';
import { settings } from '../data/repos';

import { MOMO_SENDER_ID, momoAutoImportSettingKey } from './constants';
import { momoAlertsSettingKey } from '../notifications/smartPreferences';
import { parseMomoSmsBatch } from './MomoSmsParser';
import { getMomoNativeModule } from './native';
import { registerMomoPending } from './store';

export async function processPendingAutoMomoSms(): Promise<{
  count: number;
  transactionIds: string[];
}> {
  const native = getMomoNativeModule();
  if (!native) return { count: 0, transactionIds: [] };
  const db = await openAppDatabase();
  const householdId = getActiveHouseholdId(db);
  if (
    settings.get(db, householdId, momoAutoImportSettingKey) !== 'true' &&
    settings.get(db, householdId, momoAlertsSettingKey) !== 'true'
  ) {
    return { count: 0, transactionIds: [] };
  }

  const messages = await native.getPendingSms();
  const eligible = messages.filter(
    (message) => message.address.toLowerCase() === MOMO_SENDER_ID.toLowerCase(),
  );
  const parsed = eligible.flatMap((message) => parseMomoSmsBatch(message.body, 'MOMO_AUTO'));
  const registered = registerMomoPending(db, householdId, parsed);
  await native.clearPendingSms(eligible.map((message) => message.id));
  const added = registered.filter((result) => !result.duplicate);
  return {
    count: added.length,
    transactionIds: added.flatMap((result) =>
      result.item.transactionId ? [result.item.transactionId] : [],
    ),
  };
}
