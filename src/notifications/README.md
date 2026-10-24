# Notifications

`permissions.ts` configures the Android `daily`, `alerts`, and `reminders` channels, checks or requests notification permission, and schedules a test notification. Settings exposes the permission flow, test, and battery-optimization guidance.

`schedule.ts` derives active budget threshold alerts and queues a debounced refresh at app startup and after transaction changes. `scheduler.ts` replaces only Pocket Guard-managed scheduled notifications, queues active alerts for the next local 8 pm, and avoids duplicates while leaving other apps' notifications untouched.

The scheduled alert set is rebuilt when the notification permission is granted. Daily summary timing and immediate threshold notifications are handled by later Epic 4 tasks.
