# TASKS — Pocket Guard MVP build plan (from setup to release)

Companion to `PRD.md`. Work top to bottom. Each task is small enough for one agent session, has a **Done when** check, and should end with a commit. Tasks marked 👤 need the owner (accounts, keys, device); the agent must stop and ask rather than guess.

## Rules for the coding agent (copy into `CLAUDE.md` / `.cursor/rules` in Task 1.3)

- Read `PRD.md` before starting. If a task conflicts with the PRD, stop and ask.
- Money is **integer XAF** everywhere. Never use floats for money. Format only at the UI edge.
- Business logic lives in `src/domain/` as pure functions with unit tests. No React, no SQLite imports there.
- UI reads data via repository functions in `src/data/`; UI never writes raw SQL.
- Use NativeWind/Tailwind for layout and styling across screens; prefer reusable components over inline `StyleSheet` blocks.
- Use a shared `PageLayout` wrapper for app pages and keep card-based layout patterns consistent with the approved design files in `designs/`, especially the UI mockups in `designs/mockup/`.
- Offline-first: every write goes to SQLite first, then the outbox. Never block UI on network.
- Every table has `id uuid` (client-generated), `household_id`, `created_at`, `updated_at`, `deleted_at`.
- Never store derived totals (spent, remaining, balances). Compute from transactions.
- Never put secrets in the app bundle or in git. `.env*` stays in `.gitignore`; keep an `.env.example`.
- Use the latest stable Expo SDK; when an API is uncertain, check current Expo/Supabase docs instead of guessing.
- After each task: run `npx tsc --noEmit`, lint, and tests; fix before moving on. Small commits, imperative messages.
- Do not add features beyond the current task. Phase 2 (SMS) and Phase 3 (family/SaaS/web) are out of scope.

---

## EPIC 0 — Prerequisites (owner)

- **0.1 👤 Accounts:** GitHub, Expo (expo.dev), Supabase, Anthropic API (console). Free tiers are enough to start.
- **0.2 👤 Dev machine:** Node.js LTS, Git, Android Studio (SDK + emulator) or a USB-debuggable Android phone with Developer Options enabled.
- **0.3 👤 Keys:** Supabase project URL + anon key + service role key (service key only in Supabase secrets, never in the app); Anthropic API key (only as Supabase secret).
- **Done when:** the owner can run `node -v`, `git --version`, `adb devices` (shows the phone/emulator).

## EPIC 1 — Project setup

- **1.1 Scaffold:** create the Expo TypeScript app with Expo Router (`npx create-expo-app@latest`), strict TS, path alias `@/`. Remove template demo screens.
  *Done when:* app boots on Android emulator/device showing a blank Home screen.
- **1.2 Dev build:** add `expo-dev-client`; produce an Android development build (local `npx expo run:android` or EAS Build). Needed because speech recognition and later SMS use native code.
  *Done when:* the dev build installs on the phone and hot-reloads.
- **1.3 Tooling and rules:** ESLint + Prettier, Vitest, `.gitignore`, `.env.example`, and a `CLAUDE.md` containing the "Rules for the coding agent" above. Add npm scripts: `typecheck`, `lint`, `test`.
  *Done when:* `npm run typecheck && npm run lint && npm test` all pass on an empty project.
- **1.4 Folder structure:**
  ```
  app/                 Expo Router screens
  src/domain/          pure logic (money, budget engine, spend check, dates)
  src/data/            Drizzle schema, repositories, migrations, seed
  src/sync/            outbox, push, pull
  src/voice/           STT wrapper + parse client
  src/notifications/   scheduling
  src/ui/              components, theme
  supabase/            migrations, functions, seed
  ```
  *Done when:* folders exist with a README line each; imports via `@/` work.
- **1.5 Theme and base UI:** colours (green/amber/red states), typography, light/dark, `Money` text component (`120,000 XAF`), `Button`, `Card`, `ProgressBar`, `Screen`.
  *Done when:* a storybook-style demo screen shows all components in both themes.
