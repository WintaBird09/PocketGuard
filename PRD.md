# PRD — Pocket Guard (working title): Offline-first Personal Budget Enforcer

**Owner:** Hope Chenui · **Status:** Draft v1 · **Date:** 2026-10-18
**Audience:** AI coding agents (Claude Code, Cursor) and the owner. Read this fully before writing code. Build order lives in `TASKS.md`.

## Implementation conventions (locked in)
- This project lives in the app folder at `/Users/hopedev/Documents/CodeWorld/Nkabeh-ExpenceBudgetGoals-Tracker/app`.
- The approved design references live in `designs/Pocket Guard Hi-Fi Design.html`, the exported PNGs in `designs/Pocket Guard Hi-Fi Design-png/`, and the mobile UI mockups in `designs/mockup/`.
- Use the mockups in `designs/mockup/` as the working implementation reference for screen layout, component hierarchy, and flows in Epic 3 and any future UI work; when a requirement is ambiguous, match the mockup before inventing new UI patterns.
- Epic 3 mockup map: `1 First launch`, `2 Home dashboard`, `3 Add transaction`, `4 Blocked + override`, `5 Voice entry`, `6 Can I spend`, `7 Inbox`, `8 Transactions`, `9 Budget plan`, `10 Savings`, `11 Debts`, `12 More and settings`.
- Use NativeWind/Tailwind classes for screen layout and components wherever possible; only fall back to `StyleSheet` for edge cases that require dynamic values or native-only styling.
- Prefer reusable UI components and a shared `PageLayout` wrapper for all main screens.
- Screens follow a mobile-first layout with a single-column card system, rounded surfaces, and the green/amber/red state palette from the PRD.

---

## 1. Problem

The owner budgets well but fails at **recording and execution**. Spending is mostly via MTN Mobile Money (MoMo), funded by bank-to-MoMo withdrawals. Entries are forgotten because logging is effortful, so budget lines silently overrun (example: Fuel budgeted 80,000 XAF, actually spent 100,000–120,000 XAF). The current Excel workbook cannot fix this: its "Actual" columns are formulas that copy the planned numbers, and it needs a laptop to update.

## 2. Product vision

A **phone-first, offline-first Android app** that makes the budget *enforceable in the moment*:
1. Logging a spend takes seconds (tap or voice).
2. Before paying, the owner can ask "can I spend X on Fuel?" and get a clear yes/no.
3. Every spend is tied to a budget line, with live remaining balance and pace.
4. Savings goals are followed up until the owner confirms the money was actually saved.

Later: automatic capture of MoMo SMS (Phase 2), family/shared households and SaaS (Phase 3).

## 3. Goals and non-goals

### Goals (MVP = Phase 1)
- G1. Record any expense in under 10 seconds (manual) or one voice sentence.
- G2. Every expense belongs to a budget line; live status per line (planned / spent / remaining / % / days left / projected finish).
- G3. Hard stop + warnings on overspending (see §7.4 for exactly what "hard stop" means).
- G4. Daily 8:00 pm summary and threshold alerts, working offline.
- G5. Savings follow-up with an "I have saved" confirmation.
- G6. Debt tracking (Mom, Petra) with payment schedule and deadlines.
- G7. Works fully offline; syncs and backs up to the cloud when online.
- G8. Data model is multi-household from day one so SaaS later needs no rewrite.

### Non-goals for MVP
- No SMS or WhatsApp reading (Phase 2; WhatsApp is not planned at all).
- No web app / Next.js, no admin backend, no billing (Phase 3).
- No iOS build (code stays cross-platform, but only Android is tested).
- No bank/MoMo API integration; the app cannot move money or block a MoMo payment.
- No multi-currency. XAF only.

## 4. Users

- **Primary (now):** Hope Chenui, Android phone, English speaker, IT professional, Cameroon, MTN MoMo user.
- **Future:** family members sharing a household (Phase 3), then other individuals/households as SaaS customers.

## 5. Platform and stack (approved)

