import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { getTheme, AppThemeName, formatXAF } from './theme';

export type MoneyProps = {
  value: number;
  theme?: AppThemeName;
  style?: ViewStyle;
};

export function Money({ value, theme = 'light', style }: MoneyProps) {
  const colors = getTheme(theme);

  return <Text style={[styles.money, { color: colors.text }, style]}>{formatXAF(value)}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  theme = 'light',
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  theme?: AppThemeName;
}) {
  const colors = getTheme(theme);

  const backgroundColor =
    variant === 'secondary' ? colors.card : variant === 'danger' ? colors.danger : colors.primary;

  const textColor = variant === 'secondary' ? colors.text : '#ffffff';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({
  children,
  theme = 'light',
}: {
  children: React.ReactNode;
  theme?: AppThemeName;
}) {
  const colors = getTheme(theme);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

export function ProgressBar({
  value,
  max = 100,
  theme = 'light',
}: {
  value: number;
  max?: number;
  theme?: AppThemeName;
}) {
  const colors = getTheme(theme);
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  const progressColor =
    percentage >= 100 ? colors.danger : percentage >= 80 ? colors.warning : colors.success;

  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
      <View
        style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: progressColor }]}
      />
    </View>
  );
}

export function Screen({
  children,
  theme = 'light',
}: {
  children: React.ReactNode;
  theme?: AppThemeName;
}) {
  const colors = getTheme(theme);

  return <View style={[styles.screen, { backgroundColor: colors.background }]}>{children}</View>;
}

const styles = StyleSheet.create({
  money: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  screen: {
    flex: 1,
    padding: 20,
  },
});
