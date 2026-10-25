import { Pressable, Text, View } from 'react-native';

import { syncStatusLabel, type SyncStatus } from './engine';
import { useSyncStatus } from './SyncProvider';

const dot: Record<SyncStatus, string> = {
  'signed-out': 'bg-slate-400',
  offline: 'bg-amber-500',
  syncing: 'bg-sky-500',
  pending: 'bg-amber-500',
  synced: 'bg-emerald-500',
  error: 'bg-red-600',
};

export function SyncIndicator({ showError = false }: { showError?: boolean }) {
  const { snapshot, syncNow } = useSyncStatus();
  const retryable = snapshot.status === 'error' || snapshot.status === 'pending';
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sync status: ${syncStatusLabel(snapshot)}`}
        disabled={!retryable}
        onPress={syncNow}
        className="flex-row items-center self-start rounded-full border border-slate-200 bg-white px-3 py-1"
      >
        <View className={`mr-2 h-2 w-2 rounded-full ${dot[snapshot.status]}`} />
        <Text className="text-xs font-semibold text-slate-700">{syncStatusLabel(snapshot)}</Text>
      </Pressable>
      {showError && snapshot.error ? (
        <Text className="mt-1 text-xs text-red-700">{snapshot.error}</Text>
      ) : null}
    </View>
  );
}
