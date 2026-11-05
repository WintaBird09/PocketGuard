import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { LineKind } from '@/src/data/plan';
import type { ExpenseLineOption } from '@/src/data/transaction-entry';
import { assignLineIcons } from '@/src/ui/lineIcons';
import { formatXAF } from '@/src/ui/theme';

const kindLabels: Record<string, string> = {
  running: 'Everyday',
  fixed: 'Fixed bill',
  debt: 'Debt',
  savings: 'Savings',
  misc: 'Miscellaneous',
};

const newLineKinds: LineKind[] = ['running', 'fixed', 'savings'];

export function BudgetLinePicker({
  lines,
  selectedId,
  onSelect,
  onCreate,
}: {
  lines: ExpenseLineOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  // Returns an error message, or null when the line was created and selected.
  onCreate: (name: string, kind: LineKind) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LineKind>('running');
  const [error, setError] = useState<string | null>(null);
  const selected = lines.find((line) => line.id === selectedId);
  const icons = useMemo(() => assignLineIcons(lines), [lines]);
  const selectedStyle = selected ? icons.get(selected.id) : undefined;
  const selectedLabel = selected ? (kindLabels[selected.kind] ?? '') : '';

  const close = () => {
    setOpen(false);
    setAdding(false);
    setError(null);
  };

  const choose = (id: string) => {
    onSelect(id);
    close();
  };

  const create = () => {
    const result = onCreate(name, kind);
    if (result) {
      setError(result);
      return;
    }
    setName('');
    setKind('running');
    close();
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Budget line, ${selected?.name ?? 'none selected'}. Tap to change.`}
        onPress={() => setOpen(true)}
        className="min-h-14 flex-row items-center rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2"
      >
        <View
          className="h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: selectedStyle?.bg ?? '#f1f5f9' }}
        >
          <Ionicons
            name={selectedStyle?.icon ?? 'list'}
            size={20}
            color={selectedStyle?.tint ?? '#64748b'}
          />
        </View>
        <View className="ml-3 flex-1">
          <Text
            className={`text-base font-semibold ${selected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}
            numberOfLines={1}
          >
            {selected?.name ?? 'Select a budget line'}
          </Text>
          {selected ? (
            <Text className="text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
              {selected.planned > 0 ? `${formatXAF(selected.planned)} planned` : selectedLabel}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={20} color="#64748b" />
      </Pressable>

      <Modal transparent animationType="slide" visible={open} onRequestClose={close}>
        <View className="flex-1 justify-end bg-black/50">
          <Pressable accessibilityLabel="Close" className="flex-1" onPress={close} />
          <View className="max-h-[80%] rounded-t-3xl bg-white dark:bg-slate-900 px-4 pb-6 pt-3">
            <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-slate-300" />
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {adding ? 'New budget line' : 'Choose a budget line'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={close}
                className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <Ionicons name="close" size={20} className="text-slate-900 dark:text-slate-100" />
              </Pressable>
            </View>

            {adding ? (
              <View>
                <TextInput
                  accessibilityLabel="New budget line name"
                  autoCapitalize="words"
                  autoFocus
                  maxLength={40}
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setError(null);
                  }}
                  placeholder="e.g. School fees"
                  className="min-h-12 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
                />
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {newLineKinds.map((item) => {
                    const active = item === kind;
                    return (
                      <Pressable
                        key={item}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setKind(item)}
                        className={`min-h-11 flex-row items-center rounded-full border px-4 py-2 ${
                          active
                            ? 'border-emerald-600 bg-emerald-600'
                            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            active ? 'text-white' : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {kindLabels[item]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {error ? (
                  <Text
                    accessibilityRole="alert"
                    className="mt-2 text-sm text-red-700 dark:text-red-400"
                  >
                    {error}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={create}
                  className="mt-4 min-h-12 items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3"
                >
                  <Text className="text-base font-bold text-white">Create and select</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setAdding(false);
                    setError(null);
                  }}
                  className="mt-2 min-h-12 items-center justify-center rounded-2xl border border-slate-300 dark:border-slate-600 px-4 py-3"
                >
                  <Text className="text-base font-semibold text-slate-800 dark:text-slate-200">
                    Back to list
                  </Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled">
                {lines.map((line) => {
                  const active = line.id === selectedId;
                  const style = icons.get(line.id)!;
                  const label = kindLabels[line.kind] ?? '';
                  return (
                    <Pressable
                      key={line.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${line.name}, ${label}`}
                      onPress={() => choose(line.id)}
                      className={`mb-2 min-h-16 flex-row items-center rounded-2xl border px-3 py-2 ${
                        active
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <View
                        className="h-11 w-11 items-center justify-center rounded-xl"
                        style={{ backgroundColor: style.bg }}
                      >
                        <Ionicons name={style.icon} size={22} color={style.tint} />
                      </View>
                      <View className="ml-3 flex-1">
                        <Text
                          className="text-base font-bold text-slate-900 dark:text-slate-100"
                          numberOfLines={1}
                        >
                          {line.name}
                        </Text>
                        <Text
                          className="text-xs text-slate-500 dark:text-slate-400"
                          numberOfLines={1}
                        >
                          {label}
                          {line.planned > 0 ? ` · ${formatXAF(line.planned)} planned` : ''}
                        </Text>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={24} color="#059669" />
                      ) : null}
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add a new budget line"
                  onPress={() => setAdding(true)}
                  className="mt-1 min-h-14 flex-row items-center justify-center rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50/40 px-4 py-3"
                >
                  <Ionicons name="add-circle" size={24} color="#059669" />
                  <Text className="ml-2 text-base font-bold text-emerald-700 dark:text-emerald-400">
                    Add new budget line
                  </Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