| Concern | Decision |
|---|---|
| App | Expo (React Native) + TypeScript (strict), Expo Router, **development build** (not Expo Go) |
| Local DB | SQLite via `expo-sqlite` + Drizzle ORM; **source of truth on device** |
| State | Zustand for UI state; SQLite queries for data (no duplicate caches) |
| Cloud | Supabase: Postgres, Auth, Row Level Security, one Edge Function |
| Sync | Simple outbox push + `updated_at` pull, last-write-wins, soft deletes |
| Voice | On-device speech-to-text (`expo-speech-recognition`) → Edge Function `parse-expense` → Claude API → structured JSON → user confirms |
| Notifications | `expo-notifications`, **local scheduled** notifications (no server) |
| Validation | Zod, shared between app and Edge Function |
| Tests | Vitest for pure logic (budget engine, parser, sync); Maestro or manual script for key flows |
| Not used | Next.js, custom Node backend, Firebase |

Notes for agents: use the latest stable Expo SDK at scaffold time and follow current Expo docs for config plugins and dev builds. Do not pin guesses from memory; check docs when an API is uncertain.

## 6. Core concepts

- **Household:** owner of all data. MVP has exactly one household and one member, but every row carries `household_id`.
- **Month:** calendar month by default. Setting `month_start_day` (default 1) allows salary-aligned months later.
- **Budget line:** a named bucket with a planned amount per month. Kinds: `running` (rent, fuel…), `fixed` (Mom meeting), `debt`, `savings`, `misc`.
- **Allocation:** planned amount for a line in a given month (needed because debt lines change month to month).
- **Transaction:** a recorded income, expense, or transfer. Expenses must reference a budget line.
- **Spend check:** a pure function answering "if I spend X on line L now, what happens?".
- **Savings commitment:** a planned amount per month toward a goal, closed only when the owner taps "I have saved".
- **XAF integers only:** store money as integer XAF (no decimals, no floats). Display as `120,000 XAF`.

## 7. Functional requirements (MVP)

### 7.1 Onboarding and seed data
- FR-1. First launch: sign in (email magic link or email+password via Supabase), create household, then offer **"Load my Sep–Dec 2026 plan"** (seed in §10).
- FR-2. All seed values are editable in the app afterwards.
- FR-3. App works without sign-in after first setup; sync starts when a session exists and network is available.

