import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { buildMonthGrid, parseDateKey, toDateKey } from '@/src/auth/personalInfo';

const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatLong(value: string): string {
  const parsed = parseDateKey(value);
  return parsed ? `${parsed.day} ${monthNames[parsed.month - 1]} ${parsed.year}` : '';
}

export function DatePickerField({
  label,
  value,
  onChange,
  error,
  maximumDate = new Date(),
  minimumDate = new Date(1900, 0, 1),
  startYear = 1990,
  startOnToday = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  maximumDate?: Date;
  minimumDate?: Date;
  startYear?: number;
  startOnToday?: boolean;
}) {
  const selected = parseDateKey(value);
  const [open, setOpen] = useState(false);
  const today = new Date();
  const initialYear = selected?.year ?? (startOnToday ? today.getFullYear() : startYear);
  const initialMonth = selected?.month ?? (startOnToday ? today.getMonth() + 1 : 1);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [choosingYear, setChoosingYear] = useState(false);
  const maxYear = maximumDate.getFullYear();
  const minYear = minimumDate.getFullYear();
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);

  const openPicker = () => {
    setYear(initialYear);
    setMonth(initialMonth);
    setChoosingYear(false);
    setOpen(true);
  };

  const shiftMonth = (delta: number) => {
    const index = year * 12 + (month - 1) + delta;
    const nextYear = Math.floor(index / 12);
    if (nextYear > maxYear || nextYear < minYear) return;
    setYear(nextYear);
    setMonth((index % 12) + 1);
  };

  const outOfRange = (day: number) => {
    const key = toDateKey(year, month, day);
    return (
      key >
        toDateKey(maximumDate.getFullYear(), maximumDate.getMonth() + 1, maximumDate.getDate()) ||
      key < toDateKey(minimumDate.getFullYear(), minimumDate.getMonth() + 1, minimumDate.getDate())
    );
  };

  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ? formatLong(value) : 'not set'}`}
        onPress={openPicker}
        className={`min-h-12 flex-row items-center rounded-xl border bg-white dark:bg-slate-900 px-4 py-3 ${
          error ? 'border-red-400' : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        <Ionicons name="calendar" size={20} color="#059669" />
        <Text
          className={`ml-3 flex-1 text-base ${value ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}
        >
          {value ? formatLong(value) : 'Tap to pick a date'}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#94a3b8" />
      </Pressable>
      {error ? <Text className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</Text> : null}

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/50 p-5">
          <View className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Pressable
                accessibilityLabel="Previous month"
                onPress={() => shiftMonth(-1)}
                className="h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  className="text-slate-900 dark:text-slate-100"
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose year"
                onPress={() => setChoosingYear((current) => !current)}
                className="flex-row items-center rounded-full px-3 py-2"
              >
                <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {monthNames[month - 1]} {year}
                </Text>
                <Ionicons
                  name={choosingYear ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  className="text-slate-900 dark:text-slate-100"
                  style={{ marginLeft: 6 }}
                />
              </Pressable>
              <Pressable
                accessibilityLabel="Next month"
                onPress={() => shiftMonth(1)}
                className="h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  className="text-slate-900 dark:text-slate-100"
                />
              </Pressable>
            </View>

            {choosingYear ? (
              <ScrollView style={{ height: 280 }}>
                <View className="flex-row flex-wrap">
                  {years.map((item) => (
                    <Pressable
                      key={item}
                      accessibilityRole="button"
                      onPress={() => {
                        setYear(item);
                        setChoosingYear(false);
                      }}
                      className="w-1/4 p-1"
                    >
                      <View
                        className={`items-center rounded-xl py-3 ${
                          item === year ? 'bg-emerald-600' : 'bg-slate-100 dark:bg-slate-800'
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            item === year ? 'text-white' : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {item}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View>
                <View className="mb-1 flex-row">
                  {weekdays.map((day, index) => (
                    <Text
                      key={index}
                      className="flex-1 text-center text-xs font-semibold text-slate-400"
                    >
                      {day}
                    </Text>
                  ))}
                </View>
                {buildMonthGrid(year, month).map((week, rowIndex) => (
                  <View key={rowIndex} className="flex-row">
                    {week.map((day, cellIndex) => {
                      const active =
                        day !== null && selected?.year === year && selected.month === month
                          ? selected.day === day
                          : false;
                      const disabled = day === null || outOfRange(day);
                      return (
                        <View key={cellIndex} className="flex-1 p-0.5">
                          {day === null ? (
                            <View className="h-11" />
                          ) : (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${day} ${monthNames[month - 1]} ${year}`}
                              disabled={disabled}
                              onPress={() => {
                                onChange(toDateKey(year, month, day));
                                setOpen(false);
                              }}
                              className={`h-11 items-center justify-center rounded-full ${
                                active ? 'bg-emerald-600' : ''
                              } ${disabled ? 'opacity-30' : ''}`}
                            >
                              <Text
                                className={`text-sm ${
                                  active
                                    ? 'font-bold text-white'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {day}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              className="mt-3 items-center rounded-2xl border border-slate-300 dark:border-slate-600 py-3"
            >
              <Text className="text-base font-semibold text-slate-800 dark:text-slate-200">
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
