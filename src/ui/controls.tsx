import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export function Chip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active), disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 rounded-full border px-4 py-3 ${disabled ? 'opacity-50' : ''} ${
        active
          ? 'border-slate-900 bg-slate-900 dark:bg-slate-800'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
      }`}
    >
      <Text
        className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
}) {
  const style =
    variant === 'primary'
      ? 'bg-slate-900 dark:bg-slate-800'
      : variant === 'danger'
        ? 'bg-red-700'
        : 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900';
  const text = variant === 'outline' ? 'text-slate-900 dark:text-slate-100' : 'text-white';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 items-center rounded-2xl px-4 py-3 ${style} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-base font-bold ${text}`}>{label}</Text>
    </Pressable>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: 'error' | 'info' | 'success';
  children: ReactNode;
}) {
  const style =
    tone === 'error'
      ? {
          box: 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30',
          text: 'text-red-800 dark:text-red-300',
        }
      : tone === 'success'
        ? {
            box: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30',
            text: 'text-emerald-800 dark:text-emerald-300',
          }
        : {
            box: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
            text: 'text-slate-700 dark:text-slate-200',
          };
  return (
    <View className={`mb-4 rounded-2xl border p-3 ${style.box}`}>
      <Text className={`text-sm font-medium ${style.text}`}>{children}</Text>
    </View>
  );
}

export function monthLabel(month: string, style: 'long' | 'short' = 'long'): string {
  const date = new Date(`${month}-01T12:00:00`);
  return date.toLocaleDateString('en-US', {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  });
}
