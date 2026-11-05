import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useAppTheme } from './ThemeProvider';
import { normalizeClockTime } from './themePreference';
import type { ThemeMode } from './themePreference';

const options: { mode: ThemeMode; label: string; hint: string }[] = [
  { mode: 'system', label: 'Device', hint: 'Follow the phone setting' },
  { mode: 'light', label: 'Bright', hint: 'Always bright' },
  { mode: 'dark', label: 'Dark', hint: 'Always dark' },
  { mode: 'schedule', label: 'Day & night', hint: 'Bright by day, dark at night' },
];

function TimeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const valid = normalizeClockTime(text) !== null;

  return (
    <View className="flex-1">
      <Text className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={text}
        onChangeText={setText}
        onBlur={() => {
          const normalized = normalizeClockTime(text);
          if (normalized) onCommit(normalized);
          else setText(value);
        }}
        placeholder="HH:MM"
        placeholderTextColor="#94a3b8"
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        className={`min-h-12 rounded-xl border px-4 py-3 text-base font-semibold text-slate-900 dark:text-slate-100 ${
          valid ? 'border-slate-200 dark:border-slate-700' : 'border-red-400'
        }`}
      />
    </View>
  );
}

export function AppearanceSettings() {
  const { preference, scheme, setPreference } = useAppTheme();

  return (
    <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">Appearance</Text>
      <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Choose bright or dark, or let the app switch by time of day. Currently showing{' '}
        {scheme === 'dark' ? 'dark' : 'bright'}.
      </Text>
      <View className="mt-4 gap-2">
        {options.map((option) => {
          const selected = preference.mode === option.mode;
          return (
            <Pressable
              key={option.mode}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setPreference({ ...preference, mode: option.mode })}
              className={`min-h-12 flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                selected
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <View
                className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
                  selected ? 'border-emerald-600' : 'border-slate-400'
                }`}
              >
                {selected ? <View className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> : null}
              </View>
              <View className="flex-1">
                <Text className="font-bold text-slate-900 dark:text-slate-100">{option.label}</Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400">{option.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {preference.mode === 'schedule' ? (
        <View className="mt-4 flex-row gap-3">
          <TimeField
            key={`day-${preference.dayStart}`}
            label="Day starts (24h)"
            value={preference.dayStart}
            onCommit={(dayStart) => setPreference({ ...preference, dayStart })}
          />
          <TimeField
            key={`night-${preference.nightStart}`}
            label="Night starts (24h)"
            value={preference.nightStart}
            onCommit={(nightStart) => setPreference({ ...preference, nightStart })}
          />
        </View>
      ) : null}
    </View>
  );
}