- **1.6 Navigation shell:** bottom tabs: Home, Transactions, Budget, Savings, More (Debts, Inbox, Settings). Floating `+ Add` and 🎤 buttons on Home.
  *Done when:* all tabs navigate; placeholders render.

## EPIC 2 — Local database and domain logic (no UI yet)

- **2.1 Money and date utils (`src/domain/money.ts`, `dates.ts`):** `formatXAF`, `parseAmountInput` (handles `20k`, `20,000`, `20 000`), month key helpers in `Africa/Douala`, days elapsed/remaining.
  *Done when:* unit tests cover edge cases (month ends, leap year, DST-free zone, empty/negative input).
- **2.2 Schema + migrations (`src/data/schema.ts`):** Drizzle tables per PRD §9 (households, household_members, budget_lines, allocations, transactions, debts, savings_goals, savings_commitments, settings, sync_state, outbox). Migration runner on app start.
  *Done when:* app launches and creates the DB; a test inserts and reads each table.
- **2.3 Repositories (`src/data/repos/*`):** typed functions: `lines.list/create/update/archive`, `allocations.set/get/copyForward`, `transactions.add/update/softDelete/listByMonth`, `debts.*`, `savings.*`, `settings.get/set`. Every write also appends to `outbox` inside the same SQLite transaction.
  *Done when:* tests prove a write creates both the row and an outbox entry atomically.
- **2.4 Budget engine (`src/domain/budget.ts`):** pure functions: `lineStatus(planned, spent, daysElapsed, daysInMonth)` → `{remaining, pctUsed, state, projectedFinish}`; `monthSummary`; `savingsProgress`; `debtBalance`.
  *Done when:* table-driven tests cover: zero planned, over budget, first 2 days (no projection), month rollover.
- **2.5 Spend check (`src/domain/spendCheck.ts`):** implements PRD §7.4 algorithm → `OK | WARN | BLOCKED` with reason text and remaining-after.
  *Done when:* tests include the Fuel example (planned 120,000, spent 100,000, check 30,000 → BLOCKED if hard cap, WARN otherwise).
- **2.6 Alert rules (`src/domain/alerts.ts`):** pure functions returning which alerts should exist for a given state (threshold 50/80/100, pace alert, savings due, debt due, daily summary content).
  *Done when:* tests assert exact notification titles/bodies for sample states.
- **2.7 Seed (`src/data/seed.ts`):** function `loadPlanSep2026()` from PRD §10 (lines, allocations for Sep–Dec, debts, goal, commitments). Idempotent.
  *Done when:* running it twice gives the same row counts; computed Sep planned savings = 359,500 and total planned = 1,508,000 (the shortfall figure 492,000 must be reproducible from the engine).

## EPIC 3 — Core screens (manual flow)

- UI mockup reference: the working visual specs for the app screens live in `designs/mockup/` and should be used as the source of truth for layout, hierarchy, and interaction details throughout Epic 3 and any future UI work. When a requirement is ambiguous, match the mockup first and use the HTML/PNG design exports as supporting references.
- Mockup map for Epic 3 and future screens: `1 First launch`, `2 Home dashboard`, `3 Add transaction`, `4 Blocked + override`, `5 Voice entry`, `6 Can I spend`, `7 Inbox`, `8 Transactions`, `9 Budget plan`, `10 Savings`, `11 Debts`, `12 More and settings`.

- **3.1 Onboarding stub:** first-run creates a household locally (no auth yet) and offers "Load my Sep–Dec plan" (calls 2.7).
  *Done when:* fresh install → seeded → Home shows data.
- **3.2 Home dashboard:** month header, per-line progress bars from the budget engine, totals, savings ring, debt remaining, status banner (PRD FR-19–21).
  *Done when:* numbers match a hand calculation for seeded data and a few test transactions.
- **3.3 Add transaction screen:** keypad, line chips (recent first), note, date, save. Uses spend check before saving; WARN shows a confirm dialog.
  *Done when:* adding a 20,000 Fuel expense updates Home immediately, in airplane mode.
