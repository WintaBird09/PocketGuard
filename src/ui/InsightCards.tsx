import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { ComponentProps } from 'react';

import type { FinanceInsight } from '../domain/financeInsights';

type IconName = ComponentProps<typeof Ionicons>['name'];

const toneStyles = {
  danger: {
    chip: 'bg-red-100 dark:bg-red-900/40',
    icon: 'text-red-700 dark:text-red-300',
    bar: 'bg-red-500',
  },
  warning: {
    chip: 'bg-amber-100 dark:bg-amber-900/40',
    icon: 'text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  info: {
    chip: 'bg-indigo-100 dark:bg-indigo-900/40',
    icon: 'text-indigo-700 dark:text-indigo-300',
    bar: 'bg-indigo-500',
  },
  success: {
    chip: 'bg-emerald-100 dark:bg-emerald-900/40',
    icon: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
} as const;

export function InsightCards({
  insights,
  showAll: controlledShowAll,
  onShowAllChange,
}: {
  insights: FinanceInsight[];
  showAll?: boolean;
  onShowAllChange?: (showAll: boolean) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<FinanceInsight | null>(null);
  const [internalShowAll, setInternalShowAll] = useState(false);
  const showAll = controlledShowAll ?? internalShowAll;
  if (insights.length === 0) return null;
  const visible = showAll ? insights : insights.slice(0, 1);
  const setShowAll = (next: boolean) => {
    setInternalShowAll(next);
    onShowAllChange?.(next);
  };

  return (
    <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <View className="mb-2 flex-row items-center gap-2">
        <Ionicons
          name="sparkles-outline"
          size={18}
          className="text-emerald-800 dark:text-emerald-300"
        />
        <Text className="flex-1 text-base font-bold text-slate-900 dark:text-slate-100">
          Insights for you
        </Text>
        {insights.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowAll(!showAll)}
            hitSlop={8}
            className="min-h-10 justify-center"
          >
            <Text className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
              {showAll ? 'Show less' : 'See all'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View className="gap-2">
        {visible.map((insight) => {
          const style = toneStyles[insight.tone];
          return (
            <Pressable
              key={insight.id}
              accessibilityRole="button"
              accessibilityLabel={`${insight.title}. Tap for the working.`}
              onPress={() => setSelected(insight)}
              className={`overflow-hidden rounded-3xl border p-4 ${
                insight.tone === 'danger' || insight.tone === 'warning'
                  ? 'border-emerald-100 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/50'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              <Text className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                {insight.tone === 'danger' || insight.tone === 'warning'
                  ? 'Needs attention'
                  : 'A useful insight'}
              </Text>
              <View className="mt-2 flex-row items-start gap-3">
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {insight.title}
                  </Text>
                  <Text className="mt-1 text-sm leading-5 text-slate-700 dark:text-slate-300">
                    {insight.summary}
                  </Text>
                  <Text className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Tap to see the working
                  </Text>
                </View>
                <View className={`h-9 w-9 items-center justify-center rounded-full ${style.chip}`}>
                  <Ionicons name={insight.icon as IconName} size={18} className={style.icon} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setSelected(null)}>
          <Pressable className="max-h-[85%] rounded-t-3xl bg-white p-5 dark:bg-slate-900">
            {selected ? (
              <ScrollView>
                <View className="flex-row items-start gap-3">
                  <View
                    className={`h-11 w-11 items-center justify-center rounded-xl ${toneStyles[selected.tone].chip}`}
                  >
                    <Ionicons
                      name={selected.icon as IconName}
                      size={22}
                      className={toneStyles[selected.tone].icon}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                      {selected.title}
                    </Text>
                    <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {selected.summary}
                    </Text>
                  </View>
                </View>
                <Text className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  How we worked it out
                </Text>
                <View className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
                  {selected.working.map((row) => (
                    <View
                      key={`${row.label}-${row.value}`}
                      className="border-b border-slate-200 py-2 last:border-b-0 dark:border-slate-700"
                    >
                      <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {row.label}
                      </Text>
                      <Text className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text className="mt-4 text-sm text-slate-700 dark:text-slate-200">
                  {selected.advice}
                </Text>
                <View className="mt-5 flex-row gap-3">
                  {selected.href ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        const href = selected.href;
                        setSelected(null);
                        if (href) router.push(href as never);
                      }}
                      className="min-h-12 flex-1 items-center justify-center rounded-2xl bg-slate-900 px-4 dark:bg-slate-700"
                    >
                      <Text className="font-bold text-white">Take action</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelected(null)}
                    className="min-h-12 flex-1 items-center justify-center rounded-2xl border border-slate-300 px-4 dark:border-slate-600"
                  >
                    <Text className="font-bold text-slate-900 dark:text-slate-100">Close</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
