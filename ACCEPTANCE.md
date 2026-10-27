# Acceptance checklist

This checklist records implementation evidence separately from checks that require the owner's device, live Supabase project, or original workbook. A code-level pass is not a substitute for those checks.

## PRD §16 acceptance items

- [ ] **1. Offline Android flow:** fresh install, airplane mode, seed the plan, add 10 manual and voice-draft expenses, verify dashboard bars, and receive the daily summary at the configured time. Device-only.
- [ ] **2. Online sync and restore:** reconnect, confirm voice drafts become review cards, verify records in Supabase, then reinstall and restore after sign-in. Requires device and live Supabase access; no remote changes were made during this work.
- [ ] **3. Hard-cap override:** at 100% fuel usage with `hard_cap` enabled, verify another expense is blocked until a reason and device authentication are supplied, and confirm the override is reported. Device-only.
- [ ] **4. Can-I-spend:** verify OK, WARN, and BLOCKED results against the corresponding budget values. Manual/device walkthrough pending.
- [ ] **5. Savings confirmation:** verify saving a commitment updates goal progress and stops its reminder. Manual/device walkthrough pending.
- [ ] **6. Debt status:** verify payment-derived balances and Mom's overdue status after 2026-11-30 when unpaid. Manual/device walkthrough pending.
- [x] **7. Automated quality checks:** TypeScript typecheck, ESLint, and unit tests pass; see verification notes below.

## Epic 8 implementation checks

- [x] App lock preference is local-only; biometric/device-passcode authentication is shared with spend overrides.
- [ ] Verify app lock on a physical Android device, including background/resume and cancellation behavior.
- [x] CSV builders cover transactions, budget lines, allocations, loans, and loan repayment history; formula-leading text is escaped.
- [ ] Verify native share-sheet export on a physical device.
- [x] Workbook importer unit tests cover incomplete rows, idempotency/outbox writes, unmapped categories, and header validation.
- [ ] Run the importer against the owner's original workbook and a copy of the intended SQLite database.
- [x] Data-backed screens have loading and error feedback, with empty states where the collection can be empty.
- [x] Common app controls and editable fields use at least 48 dp minimum heights; system font scaling is not disabled.
- [x] Dashboard snapshot test seeds 1,000 transactions and checks the PRD's 2-second budget on the test runner.
- [ ] Measure cold-start-to-home on a mid-range Android device with 1,000 transactions; the unit test is not a device benchmark.
- [x] Development date override is persisted locally on native development builds and uses the shared local-date helper.
- [ ] Walk through month rollover, pace alerts, and overdue debt on a development device.

## Verification performed

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `python3 -m unittest scripts/test_import_workbook_transactions.py`

No migration was applied and no live Supabase data was changed. The device and source-workbook checks above remain outstanding.

## Epic 9 — Personal release

- [x] EAS production profile prepared for an internally distributed APK using EAS-managed credentials.
- [x] Android application ID set to `com.nkabeh.pocketguard`; display name and icon are configured in `app.json`.
- [x] Release, install, battery, backup/restore, and two-week review instructions documented in `README.md`.
- [ ] Link the owner's Expo account/project, configure the production EAS environment, and complete an EAS Android production build.
- [ ] Install the APK on the owner's phone, verify app name/icon and core flows, configure battery use, and complete one real week.
- [ ] Owner verifies synced data in the live Supabase project and completes a clean reinstall/restore check. Loans and device-local settings are excluded from cloud backup.
- [ ] After two weeks, record the PRD §13 metrics, top five annoyances, and a Phase 2 decision. Do not begin Phase 2 without owner approval.