- **3.4 Hard stop + override:** when `BLOCKED` and line `hard_cap`, require reason + app-lock auth (`expo-local-authentication`); store `override_reason`; "Overrides" list in Settings.
  *Done when:* cannot save an over-cap expense without reason + auth; override appears in the list.
- **3.5 "Can I spend?" sheet:** input amount + line → shows result and remaining-after; nothing is saved.
  *Done when:* matches spend-check tests for 5 scenarios.
- **3.6 Transactions list:** month filter, line filter, edit, soft delete with undo.
  *Done when:* edit/delete recalculates Home; deleted rows never appear.
- **3.7 Budget screen:** edit allocations per line per month, copy-forward, add/archive lines, toggle hard cap, show unallocated/flexible remainder.
  *Done when:* changing Fuel's December plan changes Home for December only.
- **3.8 Savings screen:** goal progress, monthly commitments, **"I have saved"** button (default planned amount, editable), gap analysis (projected vs target).
  *Done when:* tapping the button updates goal progress and the commitment's saved state.
- **3.9 Debts screen:** list, schedule, payment history; payments are transactions tagged to a debt; balance derived; OVERDUE logic.
  *Done when:* recording 150,000 to Mom reduces her balance to 150,000.
- **3.10 Income and transfers:** record salary (income) and bank→MoMo transfers (`transfer`, excluded from spend).
  *Done when:* transfers never change any line's "spent".

## EPIC 4 — Notifications

- **4.1 Permissions and channels:** request notification permission (Android 13+), create channels (daily, alerts, reminders), onboarding card for battery-optimisation exemption.
  *Done when:* a test notification appears from Settings.
- **4.2 Scheduler (`src/notifications/schedule.ts`):** cancels and reschedules all notifications from `domain/alerts` output on app start and after every data change (debounced).
  *Done when:* changing data re-plans notifications; no duplicates (verify by listing scheduled ones).
- **4.3 Daily 8 pm summary:** content from PRD FR-22; time configurable in Settings.
  *Done when:* fires at the set time on a real device with the app closed (set it 2 minutes ahead to test).
- **4.4 Threshold + pace alerts:** immediate local notification on save when a threshold is crossed; pace alert evaluated daily at 08:00 and at summary time.
  *Done when:* adding expenses that cross 80% and 100% each fire exactly one notification.
- **4.5 Savings and debt reminders:** per PRD FR-25/26.
  *Done when:* an unconfirmed commitment past due triggers a reminder; confirming cancels it.

## EPIC 5 — Supabase backend and auth

- **5.1 Supabase project setup 👤→agent:** init `supabase/` folder (CLI), link project, write SQL migrations that mirror the SQLite schema (PRD §9) with `household_id` on all tables.
  *Done when:* `supabase db push` succeeds; tables visible.
- **5.2 Row Level Security:** enable RLS on every table; policy: row's `household_id` must be in the caller's `household_members`. Add a SQL test or script that proves user A cannot read user B's rows.
  *Done when:* the cross-user test fails to read/write as expected.
- **5.3 Auth in app:** Supabase client with secure storage for the session, email magic link or email+password screen, sign-out. App remains fully usable when signed out.
  *Done when:* sign in works; killing/reopening keeps the session; offline launch works signed in.
- **5.4 Household bootstrap:** on first sign-in, create `households` + `household_members` row server-side (RPC or trigger) and map the existing local household id to it.
  *Done when:* local data re-keys cleanly to the server household without losing rows.

## EPIC 6 — Sync

- **6.1 Push:** read `outbox`, upsert rows to Supabase by `id`, mark sent, retry with backoff, idempotent.
  *Done when:* creating a transaction offline, then going online, shows it in Supabase exactly once.
- **6.2 Pull:** per table, fetch `updated_at > last_pull_at`, apply last-write-wins, handle `deleted_at`, update `sync_state`.
  *Done when:* editing a row in the Supabase dashboard appears on the phone after sync.
