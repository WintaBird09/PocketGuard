import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/ui/ThemeProvider';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const dark = useAppTheme().scheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: dark ? '#34d399' : '#0f766e',
        tabBarInactiveTintColor: dark ? '#94a3b8' : '#64748b',
        tabBarStyle: {
          height: 72 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: dark ? '#334155' : '#e2e8f0',
          backgroundColor: dark ? '#0f172a' : '#ffffff',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="home-outline"
              size={size}
              color={typeof color === 'string' ? color : '#0f172a'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="swap-horizontal-outline"
              size={size}
              color={typeof color === 'string' ? color : '#0f172a'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Budget',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="wallet-outline"
              size={size}
              color={typeof color === 'string' ? color : '#0f172a'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="cash-outline"
              size={size}
              color={typeof color === 'string' ? color : '#0f172a'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="menu-outline"
              size={size}
              color={typeof color === 'string' ? color : '#0f172a'}
            />
          ),
        }}
      />
    </Tabs>
  );
}
