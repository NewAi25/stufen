# Changelog

## [Unreleased]

## [0.6.0] - 2026-11-06

### Added
- Re export of the `sql` tag, so boxes can run a raw statement without importing kysely.

## [0.5.0] - 2026-11-06

### Added
- Migration `0004_daily_usage.sql`, owned by core-entitlements: `speech_recordings.duration_ms`, the function `local_day`, and the view `daily_usage` with one row per user and local day. The view uses `security_invoker`, so a learner sees only the own usage.
- Types `DailyUsageView` and `Views`. Views are reached with `db.withTables<Views>()`.
- The schema test now follows `alter table ... add column`.

## [0.4.0] - 2026-11-06

### Fixed
- Migration `0003_policy_fixes.sql` corrects access defects in 0001: `users` now has row security and the app role reads only the own row and cannot write it; the app role has no access to `schema_migrations`; `events` accepts anonymous inserts; `feature_flags.updated_at` is maintained by a trigger; grants are explicit from now on.
- Five integration tests prove each fix as role `stufen_app` on a real Postgres.

## [0.3.0] - 2026-11-06

### Added
- Migration `0002_auth.sql`, owned by core-auth: `sessions`, `accounts`, `verifications` with indexes and updated_at triggers. Row security is enabled with no policy and no grant for `stufen_app`, so only the owner connection reads or writes them.
- Typed interfaces for the three tables in `DB` and `TABLE_NAMES`. The schema test now reads every migration file.
- Integration test: a learner inside `withUser` cannot see session rows, the owner connection can.

## [0.2.0] - 2026-11-05

### Added

- `DB` is now a typed Kysely table map: one hand written interface per table in `0001_init.sql`, with defaults, nullability, the `skill` enum and check constraint values taken from the SQL.
- `TABLE_NAMES`, the list of every key of `DB`. It fails to compile when a table is missing or extra.
- `withUser` moved to `src/with-user.ts`. It now accepts `null` for a request with nobody signed in, rejects a user id that is not a uuid, and runs `set local role stufen_app` so row level security applies even when the connection user owns the tables.
- A clear error when the connection user may not switch to `stufen_app`. The message names the fix: `grant stufen_app to "<login user>"`.
- Type exports for adapters in other boxes: `Database`, `DatabaseTransaction`, `Row`, `NewRow`, `RowPatch`, `TableName`, `JsonValue`, `Skill`, `CefrLevel` and the table interfaces.
- `tests/schema.test.ts` compares table and column names with the migration. `tests/with-user.test.ts` checks statement order and errors with a fake driver. `tests/with-user.integration.test.ts` checks row level security on a real Postgres when `DATABASE_URL` is set.

### Changed

- `DB` no longer has a `schema_migrations` key. Only the migration runner touches that table.
- Inside `withUser` the current role is `stufen_app`, so `fn` can do only what the grants and policies in the migrations allow. Before, it ran as the connection user.

## [0.1.0] - 2026-09-09

- Added `createDb(url)` over Kysely and pg.
- Added `migrate(db, dir)`: numbered SQL files, `schema_migrations` ledger, one transaction per file, idempotent.
- Added `withUser(db, userId, fn)`: transaction with `app.user_id` set for row level security.
- Added `DB` table map with placeholder row types.
- Moved `0001_init.sql` here from `supabase/migrations/`. Users table for core-auth, `ensure_profile(uuid)` replaces the auth trigger, RLS keyed on `app.user_id` and granted to role `stufen_app`.
