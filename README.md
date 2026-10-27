# Pocket Guard

Offline-first personal budgeting app for Android.

## Android personal release

The Android application ID is `com.nkabeh.pocketguard`; the launcher name and icon are configured
in `app.json`. The personal release uses an internally distributed, production-mode APK signed
with EAS-managed Android credentials.

### One-time EAS setup

1. Install/use a current Node.js version and run commands from this directory.
2. Sign in to the owner's Expo account and create/link this app to an EAS project:

   ```sh
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```

   Keep the EAS project ID that `eas init` adds to `app.json`.

3. In the Expo dashboard, add `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the `production` EAS environment. These are public client
   configuration values. Never add a Supabase service-role key or Anthropic API key to the app
   or an EAS build environment.
4. Start the production APK build:

   ```sh
   npx eas-cli@latest build --platform android --profile production
   ```

   On the first build, allow EAS to create and manage the Android signing key. Keep the EAS project
   and its managed credentials under the owner's Expo account. Future updates must use the same
   application ID and signing credentials; increment `android.versionCode` in `app.json` for each
   subsequent release.

5. Download the completed APK from the EAS build page, install it on the owner's phone, and
   complete the device checks below. Keep the APK and build URL with the release record.

The production profile is intentionally configured as an internal APK for personal sideloading,
not a Play Store AAB. This setup does not publish an app, create an EAS project, or start a cloud
build by itself.

## Install, battery, and one-week device check

- Install the EAS production APK and verify the displayed app name and icon.
- Sign in with the same Supabase account used for the existing data and wait until the sync
  indicator reports `Synced`; investigate any error or pending count before uninstalling any older
  installation.
- Verify app lock, manual expense entry, voice entry, notifications, and native CSV sharing on the
  release build.
- Open Android app settings and set battery use to `Unrestricted` (or the equivalent on that
  device). Confirm notifications continue to arrive.
- Use the app for seven consecutive days before marking the one-week task complete. Record issues
  and metric observations below; do not treat a successful build as device acceptance.

## Cloud backup and reinstall restore

The cloud backup is the Supabase household data synchronized by the app. Before relying on it:

1. Sign in on the current installation while online.
2. Wait for the sync indicator to show `Synced` with no pending rows or sync error.
3. In the owner's Supabase project, verify that expected household records exist. Never share or
   place service-role credentials in this repository.
4. Install on a clean device or reinstall only after confirming the prior device has no pending
   writes. Sign in using the **same Supabase user**. The app links the local household to that
   user's existing household; keep the device online while the initial pull completes.
5. Verify representative transactions, budget lines, allocations, debts, savings goals, and
   commitments are present, including soft-deleted records where applicable. Confirm the sync
   indicator returns to `Synced`.

**Important coverage limits:** loans and repayments are not included in the current Supabase
push/pull sync, so they are not protected by this cloud backup. App-lock preferences and developer
date simulation are device-local as well. A server restore is not a substitute for keeping the
source device until all supported data has synchronized. Do not mark the backup check complete
until the owner verifies the live Supabase project and a real reinstall/restore.

## Two-week personal review

The PRD's personal success metrics should be reviewed after two weeks of real use, not inferred
from automated tests or build telemetry. Record only what is needed for this personal review; the
MVP does not use third-party analytics.

| Metric (PRD §13)                              | Target     | Observed |
| --------------------------------------------- | ---------- | -------- |
| Days with at least one recorded transaction   | ≥90%       |          |
| MoMo spending recorded within 24 hours        | ≥80%       |          |
| Budget-cap overruns without a logged override | 0          |          |
| Savings commitments confirmed on time         | Each month |          |
| Median manual expense entry time              | <10 s      |          |
| Median voice expense entry time               | <15 s      |          |

After two weeks, list the five most annoying issues and decide whether to start Phase 2. Record
that decision in the task log; do not begin SMS capture without the owner's explicit approval and
the redacted message samples required by the PRD.
