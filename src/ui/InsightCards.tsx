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

export function InsightCards({ insights }: { insights: FinanceInsight[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<FinanceInsight | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (insights.length === 0) return null;
  const visible = showAll ? insights : insights.slice(0, 4);

  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center gap-2">
        <Ionicons name="bulb" size={18} className="text-amber-600 dark:text-amber-400" />
        <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
          Where to focus
        </Text>
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
              className="flex-row items-center gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <View className={`h-10 w-10 items-center justify-center rounded-xl ${style.chip}`}>
                <Ionicons name={insight.icon as IconName} size={20} className={style.icon} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {insight.title}
                </Text>
                <Text
                  numberOfLines={2}
                  className="mt-0.5 text-xs text-slate-500 dark:text-slate-400"
                >
                  {insight.summary}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} className="text-slate-400" />
            </Pressable>
          );
        })}
      </View>
      {insights.length > 4 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAll((value) => !value)}
          className="mt-2 min-h-10 items-center justify-center"
        >
          <Text className="text-sm font-bold text-indigo-600 dark:text-indigo-300">
            {showAll ? 'Show fewer' : `Show all ${insights.length} insights`}
          </Text>
        </Pressable>
      ) : null}

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
