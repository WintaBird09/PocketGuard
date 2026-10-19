# Rules for the coding agent

- Read `PRD.md` before starting. If a task conflicts with the PRD, stop and ask.
- Money is integer XAF everywhere. Never use floats for money. Format only at the UI edge.
- Business logic lives in `src/domain/` as pure functions with unit tests. No React, no SQLite imports there.
- UI reads data via repository functions in `src/data/`; UI never writes raw SQL.
- Offline-first: every write goes to SQLite first, then the outbox. Never block UI on network.
- Every table has `id uuid` (client-generated), `household_id`, `created_at`, `updated_at`, `deleted_at`.
- Never store derived totals (spent, remaining, balances). Compute from transactions.
- Never put secrets in the app bundle or in git. `.env*` stays in `.gitignore`; keep an `.env.example`.
- Use the latest stable Expo SDK; when an API is uncertain, check current Expo/Supabase docs instead of guessing.
- After each task: run `npx tsc --noEmit`, lint, and tests; fix before moving on. Small commits, imperative messages.
- Do not add features beyond the current task. Phase 2 (SMS) and Phase 3 (family/SaaS/web) are out of scope.
