# Pocket Guard

Offline-first personal budgeting app for Android. Sign-in is required before use, and each
account's data is stored in its own local database on the device.

## Accounts and data isolation

- The app opens on the login screen. Signed-out users can only reach login, sign-up and the
  sign-in callback; everything else redirects to login. Order: sign in → onboarding → home.
- Onboarding has two steps: personal details (name, phone, date of birth via a calendar,
  profession — saved in the Supabase account's user metadata), then this month's budget
  (expected income and an amount per budget line, with quick-add suggestions).
- Profile, display name, password change and sign-out live under **More → Profile**.
- Each account gets a separate SQLite file. The first account to sign in after upgrading from a
  pre-accounts build adopts the existing on-device data; later accounts start empty.
- Sign-out keeps that account's unsynced changes on the device. Scheduled alerts are cancelled.
- Supabase: enable the Email provider (password) and add the redirect URL
  `pocketguard://auth/callback`. Set `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` and in the EAS production environment.

## Income and source-of-funds tracking

Open **More → Income** to add named Salary, Business, Rental, or Other income streams and record
income against them. In **Budget**, assign each monthly budget allocation to a source. New expenses
inherit the budget line's source by default, and **Add transaction** lets you choose a different
source or leave it unassigned. The Transactions screen and CSV exports show the source when one is
linked. Swipe left/right anywhere on the Income screen, or tap a month in the scrollable month strip, to
browse month-specific totals and income sources. **Add income** records income and can create a new
source in the same form. Fixed monthly income can be added as a plan with an expected payday; it appears
in each month from its start month and stays planned until you confirm it was received. Confirmation
adds one income transaction for that month. Use **Edit plan** to correct the scheduled amount or
payday; edit a received income entry to correct its amount, date, or note.

Source records, allocations, transactions, and recurring plans sync through Supabase after applying
the `supabase/migrations/20261104010000_income_streams.sql` and
`supabase/migrations/20261104020000_recurring_income.sql` migrations to the linked project.

## Currency

Settings → Currency lets you pick from about 95 world currencies. The first launch detects it from the phone's region (XAF if unknown); your choice is stored on the device. Only the label changes: existing amounts are **not converted**.

## Home dashboard

- The header has a mic (tap to start voice entry) next to **+**.
- Swipe the top card: Spending, Savings & goals (Week / Month / Year, default Month), Income vs spending, Net worth.
- **Where to focus** shows compact insight cards (forecast, funding gaps, safe daily spend, unusual entries, goals, debt, emergency runway, savings rate with 50/30/20, top categories). Tap one to see the working. Debt interest cost is not computed because no interest rate is stored.

## Insights and guidance

Open **More → Insights for you** for calendar Week, Month, 3 months, 6 months, and Year views, or
choose **Custom** to select a start and end date. Custom ranges compare against the same number of
days immediately before the selected range. The screen compares income and spending with the
matching elapsed portion of the previous period, breaks down spending by budget line and income by
source, and projects ongoing period-end income and spending after at least three elapsed days.
Completed custom ranges show actuals instead of projections. Budget figures are prorated for
partial months; six-month periods follow the calendar half-year (January–June or July–December).
Savings goals, debt, and loans are also summarized using current balances.

The question box uses cloud AI guidance when online and falls back to on-device, rule-based guidance
when offline or when the cloud service is unavailable. For a cloud answer, the question and a
summary of the selected period (totals, projections, budget-line and income-source names, and
current balances) are sent to the Supabase Edge Function and Anthropic. Raw transactions, notes,
and account identifiers are not sent. Cloud guidance is limited to 20 requests per signed-in user
per UTC day. Projections are pace estimates, not guarantees, and guidance is not professional
financial or business advice.

To enable cloud guidance, apply
`supabase/migrations/20261104030000_insights_advice_usage.sql`, set the server-side Anthropic
secrets as described in [`supabase/README.md`](./supabase/README.md), and deploy the
`insights-advice` Edge Function. Until then, the app continues to provide on-device guidance.

## Appearance

More → Settings → Appearance lets you pick **Device** (follow the phone), **Bright**, **Dark**, or **Day & night**, which switches to dark at a configurable night start time (default 19:00) and back to bright at the day start (default 06:00). The choice is stored on the device only.

On the Budget plan screen, **Funded by income** shows, for each income source, the money available this month (received plus fixed income not yet confirmed), what the linked budget lines deduct from it, what has been spent, and what is left, turning red when a source is over-allocated. Lines with no source fall under _Unassigned_.

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
