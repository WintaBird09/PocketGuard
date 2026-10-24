import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';

import { scheduleNotificationRefresh } from '@/src/notifications/schedule';

export default function RootLayout() {
  useEffect(() => {
    scheduleNotificationRefresh();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