### 7.2 Budget lines and monthly plan
- FR-4. CRUD budget lines (name, kind, hard cap on/off, sort order, archive).
- FR-5. Planned amount per line per month (allocation), copy-forward from previous month.
- FR-6. A month view shows income, each line's planned vs spent, "unallocated / flexible" remainder, and total planned savings.
- FR-7. A **Miscellaneous** line exists by default (the owner's most common overrun) with its own cap.

### 7.3 Recording transactions
- FR-8. **Quick add:** amount (numeric keypad), line (recent/top lines as chips), optional note, date defaults to now. Save in ≤3 taps after entering the amount.
- FR-9. **Voice add:** one-tap mic button on the home screen. Examples:
  - "Spent 20,000 on fuel in Douala"
  - "Paid 5,000 car wash and 3,000 for airtime" (multiple items → multiple confirm cards)
  - "Can I spend 30,000 on fuel?" (intent = check; nothing is saved)
  - "I saved 92,000 to the kids account" (intent = savings confirmation)
- FR-10. The app **always shows a confirm card** (amount, line, note, date) before saving a voice entry. Low-confidence line match is highlighted for correction.
- FR-11. **Offline voice:** if the parse service is unreachable, store the raw transcript as a *pending draft*, show it in an Inbox, and parse automatically when online. The owner can also classify it manually.
- FR-12. Edit and delete (soft delete) any transaction. Editing re-runs budget calculations.
- FR-13. Income can be recorded (salary). Transfers (bank → MoMo) are recorded as `transfer` and **do not count as spending**; they exist so the owner can reconcile cash on hand.
- FR-14. Inbox screen lists pending voice drafts and unassigned items.

### 7.4 Spend check and hard stop (important semantics)
The app cannot block a MoMo payment. "Hard stop" is implemented as:
- FR-15. **Pre-payment check** (button "Can I spend?" and voice intent): input amount + line → result is one of
  - `OK` (shows remaining after),
  - `WARN` (would cross the warning threshold, default 80%, or exceed the projected pace),
  - `BLOCKED` (would exceed the line's remaining planned amount).
- FR-16. **Blocked entries:** if a line has `hard_cap = true` and a transaction would exceed its remaining planned amount, saving requires an explicit **override**: type a reason and pass biometric/PIN. Overrides are stored (`override_reason`) and shown in a "Overrides" report. The app does not silently allow overspend.
- FR-17. Lines with `hard_cap = false` only warn. Default: all `running` and `misc` lines are hard-capped; `fixed`, `debt`, `savings` are not.
- FR-18. Month view shows a red state for any line over budget, with the overspend amount.

Spend check algorithm (pure function, unit-tested):
```
remaining = planned(line, month) - spent(line, month)
after = remaining - amount
if after < 0            -> BLOCKED (if hard_cap) or WARN (if not)
pct_after = (spent + amount) / planned
if pct_after >= warn_threshold -> WARN
projected = spent / days_elapsed * days_in_month   (min 3 days of data)
if projected > planned  -> WARN (pace warning)
else OK
```

### 7.5 Dashboard
- FR-19. Home shows: month progress (days left), per-line progress bars (green <80%, amber 80–100%, red >100%), total spent vs planned, cash flow (income − expenses), savings progress toward the 2,000,000 XAF goal, debt remaining.
- FR-20. Each line shows "**X% used, N days left, at this pace you finish at Y**".
- FR-21. Status banner mirrors the workbook logic: ON TRACK / BEHIND for the savings goal, using *actual confirmed* savings versus the plan.

### 7.6 Alerts (all local notifications, work offline)
- FR-22. **Daily summary at 20:00** local time: spent today, biggest line movements, lines ≥80%, tomorrow's due items. Time is configurable.
- FR-23. **Threshold alerts** when a line crosses 50%, 80%, 100% (fires at save time and on app start).
- FR-24. **Pace alert**: "Fuel 85% used, 10 days left" when usage % exceeds elapsed-month % by a configurable margin (default 20 points).
- FR-25. **Savings reminder** on configured days until the commitment is confirmed.
- FR-26. **Debt reminder** 7 and 2 days before a deadline.
- FR-27. Notifications are scheduled/rescheduled on every data change, using Android exact-alarm rules per current Expo docs; degrade gracefully if exact alarms are denied.

### 7.7 Savings follow-up
- FR-28. Savings goal (seed: 2,000,000 XAF by 31 Dec 2026, "kids savings counts toward target = YES").
- FR-29. Each month has savings commitments (kids account transfer, flexible extra save). Each shows `planned` and `saved`.
- FR-30. Button **"I have saved"** records the amount (default = planned, editable) with a timestamp, and updates goal progress. Unconfirmed commitments after the due date show as overdue and trigger the reminder.
- FR-31. The Savings screen shows the gap analysis: projected total if the plan is followed vs. goal, and the shortfall.

### 7.8 Debt tracker
- FR-32. Debts with creditor, original amount, deadline, schedule per month. Payments are transactions tagged to the debt; balance is derived (never typed in).
- FR-33. Status: OPEN / PAID / OVERDUE derived from balance and deadline.

### 7.9 Sync and backup
- FR-34. Offline-first: all reads/writes hit SQLite. A background sync runs on app start, on connectivity regain, and after writes (debounced).
- FR-35. Push: send outbox rows (upsert by client-generated UUID). Pull: fetch rows where `updated_at > last_pull_at` per table. Conflict rule: last write wins by `updated_at` (server timestamp on push).
- FR-36. Deletes are soft (`deleted_at`) and sync like any update.
- FR-37. A visible sync indicator (synced / pending N / offline / error).
- FR-38. Export all data to CSV (transactions, lines, allocations) from Settings.

### 7.10 Security and privacy
- FR-39. Optional app lock (biometric/PIN), required for overrides.
- FR-40. Row Level Security on every table: a user only accesses rows whose `household_id` belongs to them.
- FR-41. The Anthropic API key exists **only** as a Supabase secret, never in the app bundle.
- FR-42. The Edge Function receives only the transcript, the list of line names/ids, today's date and timezone. No account numbers, phone numbers, or balances.
- FR-43. Never log amounts or transcripts to third-party analytics. No analytics in MVP.

## 8. Voice parsing contract

**Edge Function:** `POST /functions/v1/parse-expense` (JWT required)

Request:
```json
{
  "transcript": "spent twenty thousand on fuel yesterday",
  "lines": [{"id": "uuid", "name": "Fuel"}, {"id": "uuid", "name": "Household Feeding"}],
  "today": "2026-10-18",
  "timezone": "Africa/Douala"
}
```
Response (validated with Zod on both sides):
```json
{
  "items": [
    {
      "intent": "log_expense | check_spend | log_income | confirm_saving | unknown",
      "amount_xaf": 20000,
      "line_id": "uuid | null",
      "line_guess_name": "Fuel",
      "note": "fuel",
      "date": "2026-10-17",
      "confidence": 0.0
    }
  ]
}
```
Rules: amounts are integers in XAF ("20k", "twenty thousand", "20,000" all → 20000); unknown or ambiguous line → `line_id: null` (never invent a line); relative dates resolved against `today`; temperature 0; max 60 calls/user/day; request timeout 10 s then client falls back to offline draft. The model name is an environment variable (`ANTHROPIC_MODEL`), not hard-coded.

## 9. Data model (SQLite mirrors Postgres)

All tables: `id uuid pk (client-generated)`, `household_id uuid`, `created_at`, `updated_at`, `deleted_at null`, `device_id`. Amounts are `integer` XAF. Dates are ISO strings in UTC, month keys are `YYYY-MM`.

- `households(id, name, month_start_day default 1, currency default 'XAF')`
- `household_members(id, household_id, user_id, role)` — one row in MVP
- `budget_lines(id, name, kind, hard_cap, sort_order, archived)`
- `allocations(id, line_id, month, planned_amount)` — unique (line_id, month)
- `transactions(id, occurred_at, amount, direction 'expense|income|transfer', line_id null, debt_id null, note, source 'manual|voice|sms', raw_text null, status 'confirmed|draft', override_reason null)`
- `debts(id, creditor, original_amount, deadline null, note)`
- `savings_goals(id, name, target_amount, due_date, include_kids_savings bool)`
- `savings_commitments(id, goal_id, line_id, month, planned_amount, saved_amount null, saved_at null)`
- `settings(id, key, value)` — summary time, thresholds, pace margin
- `sync_state(table_name pk, last_pull_at)` (local only)
- `outbox(id, table_name, row_id, op, created_at)` (local only)
- Phase 2 (create later, not now): `payee_rules(id, payee_key, line_id)`, `sms_messages(...)`

Derived values are computed from queries (spent per line per month, debt balance, goal progress); **never store derived totals**.

## 10. Seed data (from the owner's workbook, Sep–Dec 2026)

Income: net salary **1,092,000 XAF/month**.

| Line | Kind | Sep | Oct | Nov | Dec | Hard cap |
|---|---|---|---|---|---|---|
| Rent | running | 107,500 | 107,500 | 107,500 | 107,500 | no (fixed in practice) |
| Kids Feeding (Kayden & Liam) | running | 40,000 | 40,000 | 40,000 | 40,000 | yes |
| Health | running | 40,000 | 40,000 | 40,000 | 40,000 | yes |
| Internet | running | 30,000 | 30,000 | 30,000 | 30,000 | no |
| Electricity | running | 15,000 | 15,000 | 15,000 | 15,000 | yes |
| Fuel | running | 120,000 | 120,000 | 120,000 | 120,000 | yes |
| Household Feeding | running | 80,000 | 80,000 | 80,000 | 80,000 | yes |
| Supplies | running | 20,000 | 20,000 | 20,000 | 20,000 | yes |
| Cleaner | running | 25,000 | 25,000 | 25,000 | 25,000 | no |
| Car Wash | running | 5,000 | 5,000 | 5,000 | 5,000 | yes |
| Miscellaneous (new) | misc | 30,000 | 30,000 | 30,000 | 30,000 | yes |
| Mom Meeting (Njangi) | fixed | 100,000 | 100,000 | 100,000 | 100,000 | no |
| Kids Account Savings | savings | 92,000 | 92,000 | 92,000 | 92,000 | no |
| Debt – Mom | debt | 150,000 | 150,000 | 0 | 0 | no |
| Debt – Petra | debt | 0 | 0 | 115,000 | 115,000 | no |

Debts: Mom 300,000 (deadline 2026-11-30), Petra 230,000 (flexible).
Goal: 2,000,000 XAF by 2026-12-31; kids savings counts toward the goal; starting balance 0.

Open data items for the owner to confirm (do not block the build; seed and let the owner edit):
1. **Rent:** the Budget sheet says 107,500 but the Expenses sheet says 105,000. Seed uses 107,500.
2. **Miscellaneous 30,000/month** is a placeholder; it comes out of the flexible savings.
3. **Goal gap:** with the workbook's own numbers (no Misc line), planned savings are 359,500 (Sep), 359,500 (Oct), 394,500 (Nov), 394,500 (Dec) = **1,508,000**, which is **492,000 short** of 2,000,000. Adding Misc widens the gap by 120,000. The app must show this honestly on the Savings screen; it is not a bug.
4. **Mom Meeting / Njangi** is a rotating savings group: if the payout comes back to the owner, it may legitimately count toward savings. Out of scope for MVP; treat as an expense/commitment.
5. Transactions already recorded in the workbook (Sep–Oct) can be imported once as a one-time script (optional task).

## 11. Screens (MVP)

1. **Home / Dashboard** — month header, savings progress ring, line list with bars, big buttons: `+ Add`, `🎤 Voice`, `Can I spend?`.
2. **Add transaction** — keypad, line chips, note, date, save; override flow when blocked.
3. **Voice sheet** — listening state, transcript, confirm card(s).
4. **Inbox** — pending voice drafts and unclassified items.
5. **Transactions** — list by month, filter by line, edit/delete.
6. **Budget** — month plan, allocations per line, copy forward.
7. **Savings** — goal progress, monthly commitments with "I have saved", gap analysis.
8. **Debts** — balances, schedule, payment history, status.
9. **Settings** — sign-in/sync status, notification times and thresholds, app lock, CSV export, seed reload.

UX principles: one-handed use; large numbers; amounts always `120,000 XAF`; light and dark themes; no tables on phone; the most-used action (add) is always reachable in one tap.

## 12. Non-functional requirements

- NFR-1. Cold start to usable home screen < 2 s on a mid-range Android phone with 1,000 transactions.
- NFR-2. All core flows work in airplane mode.
- NFR-3. No data loss on app kill: every write is a committed SQLite transaction before UI confirms.
- NFR-4. Sync is idempotent (re-sending the same outbox row is safe).
- NFR-5. Accessibility: tap targets ≥48 dp, contrast AA, supports system font scaling.
- NFR-6. All monetary logic lives in a pure, unit-tested module (`src/domain/`), no UI imports.
- NFR-7. Timezone: store UTC, compute months in the user's timezone (default `Africa/Douala`).

## 13. Success metrics (personal use, first 60 days)

- ≥90% of days with at least one recorded transaction.
- ≥80% of MoMo spending recorded within 24 h.
- No budget line exceeds its cap without a logged override.
- Savings commitments confirmed on time each month.
- Time to add an expense (median) < 10 s manual, < 15 s voice.

## 14. Roadmap

- **Phase 1 (MVP):** everything in §7.
- **Phase 2 — SMS capture:** `READ_SMS`/receiver permission via a small native Android module (Expo config plugin + Kotlin), on-device regex parser for MTN MoMo messages, payee → line memory (`payee_rules`): first time ask "What was this for?", then auto-categorize. SMS content is parsed on device and never sent to a server. Needs 15–20 sample MoMo messages (names and numbers redacted) from the owner. Also reconcile with the pre-payment check ("this payment bypassed the check").
- **Phase 3 — Family and SaaS:** invites and shared households (RLS already supports), roles, web dashboard (Next.js then, not now), subscription billing, Play Store release, privacy policy.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Owner stops logging | Voice + daily 8 pm nudge + Inbox; Phase 2 SMS capture |
| Play Store restricts SMS permissions | Personal sideloaded build is fine; for the public release use the notification-listener approach or apply for the permission exception, decided in Phase 2 |
| Android battery optimisation kills notifications | Onboarding step to exempt the app; fall back to checks on app open |
| Voice misparse | Mandatory confirm card; confidence highlight; correction flow |
| Sync conflicts with a second device | Last-write-wins is acceptable single-user; revisit with PowerSync in Phase 3 |
| Cost of LLM calls | One short call per voice entry, daily cap per user |

## 16. Acceptance (MVP done when)

1. Fresh install on an Android phone, airplane mode on: seed the plan, add 10 expenses (manual and voice-draft), see correct bars and a daily summary notification at the set time.
2. Go online: voice drafts parse into confirm cards; data appears in Supabase; reinstall + sign in restores everything.
3. Fuel at 100% with `hard_cap` on: saving another expense is refused until an override with reason + biometric is entered; the override appears in the report.
4. "Can I spend 30,000 on fuel?" returns OK / WARN / BLOCKED correctly against the numbers.
5. "I have saved" updates goal progress and stops the reminder.
6. Debt balances derive from payments; Mom shows OVERDUE after 2026-11-30 if unpaid.
7. All pure-logic unit tests pass; `tsc --noEmit` and lint are clean.
