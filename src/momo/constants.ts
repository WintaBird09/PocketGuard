import Constants from 'expo-constants';

const configuredSender = (Constants.expoConfig?.extra as { momoSenderId?: string } | undefined)
  ?.momoSenderId;

export const MOMO_SENDER_ID = configuredSender?.trim() || 'MobileMoney';
export const momoAutoImportSettingKey = 'momo_auto_import';
