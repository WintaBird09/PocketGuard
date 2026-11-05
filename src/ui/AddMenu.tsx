import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Option = {
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  tint: string;
};

const options: Option[] = [
  {
    label: 'Transaction',
    hint: 'Record an expense you made',
    icon: 'receipt-outline',
    href: '/add-transaction',
    tint: 'bg-rose-100 dark:bg-rose-900/40',
  },
  {
    label: 'Income',
    hint: 'Record money received',
    icon: 'cash-outline',
    href: { pathname: '/income', params: { add: '1' } },
    tint: 'bg-emerald-100 dark:bg-emerald-900/40',
  },
  {
    label: 'Budget',
    hint: 'Plan a new budget line',
    icon: 'pie-chart-outline',
    href: { pathname: '/budget', params: { add: '1' } },
    tint: 'bg-indigo-100 dark:bg-indigo-900/40',
  },
  {
    label: 'Savings',
    hint: 'Start a savings goal',
    icon: 'wallet-outline',
    href: '/savings-form',
    tint: 'bg-amber-100 dark:bg-amber-900/40',
  },
];

export function AddMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close menu"
        onPress={onClose}
        className="flex-1 justify-end bg-black/50"
      >
        <Pressable
          accessible={false}
          style={{ paddingBottom: 16 + insets.bottom }}
          className="rounded-t-3xl bg-white px-4 pt-3 dark:bg-slate-900"
        >
          <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-slate-300 dark:bg-slate-600" />
          <Text className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">
            What would you like to add?
          </Text>
          <View className="gap-2">
            {options.map((option) => (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                accessibilityLabel={`Add ${option.label}`}
                onPress={() => {
                  onClose();
                  router.push(option.href);
                }}
                className="min-h-16 flex-row items-center gap-3 rounded-2xl border border-slate-200 p-3 active:bg-slate-50 dark:border-slate-700 dark:active:bg-slate-800"
              >
                <View className={`h-11 w-11 items-center justify-center rounded-xl ${option.tint}`}>
                  <Ionicons
                    name={option.icon}
                    size={22}
                    className="text-slate-800 dark:text-slate-100"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {option.label}
                  </Text>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">{option.hint}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  className="text-slate-400 dark:text-slate-500"
                />
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="mt-3 min-h-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800"
          >
            <Text className="font-bold text-slate-700 dark:text-slate-200">Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
