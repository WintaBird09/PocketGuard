const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withMomoSms(config, { senderId = 'MobileMoney' } = {}) {
  config.extra = { ...config.extra, momoSenderId: senderId };
  return withAndroidManifest(config, (nextConfig) => {
    const manifest = nextConfig.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return nextConfig;

    manifest['uses-permission'] ??= [];
    for (const permission of ['android.permission.READ_SMS', 'android.permission.RECEIVE_SMS']) {
      if (!manifest['uses-permission'].some((entry) => entry.$['android:name'] === permission)) {
        manifest['uses-permission'].push({ $: { 'android:name': permission } });
      }
    }

    application['meta-data'] ??= [];
    application['meta-data'].push({
      $: {
        'android:name': 'com.nkabeh.pocketguard.MOMO_SENDER_ID',
        'android:value': senderId,
      },
    });

    const activity = application.activity?.find(
      (entry) => entry.$['android:name'] === '.MainActivity',
    );
    if (activity) {
      activity['intent-filter'] ??= [];
      const alreadyShareTarget = activity['intent-filter'].some(
        (filter) =>
          filter.action?.some(
            (action) => action.$['android:name'] === 'android.intent.action.SEND',
          ) && filter.data?.some((data) => data.$['android:mimeType'] === 'text/plain'),
      );
      if (!alreadyShareTarget) {
        activity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': 'text/plain' } }],
        });
      }
    }

    application.receiver ??= [];
    const hasReceiver = application.receiver.some(
      (receiver) => receiver.$['android:name'] === 'com.nkabeh.momosms.MomoSmsReceiver',
    );
    if (!hasReceiver) {
      application.receiver.push({
        $: {
          'android:name': 'com.nkabeh.momosms.MomoSmsReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS',
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }] },
        ],
      });
    }
    return nextConfig;
  });
};
