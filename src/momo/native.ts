import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export type NativeSms = { id: string; address: string; body: string; date: number };

type MomoNativeModule = {
  getSharedText: () => Promise<string | null>;
  queryInbox: (senderId: string, limit: number) => Promise<NativeSms[]>;
  getPendingSms: () => Promise<NativeSms[]>;
  clearPendingSms: (ids: string[]) => Promise<void>;
  setAutoImportEnabled: (enabled: boolean) => Promise<void>;
  getAutoImportEnabled: () => Promise<boolean>;
  setTransactionAlertsEnabled: (enabled: boolean) => Promise<void>;
  addListener: {
    (event: 'onSharedText', listener: (event: { text: string }) => void): EventSubscription;
    (event: 'onPendingSmsAvailable', listener: () => void): EventSubscription;
  };
};

export function getMomoNativeModule(): MomoNativeModule | null {
  return requireOptionalNativeModule<MomoNativeModule>('PocketGuardMomoSms');
}
