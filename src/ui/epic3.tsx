import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { formatXAF } from '@/src/ui/theme';

type MetricCardProps = {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  helper?: string;
};

export function MetricCard({ label, value, tone = 'default', helper }: MetricCardProps) {
  const toneMap = {
    default: 'border-slate-200 bg-white',
    success: 'border-emerald-200 bg-emerald-50',
    warning: 'border-amber-200 bg-amber-50',
    danger: 'border-red-200 bg-red-50',
  } as const;

  return (
    <View className={`flex-1 rounded-2xl border p-4 ${toneMap[tone]}`}>
      <Text className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </Text>
      <Text className="mt-2 text-xl font-bold text-slate-900">{value}</Text>
      {helper ? <Text className="mt-1 text-xs text-slate-600">{helper}</Text> : null}
    </View>
  );
}

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Text className="mb-4 text-lg font-bold text-slate-900">{title}</Text>
      {children}
    </View>
  );
}

export function BudgetRow({
  name,
  planned,
  spent,
  remaining,
  status,
  percentUsed,
  daysLeft,
  projected,
}: {
  name: string;
  planned: number;
  spent: number;
  remaining: number;
  status: 'ok' | 'warn' | 'blocked';
  percentUsed?: number;
  daysLeft?: number;
  projected?: number | null;
}) {
  const statusColor =
    status === 'blocked'
      ? 'bg-red-100 text-red-700'
      : status === 'warn'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-emerald-100 text-emerald-700';

  return (
    <View className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-base font-semibold text-slate-900">{name}</Text>
        <View className={`rounded-full px-2 py-1 ${statusColor}`}>
          <Text className="text-[10px] font-bold uppercase tracking-[0.14em]">{status}</Text>
        </View>
      </View>
      <View className="mb-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <View
          className={`h-full rounded-full ${
            status === 'blocked'
              ? 'bg-red-500'
              : status === 'warn'
                ? 'bg-amber-500'
                : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(100, (spent / Math.max(planned, 1)) * 100)}%` }}
        />
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-slate-500">Planned {formatXAF(planned)}</Text>
        <Text className="text-xs font-medium text-slate-700">Spent {formatXAF(spent)}</Text>
      </View>
      {remaining < 0 ? (
        <Text className="mt-1 text-xs font-semibold text-red-700">
          Over budget by {formatXAF(-remaining)}
        </Text>
      ) : (
        <Text className="mt-1 text-xs text-slate-500">Remaining {formatXAF(remaining)}</Text>
      )}
      {percentUsed !== undefined && daysLeft !== undefined ? (
        <Text className="mt-1 text-xs text-slate-600">
          {percentUsed}% used, {daysLeft} days left
          {projected !== null && projected !== undefined
            ? `, at this pace you finish at ${formatXAF(projected)}`
            : ''}
        </Text>
      ) : null}
    </View>
  );
}