- **6.3 Triggers and indicator (done):** run sync on app start, connectivity regain (`@react-native-community/netinfo`), after writes (debounced). Show status: synced / N pending / offline / error.
  *Done when:* airplane mode on/off cycle drains the outbox and indicator reflects it.
- **6.4 Restore test (automated test done):** clean-database restore test covers every currently synced table, row counts, references, and soft-deleted rows. Loans remain excluded until Task 10.4; the physical uninstall/reinstall check remains device-only.
  *Done when:* row counts per table match before/after.
- **6.5 Sync unit tests (done):** tests cover duplicate/idempotent push, out-of-order pull, and delete-restore-edit push behavior.
  *Done when:* tests pass.

## EPIC 7 — Voice entry

- **7.1 Speech-to-text wrapper (`src/voice/stt.ts`):** use `expo-speech-recognition` (dev build), English, microphone permission flow, start/stop, partial results. Prefer on-device recognition when available.
  *Done when:* saying "twenty thousand on fuel" shows the transcript on screen in airplane mode (if on-device model is installed) or online.
- **7.2 Edge Function `parse-expense`:** Deno function per PRD §8: verify JWT, Zod-validate input/output, call Claude with a system prompt and a structured-output/tool schema, temperature 0, 10 s timeout, per-user daily cap (60), model from `ANTHROPIC_MODEL` secret. Key stored via `supabase secrets set`.
  *Done when:* `curl` with a sample body returns valid JSON; invalid JWT → 401; oversize body → 400.
- **7.3 Parser tests:** a fixture file of ≥25 phrases (e.g. "20k fuel", "paid 5,000 car wash and 3,000 airtime", "can I spend 30000 on fuel", "I saved 92,000 for kids", "yesterday spent 13k on outing with Desmond") with expected output; run against the function manually and record accuracy.
  *Done when:* ≥90% of fixtures parse to the right amount and intent; ambiguous lines return `line_id: null`.
- **7.4 Voice sheet UI:** mic button → listening → transcript → confirm card(s) (editable amount/line/note/date) → Save / Discard. Intent routing: `log_expense` → add, `check_spend` → show result only, `confirm_saving` → mark commitment saved, `log_income` → add income.
  *Done when:* end-to-end voice expense lands in Transactions with `source = 'voice'` and the raw transcript.
- **7.5 Offline drafts + Inbox:** when parse fails or offline, store a `draft` transaction with `raw_text`; Inbox lists drafts; when online, auto-parse and prompt "3 voice notes ready to confirm".
  *Done when:* record in airplane mode → disable airplane mode → draft turns into a confirm card.

## EPIC 8 — Hardening and polish

- **8.1 App lock:** optional biometric/PIN on open and for overrides.
- **8.2 CSV export:** transactions, lines, allocations via share sheet.
- **8.3 Optional import of existing workbook transactions:** one-time script that reads the Sep–Oct `Transactions` sheet rows into the DB (skip rows with no amount/category).
- **8.4 Empty/error states:** every screen has loading, empty, error.
- **8.5 Accessibility and performance pass:** tap targets ≥48 dp, font scaling, 1,000-transaction seed test (NFR-1).
- **8.6 Time-travel debug tool (dev only):** override "today" to test month rollover, pace alerts, overdue debt.
  *Done when (Epic 8):* PRD §16 acceptance items 1–7 are walked through and checked off in a `ACCEPTANCE.md`.

## EPIC 9 — Release (personal)

- **9.1 Production Android build** (EAS or local release APK/AAB), app icon, name, package id.
- **9.2 Install on the owner's phone**, disable battery optimisation for the app, run one real week of use.
- **9.3 Backup check:** confirm Supabase has the data; document restore steps in `README.md`.
- **9.4 Review:** after 2 weeks compare metrics (PRD §13), list top 5 annoyances, decide Phase 2 start.

## EPIC 10 — Loans (money lent to others; see PRD §7.8b)

