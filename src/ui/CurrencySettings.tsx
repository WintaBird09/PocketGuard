import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { currencies, searchCurrencies } from '../domain/currency';
import { useCurrency } from './CurrencyProvider';

export function CurrencySettings() {
  const { code, detected, setCode } = useCurrency();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchCurrencies(query).slice(0, 40), [query]);
  const current = currencies.find((item) => item.code === code);

  return (
    <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">Currency</Text>
      <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Sets the currency label shown with amounts. Existing amounts are not converted.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change currency"
        onPress={() => setOpen((value) => !value)}
        className="mt-4 min-h-12 flex-row items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700"
      >
        <View className="flex-1 pr-3">
          <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
            {code}
            {current ? ` · ${current.name}` : ''}
          </Text>
          {detected ? (
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              Detected from your region
            </Text>
          ) : null}
        </View>
        <Text className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
          {open ? 'Close' : 'Change'}
        </Text>
      </Pressable>
      {open ? (
        <View className="mt-3">
          <TextInput
            accessibilityLabel="Search currencies"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by code or name"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 dark:border-slate-700 dark:text-slate-100"
          />
          <View className="mt-2 gap-1">
            {results.map((item) => {
              const selected = item.code === code;
              return (
                <Pressable
                  key={item.code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setCode(item.code);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`min-h-11 flex-row items-center justify-between rounded-lg px-3 py-2 ${
                    selected ? 'bg-indigo-50 dark:bg-indigo-950' : ''
                  }`}
                >
                  <Text className="flex-1 text-sm text-slate-800 dark:text-slate-200">
                    {item.name}
                  </Text>
                  <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {item.code}
                  </Text>
                </Pressable>
              );
            })}
            {results.length === 0 ? (
              <Text className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                No matching currency.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
