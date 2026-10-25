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
      className={`rounded-full border px-4 py-2 ${disabled ? 'opacity-50' : ''} ${
        active ? 'border-slate-900 bg-slate-900' : 'border-slate-200 bg-white'
      }`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-800'}`}>
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
      ? 'bg-slate-900'
      : variant === 'danger'
        ? 'bg-red-700'
        : 'border border-slate-300 bg-white';
  const text = variant === 'outline' ? 'text-slate-900' : 'text-white';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`items-center rounded-2xl px-4 py-3 ${style} ${disabled ? 'opacity-50' : ''}`}
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
      ? 'border-red-200 bg-red-50 text-red-800'
      : tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-white text-slate-700';
  const [border, bg, text] = style.split(' ');
  return (
    <View className={`mb-4 rounded-2xl border p-3 ${border} ${bg}`}>
      <Text className={`text-sm font-medium ${text}`}>{children}</Text>
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