Approved by the owner, to be done **before Task 6.3**. Rules: no change to finished Epics 1–6.2 behaviour; new tables only; ask before each task; one task at a time with typecheck, lint, all tests and a short summary.

- **10.0 Impact audit (done):** no code changes; sync lists in `src/sync/push.ts`/`pull.ts` are hard-coded; notification kinds live in `scheduler.ts`; `expo-contacts` is not installed.
- **10.1 Update PRD and TASKS (done).**
- **10.2 Local tables:** `loans`, `loan_installments`, `loan_payments` via a new migration (new tables only, existing tables untouched).
  *Done when:* migration applies on a fresh and an existing database and schema tests pass.
- **10.3 Supabase migration + RLS:** same three tables, RLS, own-household policies, `anon` revoked. Ask before `supabase db push`.
  *Done when:* extended `verify_rls.sql` passes (owner runs it).
- **10.5 Status engine and installment generator:** pure functions for derived balance and status (Pending / Partial / Complete / Overdue / Written off) and installment schedules (single, N monthly, flexible).
  *Done when:* unit tests cover every status and edge date.
- **10.6 Repositories:** create/update loan, record repayment, write-off, per-person summary; every write appends an outbox row.
  *Done when:* tests pass, including overpayment rejection.
- **10.7 Contact picker:** `expo-contacts` on request, with manual name/phone fallback (and on web). Needs a dev-build rebuild (device-only check).
- **10.8 Loans list screen** and a Loans row in More (small edit to More).
- **10.9 Add/edit loan form:** date, person, amount, plan, deadline; optional Lending line check (E4, off by default).
- **10.10 Loan detail:** repayments, write-off, per-person summary, WhatsApp "Send reminder" link.
- **10.11 Reminders (done):** `loan_due` alert kind (7d, 2d, due day, weekly overdue) added to the Epic 4 scheduler without changing existing alerts. Reminders are future-dated at 09:00 and rebuilt on every refresh; a reminder whose time has passed is skipped, never fired late.
- **Postponed:** 10.4 sync push/pull for loan tables (after 6.3–6.5), 10.12 "Owed to you" Home tile, 10.13 loan rows in Activity, 10.14 voice (with Epic 7), 10.15 CSV export and acceptance (with Epic 8).

---

## Phase 2 backlog — SMS capture (do not start until the owner asks)

- P2.1 👤 Collect 15–20 redacted MTN MoMo SMS samples (payments, withdrawals, deposits, fees, airtime).
- P2.2 Parser in `src/domain/momoParser.ts` (regex, unit-tested against samples; amount, fee, counterparty, balance, txn id, date).
- P2.3 Native Android module / config plugin for SMS receiver + permission flow; messages processed on-device only.
- P2.4 `payee_rules` table + "What was this for?" prompt on first-seen payee, automatic categorisation next time.
- P2.5 De-duplicate against manually/voice-entered transactions (amount + time window).
- P2.6 Reconcile screen: payments that bypassed the pre-payment check.
- P2.7 Decide Play Store route for SMS permission vs notification-listener alternative before any public release.

## Phase 3 backlog — Family and SaaS

- P3.1 Invite flow and roles on `household_members`; shared household sync.
- P3.2 Consider PowerSync for multi-device conflict handling.
- P3.3 Web dashboard (Next.js) reading the same Supabase schema.
- P3.4 Subscription billing, privacy policy, terms, Play Store listing.
- P3.5 Observability (privacy-safe), support tooling, data export/delete requests.

---

## Suggested session prompts for the agent

1. "Read PRD.md and TASKS.md. Execute Epic 1 tasks 1.1–1.3 only. Stop after the Done-when checks pass and summarise."
2. "Execute Epic 2 (2.1–2.7) with tests first. Do not touch UI."
3. "Execute 3.1–3.3, then run on the emulator and report what you verified."
4. Continue epic by epic; after each, ask the agent to list anything in the PRD it deviated from.
